/**
 * lib/stockfish.ts — Stockfish 17.1 (WASM) 클라이언트 엔진 매니저.
 *
 * - Stockfish 17.1 Lite (NNUE 내장, 싱글스레드) 바이너리를 public/stockfish/에
 *   셀프호스팅해서 같은 오리진의 Web Worker로 로드한다.
 *   (크로스오리진 Worker 스크립트는 브라우저 보안 정책상 차단되므로
 *   unpkg 같은 CDN URL을 Worker에 직접 넘기면 로딩이 실패한다)
 * - 싱글스레드라 COOP/COEP 헤더가 필요 없다.
 * - UCI 프로토콜로 통신하며, 한 번에 하나의 탐색만 수행하도록 직렬화한다.
 * - SSR 안전: Worker 생성은 브라우저에서만, 실패 시 예외를 던져서
 *   호출자가 구형 자체 엔진(lib/engine.ts)으로 폴백할 수 있게 한다.
 */

const STOCKFISH_JS_URL = '/stockfish/stockfish-17.1-lite-single-03e3232.js';

/** 메이트 표시용 센티폰 센티넬 (lib/engine.ts의 MATE_SCORE와 동일) */
export const STOCKFISH_MATE_CP = 100000;

export interface AnalysisResult {
  /** 최선수 UCI ("e2e4", 프로모션 포함 "e7e8q"); 수 없음(스테일메이트 등)이면 null */
  bestMoveUci: string | null;
  /** 백 관점 센티폰 평가. ±100000 = 메이트 */
  scoreCpWhite: number;
  /** 수를 둔 측 관점 메이트까지 남은 수(1 = 다음 수 메이트); 메이트 없으면 null */
  mateIn: number | null;
}

export interface EngineLevel {
  id: string;
  /** "레벨 1" ~ "레벨 15" */
  label: string;
  /** UI 표시 숫자: "1".."15" */
  display: string;
  /** Stockfish Skill Level (0~20). 20 = 제한 없음(풀파워) */
  skill: number;
  /** 수당 생각 시간 (밀리초). 깊이 탐색 대신 시간제로 두어 체감 속도를 일정하게 유지 */
  movetimeMs: number;
  /** 탐색 깊이 상한 (안전장치) */
  depth: number;
}

/**
 * 컴퓨터 레벨 정의 (리체스식 1~15).
 * - 낮은 레벨: Skill Level로 실력을 제한 + 짧은 생각 시간
 * - 레벨 15: Skill 제한 없는 풀파워 Stockfish 17.1
 * - go movetime 기반이라 모바일에서도 응답 속도가 일정하다.
 */
export const ENGINE_LEVELS: EngineLevel[] = [
  { id: '1', label: '레벨 1', display: '1', skill: 0, movetimeMs: 100, depth: 11 },
  { id: '2', label: '레벨 2', display: '2', skill: 1, movetimeMs: 150, depth: 12 },
  { id: '3', label: '레벨 3', display: '3', skill: 3, movetimeMs: 200, depth: 13 },
  { id: '4', label: '레벨 4', display: '4', skill: 4, movetimeMs: 300, depth: 14 },
  { id: '5', label: '레벨 5', display: '5', skill: 6, movetimeMs: 400, depth: 15 },
  { id: '6', label: '레벨 6', display: '6', skill: 7, movetimeMs: 500, depth: 16 },
  { id: '7', label: '레벨 7', display: '7', skill: 9, movetimeMs: 650, depth: 17 },
  { id: '8', label: '레벨 8', display: '8', skill: 10, movetimeMs: 800, depth: 18 },
  { id: '9', label: '레벨 9', display: '9', skill: 11, movetimeMs: 1000, depth: 19 },
  { id: '10', label: '레벨 10', display: '10', skill: 13, movetimeMs: 1200, depth: 20 },
  { id: '11', label: '레벨 11', display: '11', skill: 14, movetimeMs: 1400, depth: 21 },
  { id: '12', label: '레벨 12', display: '12', skill: 16, movetimeMs: 1700, depth: 22 },
  { id: '13', label: '레벨 13', display: '13', skill: 17, movetimeMs: 2000, depth: 23 },
  { id: '14', label: '레벨 14', display: '14', skill: 19, movetimeMs: 2400, depth: 24 },
  { id: '15', label: '레벨 15', display: '15', skill: 20, movetimeMs: 3000, depth: 25 },
];

