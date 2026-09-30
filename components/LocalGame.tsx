'use client';

// ============================================================
// 로컬 대국: 한 기기에서 2인이 번갈아 두는 오프라인 모드
// - 로그인/DB 불필요, 엔진 없음
// - 불법 무브 모드는 로컬에서 누구나 사용 가능
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareHandlerArgs } from 'react-chessboard';
import { TIME_CONTROLS, CUSTOM_TC_ID } from '../lib/timeControl';
import { applyFreeMove, isPromotionSquare, isLegalChessMove } from '../lib/freeBoard';
import { evaluateMove } from '../lib/evalClient';
import { openingName } from '../lib/openings';
import { movesToPgn, downloadPgn } from '../lib/pgn';
import { playSound } from '../lib/sound';
import { getBoardTheme } from '../lib/boardTheme';
import { Clock } from './Clock';
import { MoveList } from './MoveList';
import { GameBottomBar } from './GameBottomBar';
import { PromotionPicker } from './PromotionPicker';
import { AccuracyRow } from './AccuracyRow';
import { MistakeReview } from './MistakeReview';
import { MoveBadge } from './MoveBadge';
import { CapturedPieces } from './CapturedPieces';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const UNTIMED_ID = 'untimed';

interface LocalMove {
  ply: number;
  san: string;
  uci: string;
  annotation: string | null;
  /** 수별 센티폰 손실 (정확도 계산용) */
  lossCp?: number | null;
  /** 이 수를 두기 전 FEN (실수 복습용) */
  fenBefore?: string;
  /** 이 수를 둔 뒤 평가 (백 관점 센티폰, 정확도 계산용) */
  evalAfterCp?: number;
}

interface Snapshot {
  posFen: string;
  moves: LocalMove[];
  clocks: { w: number; b: number };
  valid: boolean;
}

interface GameResult {
  title: string;
  detail: string;
}