export function getEngineLevel(id: string): EngineLevel {
  return ENGINE_LEVELS.find((l) => l.id === id) ?? ENGINE_LEVELS[4];
}

export interface AnalyzeOptions {
  depth?: number;
  movetimeMs?: number;
  /** 0~20, 생략 시 마지막 설정 유지 */
  skill?: number;
  timeoutMs?: number;
}

/** 진행 중인 탐색 1건. 점수는 모두 "수를 둔 측" 관점. */
interface PendingSearch {
  turn: 'w' | 'b';
  settled: boolean;
  /** 마지막 info의 score cp (수를 둔 측 관점) */
  lastCp: number | null;
  /** 마지막 info의 score mate (수를 둔 측 관점, 양수=메이트 함) */
  lastMate: number | null;
  finish: (r: AnalysisResult) => void;
  fail: (e: Error) => void;
}

class StockfishEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private broken = false;
  private queue: Array<() => void> = [];
  private busy = false;
  private current: PendingSearch | null = null;
  private skill: number | null = null;

  get isBroken(): boolean {
    return this.broken;
  }

  /** Worker 생성 + 'uci' 핸드셰이크. 실패하면 broken 플래그를 세운다. */
  private ensure(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('stockfish: SSR에서는 사용할 수 없습니다'));
    }
    if (this.broken) return Promise.reject(new Error('stockfish: 사용할 수 없음'));
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(STOCKFISH_JS_URL);
      } catch (e) {
        this.broken = true;
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const fail = (msg: string) => {
        this.broken = true;
        try {
          w.terminate();
        } catch {
          /* 무시 */
        }
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('stockfish: uci 핸드셰이크 시간 초과'), 20000);
      w.onmessage = (ev: MessageEvent) => {
        const line = String(ev.data ?? '');
        if (line.trim() === 'uciok') {
          clearTimeout(timer);
          this.worker = w;
          w.onmessage = (e: MessageEvent) => this.handleLine(String(e.data ?? ''));
          w.onerror = () => {
            this.broken = true;
            this.current?.fail(new Error('stockfish worker 오류'));
            this.current = null;
          };
          try {
            w.postMessage('setoption name Ponder value false');
          } catch {
            /* 무시 */
          }
          resolve();
        }
      };
      w.onerror = () => {
        clearTimeout(timer);
        fail('stockfish worker를 시작할 수 없습니다');
      };
      try {
        w.postMessage('uci');
      } catch (e) {
        clearTimeout(timer);
        fail(e instanceof Error ? e.message : 'stockfish: uci 전송 실패');
      }
    });
    return this.readyPromise;
  }

  private handleLine(line: string): void {
    const cur = this.current;
    if (!cur || cur.settled) return;

    if (line.startsWith('bestmove')) {
      const token = line.split(' ')[1];
      const bestMoveUci = !token || token === '(none)' ? null : token;
      cur.settled = true;
      this.current = null;
      cur.finish({
        bestMoveUci,
        scoreCpWhite: Math.round(this.toWhite(cur)),
        mateIn: cur.lastMate != null && cur.lastMate > 0 ? Math.abs(cur.lastMate) : null,
      });
      return;
    }

    const m = line.match(/score (cp|mate) (-?\d+)/);
    if (m) {
      if (m[1] === 'cp') {
        cur.lastCp = parseInt(m[2], 10);
      } else {
        cur.lastMate = parseInt(m[2], 10);
      }
    }
  }

  /** 탐색 결과를 백 관점 센티폰으로 변환 */
  private toWhite(cur: PendingSearch): number {
    if (cur.lastCp != null) {
      return cur.turn === 'w' ? cur.lastCp : -cur.lastCp;
    }
    if (cur.lastMate != null) {
      // mate > 0: 수를 둔 측이 메이트 / mate < 0: 당함
      const moverMates = cur.lastMate > 0;
      const whiteMates = moverMates === (cur.turn === 'w');
      return whiteMates ? STOCKFISH_MATE_CP : -STOCKFISH_MATE_CP;
    }
    // 점수 없이 종료 (스테일메이트 등) → 무승부 취급
    return 0;
  }

  private pump(): void {
    if (this.busy) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    job();
  }

  private runSearch(fen: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
    return new Promise<AnalysisResult>((resolve, reject) => {
      const w = this.worker;
      if (!w) {
        reject(new Error('stockfish worker가 준비되지 않았습니다'));
        return;
      }
      const turn: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w';
      const timeoutMs = opts.timeoutMs ?? 25000;

      const pending: PendingSearch = {
        turn,
        settled: false,
        lastCp: null,
        lastMate: null,
        finish: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        fail: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };

      const timer = setTimeout(() => {
        if (pending.settled) return;
        pending.settled = true;
        try {
          w.postMessage('stop');
        } catch {
          /* 무시 */
        }
        // stop 뒤 bestmove가 오면 handleLine이 무시하므로 여기서 직접 마무리
        setTimeout(() => {
          if (this.current === pending) this.current = null;
          if (pending.lastCp != null || pending.lastMate != null) {
            resolve({
              bestMoveUci: null,
              scoreCpWhite: Math.round(this.toWhite(pending)),
              mateIn:
                pending.lastMate != null && pending.lastMate > 0
                  ? Math.abs(pending.lastMate)
                  : null,
            });
          } else {
            reject(new Error('stockfish: 탐색 시간 초과'));
          }
        }, 1200);
      }, timeoutMs);

      this.current = pending;

      try {
        if (opts.skill != null && opts.skill !== this.skill) {
          w.postMessage(`setoption name Skill Level value ${opts.skill}`);
          this.skill = opts.skill;
        }
        w.postMessage(`position fen ${fen}`);
        w.postMessage(
          opts.movetimeMs != null ? `go movetime ${opts.movetimeMs}` : `go depth ${opts.depth ?? 14}`,
        );
      } catch (e) {
        clearTimeout(timer);
        if (this.current === pending) this.current = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /** FEN局面을 분석한다. 동시 호출은 큐에서 순서대로 처리된다. */
  analyze(fen: string, opts: AnalyzeOptions = {}): Promise<AnalysisResult> {
    if (this.broken) return Promise.reject(new Error('stockfish: 사용할 수 없음'));
    return this.ensure().then(
      () =>
        new Promise<AnalysisResult>((resolve, reject) => {
          this.queue.push(() => {
            this.runSearch(fen, opts).then(
              (r) => {
                this.busy = false;
                this.pump();
                resolve(r);
              },
              (e) => {
                this.busy = false;
                this.pump();
                reject(e);
              },
            );
          });
          this.pump();
        }),
    );
  }
}

let singleton: StockfishEngine | null = null;
/** 대국 착수 전용 엔진 (평가 큐와 분리 — 수 평가가 착수를 막지 않게) */
let gameSingleton: StockfishEngine | null = null;

function getEngine(): StockfishEngine {
  if (!singleton) singleton = new StockfishEngine();
  return singleton;
}

function getGameEngine(): StockfishEngine {
  if (!gameSingleton) gameSingleton = new StockfishEngine();
  return gameSingleton;
}

/**
 * FEN局面을 Stockfish로 분석한다. (수 평가·평가 막대용)
 * 실패하면 예외를 던진다 — 호출자가 구형 엔진으로 폴백해야 한다.
 */
export function analyzePosition(fen: string, opts: AnalyzeOptions = {}): Promise<AnalysisResult> {
  return getEngine().analyze(fen, opts);
}

/**
 * 컴퓨터의 다음 수를 구한다. (대국 착수 전용)
 * 수 평가와 별도 Worker를 쓰므로, 평가 분석이 진행 중이어도
 * movetimeMs 안에 바로 응수한다.
 */
export function analyzeGamePosition(
  fen: string,
  opts: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  return getGameEngine().analyze(fen, opts);
}

/** Stockfish를 (이번 세션에서) 사용할 수 없게 되었는지 여부 */
export function isStockfishBroken(): boolean {
  return singleton?.isBroken ?? false;
}