export function LocalGame({
  tcId,
  customTc,
  onQuit,
  onRematch,
}: {
  tcId: string;
  customTc?: { baseMs: number; incMs: number; label: string };
  onQuit: () => void;
  onRematch: () => void;
}) {
  const untimed = tcId === UNTIMED_ID;
  const tc = tcId === CUSTOM_TC_ID && customTc ? customTc : TIME_CONTROLS.find((t) => t.id === tcId);

  const [posFen, setPosFen] = useState(STARTPOS);
  const [moves, setMoves] = useState<LocalMove[]>([]);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const displayFen =
    viewPly == null || viewPly >= moves.length
      ? posFen
      : (moves[viewPly]?.fenBefore ?? posFen);
  const [clocks, setClocks] = useState({ w: tc?.baseMs ?? 0, b: tc?.baseMs ?? 0 });
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [result, setResult] = useState<GameResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [illegalMode, setIllegalMode] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [, setTick] = useState(0);

  const chessRef = useRef<Chess | null>(null);
  const historyRef = useRef<Snapshot[]>([]);
  const resultRef = useRef<GameResult | null>(null);
  const posFenRef = useRef(STARTPOS);
  const movesRef = useRef<LocalMove[]>([]);
  const validRef = useRef(true);
  if (!chessRef.current) chessRef.current = new Chess();
  useEffect(() => {
    posFenRef.current = posFen;
  }, [posFen]);
  useEffect(() => {
    movesRef.current = moves;
  }, [moves]);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const endGame = (r: GameResult) => {
    if (resultRef.current) return;
    resultRef.current = r;
    setResult(r);
  };

  const pushHistory = () => {
    historyRef.current.push({
      posFen: posFenRef.current,
      moves: movesRef.current,
      clocks: { ...clocksRef.current },
      valid: validRef.current,
    });
  };
  const clocksRef = useRef(clocks);
  useEffect(() => {
    clocksRef.current = clocks;
  }, [clocks]);

  const checkGameOver = () => {
    const chess = chessRef.current;
    if (!chess || !validRef.current) return;
    const mover = posFenRef.current.split(' ')[1] === 'b' ? 'w' : 'b';    if (chess.isCheckmate()) {
      endGame({ title: `${mover === 'w' ? '백' : '흑'} 승리!`, detail: '체크메이트' });
    } else if (
      chess.isStalemate() ||
      chess.isThreefoldRepetition() ||
      chess.isInsufficientMaterial() ||
      chess.isDrawByFiftyMoves()
    ) {
      endGame({ title: '무승부', detail: '무승부 규정' });
    }
  };

  // ------------------------------------------------------------
  // 정상 수 적용
  // ------------------------------------------------------------
  const applyLegalMove = (from: string, to: string, promotion?: string): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return false;
    const beforeFen = posFenRef.current;
    pushHistory();
    let mv;
    try {
      mv = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      historyRef.current.pop();
      return false;
    }
    tickClock(posFenRef.current.split(' ')[1] === 'b' ? 'b' : 'w');
    const newFen = chess.fen();
    posFenRef.current = newFen;
    validRef.current = true;
    const entry: LocalMove = {
      ply: movesRef.current.length + 1,
      san: mv.san,
      uci: `${from}${to}${mv.promotion ?? ''}`,
      annotation: null,
      fenBefore: beforeFen,
    };
    movesRef.current = [...movesRef.current, entry];
    setMoves(movesRef.current);
    setFen(newFen);
    setViewPly(null);
    playSound(mv.captured ? 'capture' : 'move');
    if (chess.inCheck()) setTimeout(() => playSound('check'), 130);
    void fireEval(beforeFen, `${from}${to}${mv.promotion ?? ''}`, newFen, entry.ply);
    checkGameOver();
    return true;
  };

  // ------------------------------------------------------------
  // 수 평가 (Stockfish, 실시간) — 정확도/주석용
  // ------------------------------------------------------------
  const fireEval = async (beforeFen: string, uci: string, afterFen: string, ply: number) => {
    try {
      const res = await evaluateMove(beforeFen, uci, afterFen);
      if (resultRef.current) return;
      setMoves((prev) =>
        prev.map((m) =>
          m.ply === ply
            ? { ...m, annotation: res.annotation === '' ? null : res.annotation, lossCp: res.lossCp, evalAfterCp: Math.round(res.evalAfterCp) }
            : m,
        ),
      );
    } catch {
      /* 평가는 best-effort */
    }
  };

  const setFen = (f: string) => setPosFen(f);

  const tickClock = (mover: 'w' | 'b') => {
    if (untimed || !tc) return;
    const now = Date.now();
    const elapsed = now - lastAt;
    setClocks((prev) => {
      const next = { ...prev };
      if (mover === 'w') next.w = Math.max(0, prev.w - elapsed + tc.incMs);
      else next.b = Math.max(0, prev.b - elapsed + tc.incMs);
      return next;
    });
    setLastAt(now);
  };

  // ------------------------------------------------------------
  // 불법 무브 적용 (Admin/로컬 전용)
  // ------------------------------------------------------------
  const applyIllegalMove = (from: string, to: string, promotion?: string): boolean => {
    if (resultRef.current) return false;
    const newFen = applyFreeMove(posFenRef.current, from, to, promotion);
    if (!newFen) return false;
    pushHistory();
    tickClock(posFenRef.current.split(' ')[1] === 'b' ? 'b' : 'w');
    posFenRef.current = newFen;
    const chess = chessRef.current;
    let ok = false;
    if (chess) {
      try {
        chess.load(newFen);
        ok = true;
      } catch {
        ok = false;
      }
    }
    validRef.current = ok;
    // 불법 수: 기보는 좌표 표기로 깔끔하게, 주석은 무조건 '!!!' (슈퍼브릴리언트)
    const entry: LocalMove = {
      ply: movesRef.current.length + 1,
      san: `${from}-${to}${promotion ? '=' + promotion.toUpperCase() : ''}`,
      uci: `${from}${to}${promotion ?? ''}`,
      annotation: '!!!',
    };
    movesRef.current = [...movesRef.current, entry];
    setMoves(movesRef.current);
    setPosFen(newFen);
    playSound('move');
    if (ok) checkGameOver();
    return true;
  };

  const tryMove = (from: string, to: string): boolean => {
    // 비정상 포지션에서는 정상 모드 입력 차단 (불법 모드로는 정리 가능)
    if (!illegalMode && !validRef.current) return false;
    if (illegalMode) {
      if (isPromotionSquare(posFenRef.current, from, to)) {
        setPromo({ from, to });
        return true;
      }
      // 합법 수면 정상 기보(SAN)로, 불법 수면 자유 이동(기보에 !!!)
      if (isLegalChessMove(posFenRef.current, from, to)) {
        return applyLegalMove(from, to, undefined);
      }
      return applyIllegalMove(from, to, undefined);
    }
    const chess = chessRef.current;
    if (!chess) return false;
    // 정상 모드 프로모션: 선택기 표시
    try {
      const mv = chess.moves({ square: from as Square, verbose: true }) as { to: string; promotion?: string }[];
      if (mv.some((m) => m.to === to && m.promotion)) {
        setPromo({ from, to });
        return true;
      }
    } catch {
      /* 무시 */
    }
    return applyLegalMove(from, to, undefined);
  };

  // ------------------------------------------------------------
  // 입력 핸들러
  // ------------------------------------------------------------
  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (resultRef.current || !targetSquare) return false;
    setSelected(null);
    if (promo) return false;
    return tryMove(sourceSquare, targetSquare);
  };

  const onSquareClick = ({ square, piece }: SquareHandlerArgs): void => {
    if (resultRef.current || promo) return;
    const turn = posFenRef.current.split(' ')[1] === 'b' ? 'b' : 'w';
    if (selected) {
      setSelected(null);
      if (square !== selected) tryMove(selected, square);
      return;
    }
    if (!piece) return;
    const color = (piece.pieceType[0]?.toLowerCase() ?? '') as 'w' | 'b';
    if (illegalMode || color === turn) setSelected(square);
  };

  const undo = () => {
    if (resultRef.current) return;
    const snap = historyRef.current.pop();
    if (!snap) return;
    posFenRef.current = snap.posFen;
    movesRef.current = snap.moves;
    validRef.current = snap.valid;
    const chess = chessRef.current;
    if (chess && snap.valid) {
      try {
        chess.load(snap.posFen);
      } catch {
        /* 무시 */
      }
    }
    setPosFen(snap.posFen);
    setMoves(snap.moves);
    setClocks(snap.clocks);
    setLastAt(Date.now());
    setSelected(null);
  };

  const resign = (color: 'w' | 'b') => {
    if (resultRef.current) return;
    if (!window.confirm(`${color === 'w' ? '백' : '흑'}이 기권하시겠습니까?`)) return;
    endGame({ title: `${color === 'w' ? '흑' : '백'} 승리!`, detail: '기권' });
  };

  // ------------------------------------------------------------
  // 시계
  // ------------------------------------------------------------
  useEffect(() => {
    if (untimed) return;
    const iv = setInterval(() => {
      if (resultRef.current) return;
      setTick((t) => t + 1);
      const now = Date.now();
      const elapsed = now - lastAt;
      const turn = posFenRef.current.split(' ')[1] === 'b' ? 'b' : 'w';
      const wLeft = turn === 'w' ? clocksRef.current.w - elapsed : clocksRef.current.w;
      const bLeft = turn === 'b' ? clocksRef.current.b - elapsed : clocksRef.current.b;
      if ((turn === 'w' && wLeft <= 0) || (turn === 'b' && bLeft <= 0)) {
        const loser = turn;
        endGame({ title: `${loser === 'w' ? '흑' : '백'} 승리!`, detail: '시간 초과' });
      }
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAt, untimed, result]);

  // ------------------------------------------------------------
  // 파생 상태
  // ------------------------------------------------------------
  const nowMs = Date.now();
  const elapsedNow = untimed || result ? 0 : nowMs - lastAt;
  const turnNow = posFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const wMs = turnNow === 'w' && !result ? Math.max(0, clocks.w - elapsedNow) : clocks.w;
  const bMs = turnNow === 'b' && !result ? Math.max(0, clocks.b - elapsedNow) : clocks.b;
  const orientation = flipped ? 'black' : 'white';

  const viewedMove = viewPly != null ? moves[viewPly - 1] : undefined;
  const lastUci = (viewedMove ?? moves[moves.length - 1])?.uci;
  const squareStyles: Record<string, CSSProperties> = {};
  if (lastUci && lastUci.length >= 4) {
    const hl: CSSProperties = { backgroundColor: 'rgba(155, 199, 0, 0.45)' };
    squareStyles[lastUci.slice(0, 2)] = hl;
    squareStyles[lastUci.slice(2, 4)] = hl;
  }
  if (selected) {
    squareStyles[selected] = { backgroundColor: 'rgba(20, 120, 220, 0.45)' };
    if (!illegalMode) {
      const chess = chessRef.current;
      if (chess && validRef.current) {
        try {
          for (const m of chess.moves({ square: selected as Square, verbose: true }) as { to: string }[]) {
            squareStyles[m.to] = {
              backgroundImage: 'radial-gradient(circle, rgba(20,120,220,0.55) 22%, transparent 24%)',
            };
          }
        } catch {
          /* 무시 */
        }
      }
    }
  }

  const canPlay = !result && !promo && viewPly == null && (illegalMode || validRef.current);

  // ←/→ 키로 기보 탐색
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      setViewPly((v) => {
        const cur = v ?? movesRef.current.length;
        const next = e.key === 'ArrowLeft' ? cur - 1 : cur + 1;
        if (next < 0 || next > movesRef.current.length) return v;
        return next === movesRef.current.length ? null : next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const opening = openingName(moves.map((m) => m.san));
  const [boardTheme, setBoardTheme] = useState(getBoardTheme);
  useEffect(() => {
    const onFocus = () => setBoardTheme(getBoardTheme());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28">
      {illegalMode && (
        <div className="mx-auto mb-2 w-full max-w-[640px] rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-center text-xs font-semibold text-amber-300">
          불법 무브 모드 ON · 양쪽 기물을 어디로든 움직일 수 있습니다
          {!validRef.current && ' · 현재 포지션은 정상 규칙으로 둘 수 없습니다'}
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="mx-auto w-full max-w-[640px] flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex-1">
              {untimed ? (
                <div className="rounded-md bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200">
                  흑 (위)
                </div>
              ) : (
                <Clock ms={orientation === 'white' ? bMs : wMs} active={!result && turnNow === 'b'} label={orientation === 'white' ? '흑' : '백'} />
              )}
            </div>
            <CapturedPieces fen={posFen} byWhite={orientation !== 'white'} />
          </div>
          <div className="relative overflow-hidden rounded-lg shadow-2xl">
            <Chessboard
              options={{
                position: displayFen,
                boardOrientation: orientation,
                allowDragging: canPlay,
                onPieceDrop,
                onSquareClick,
                squareStyles,
                darkSquareStyle: { backgroundColor: boardTheme.dark },
                lightSquareStyle: { backgroundColor: boardTheme.light },
                showNotation: true,
                animationDurationInMs: 150,
              }}
            />
            {(() => {
              const shown = viewPly != null ? moves[viewPly - 1] : moves[moves.length - 1];
              return shown && shown.annotation ? (
                <MoveBadge uci={shown.uci} annotation={shown.annotation} orientation={orientation} />
              ) : null;
            })()}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex-1">
              {untimed ? (
                <div className="rounded-md bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200">
                  백 (아래)
                </div>
              ) : (
                <Clock ms={orientation === 'white' ? wMs : bMs} active={!result && turnNow === 'w'} label={orientation === 'white' ? '백' : '흑'} />
              )}
            </div>
            <CapturedPieces fen={posFen} byWhite={orientation === 'white'} />
          </div>

          {!result && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => resign('w')}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                백 기권
              </button>
              <button
                onClick={() => resign('b')}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                흑 기권
              </button>
            </div>
          )}
        </div>

        <aside className="flex w-full gap-3 lg:w-80">
          <div className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-neutral-800 bg-[#1b1a17]">
            {result ? (
              <div className="border-b border-neutral-800 px-4 py-3 text-center">
                <p className="text-xl font-bold text-neutral-100">{result.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{result.detail}</p>
                <AccuracyRow moves={moves} />
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      const sans = moves.map((m) => m.san);
                      downloadPgn(movesToPgn(sans), `local-game-${Date.now()}.pgn`);
                    }}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    PGN 저장
                  </button>
                  <button
                    onClick={() => setShowReview(true)}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    실수 복습
                  </button>
                  <Link
                    href={`/analysis?pgn=${encodeURIComponent(movesToPgn(moves.map((m) => m.san)))}`}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    분석판에서 보기
                  </Link>
                </div>
              </div>
            ) : (
              <div className="border-b border-neutral-800 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-neutral-300">로컬 대국</p>
                {opening && (
                  <p className="mt-0.5 text-xs font-medium text-[#3692e7]">{opening}</p>
                )}
                <p className="mt-0.5 text-xs text-neutral-500">
                  {!validRef.current
                    ? '불법 포지션: ... 메뉴에서 무르기로 되돌리세요'
                    : `${turnNow === 'w' ? '백' : '흑'}의 차례입니다`}
                </p>
              </div>
            )}
            <div className="max-h-[380px] flex-1 overflow-y-auto">
              <MoveList
                moves={moves as unknown as import('../lib/db').Move[]}
                selectedPly={viewPly}
                onSelectPly={setViewPly}
              />
            </div>
          </div>
        </aside>
      </div>

      {promo && (
        <PromotionPicker
          color={posFen.split(' ')[1] === 'b' ? 'b' : 'w'}
          allowKing={illegalMode}
          onPick={(p) => {
            const { from, to } = promo;
            setPromo(null);
            if (!p) return;
            if (illegalMode) {
              // 합법 프로모션이면 정상 SAN, 불법이면 자유 이동(!!!)
              if (isLegalChessMove(posFen, from, to, p)) applyLegalMove(from, to, p);
              else applyIllegalMove(from, to, p);
            } else applyLegalMove(from, to, p);
          }}
        />
      )}

      <GameBottomBar
        onResign={() => resign(turnNow)}
        onUndo={undo}
        canUndo={historyRef.current.length > 0 && !result}
        illegalMode={illegalMode}
        canUseIllegal={true}
        onToggleIllegal={() => {
          setIllegalMode((v) => !v);
          setSelected(null);
        }}
        onFlipBoard={() => setFlipped((v) => !v)}
        onQuit={onQuit}
        gameOver={!!result}
        onRematch={onRematch}
      />

      {showReview && (
        <MistakeReview moves={moves} onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
