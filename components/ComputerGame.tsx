'use client';

// ============================================================
// 컴퓨터와 대결: Stockfish 17.1 WASM과의 로컬 대국
// - DB를 사용하지 않는 1인용 모드 (로그인 불필요)
// - 매 수는 Stockfish eval로 실시간 평가 (!!, !, !?, ?!, ?, ??)
// - 레벨 1~15 (리체스식): movetime 기반이라 체감 속도가 일정
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareHandlerArgs } from 'react-chessboard';
import { evaluateMove } from '../lib/evalClient';
import { analyzeGamePosition, getEngineLevel } from '../lib/stockfish';
import { TIME_CONTROLS, CUSTOM_TC_ID } from '../lib/timeControl';
import { applyFreeMove, isPromotionSquare } from '../lib/freeBoard';
import { isAdmin } from '../lib/admin';
import { useAuth } from './AuthProvider';
import { Clock } from './Clock';
import { EvalBar } from './EvalBar';
import { MoveList } from './MoveList';
import { GameBottomBar } from './GameBottomBar';
import { PromotionPicker } from './PromotionPicker';
import type { Move } from '../lib/db';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const UNTIMED_ID = 'untimed';

interface LocalMove {
  ply: number;
  san: string;
  uci: string;
  annotation: string | null;
}

interface GameResult {
  title: string;
  detail: string;
}

interface Snapshot {
  fen: string;
  moves: LocalMove[];
  clocks: { w: number; b: number };
  valid: boolean;
}

interface ComputerGameProps {
  levelId: string;
  playerColor: 'w' | 'b';
  /** TIME_CONTROLS id, 'custom', 또는 'untimed' */
  tcId: string;
  /** tcId === 'custom'일 때 사용 */
  customTc?: { baseMs: number; incMs: number; label: string };
  onQuit: () => void;
  onRematch: () => void;
}

export function ComputerGame({ levelId, playerColor, tcId, customTc, onQuit, onRematch }: ComputerGameProps) {
  const level = getEngineLevel(levelId);
  const engineColor: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
  const untimed = tcId === UNTIMED_ID;
  const tc =
    tcId === CUSTOM_TC_ID && customTc
      ? customTc
      : TIME_CONTROLS.find((t) => t.id === tcId);

  const [fen, setFen] = useState(STARTPOS);
  const [moves, setMoves] = useState<LocalMove[]>([]);
  const [clocks, setClocks] = useState({ w: tc?.baseMs ?? 0, b: tc?.baseMs ?? 0 });
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [thinking, setThinking] = useState(false);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [illegalMode, setIllegalMode] = useState(false);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [, setTick] = useState(0);

  const { user, profile } = useAuth();
  const admin = isAdmin(user, profile);

  const chessRef = useRef<Chess | null>(null);
  const movesRef = useRef<LocalMove[]>([]);
  const thinkingRef = useRef(false);
  const resultRef = useRef<GameResult | null>(null);
  const validRef = useRef(true);
  const historyRef = useRef<Snapshot[]>([]);
  const clocksRef = useRef({ w: 0, b: 0 });
  if (!chessRef.current) chessRef.current = new Chess();
  useEffect(() => {
    movesRef.current = moves;
  }, [moves]);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    clocksRef.current = clocks;
  }, [clocks]);

  const endGame = (r: GameResult) => {
    if (resultRef.current) return;
    resultRef.current = r;
    setResult(r);
  };

  // ------------------------------------------------------------
  // 수 평가 (Stockfish, 실시간)
  // ------------------------------------------------------------
  const fireEval = async (beforeFen: string, uci: string, afterFen: string, ply: number) => {
    try {
      const res = await evaluateMove(beforeFen, uci, afterFen);
      if (resultRef.current) return;
      setMoves((prev) =>
        prev.map((m) =>
          m.ply === ply
            ? { ...m, annotation: res.annotation === '' ? null : res.annotation }
            : m,
        ),
      );
      setEvalCp(Math.round(res.evalAfterCp));
    } catch {
      /* 평가는 best-effort */
    }
  };

  // ------------------------------------------------------------
  // 히스토리 (무르기용 스냅샷)
  // ------------------------------------------------------------
  const pushHistory = (fen: string) => {
    historyRef.current.push({
      fen,
      moves: movesRef.current,
      clocks: { ...clocksRef.current },
      valid: validRef.current,
    });
  };

  const restoreSnap = (snap: Snapshot) => {
    const chess = chessRef.current;
    validRef.current = snap.valid;
    if (chess && snap.valid) {
      try {
        chess.load(snap.fen);
      } catch {
        /* 무시 */
      }
    }
    setFen(snap.fen);
    setMoves(snap.moves);
    movesRef.current = snap.moves;
    setClocks(snap.clocks);
    setLastAt(Date.now());
    setSelected(null);
  };

  /** 무르기: 마지막 한 라운드(엔진 수 + 내 수)를 되돌린다 */
  const undo = () => {
    if (resultRef.current || thinkingRef.current) return;
    const h = historyRef.current;
    if (h.length === 0) return;
    let snap = h.pop()!;
    // 되돌린局面이 아직 내 턴이 아니면(내 수를 되돌린 것) 한 수 더
    if (snap.fen.split(' ')[1] !== playerColor && h.length > 0) {
      snap = h.pop()!;
    }
    restoreSnap(snap);
  };

  // ------------------------------------------------------------
  // 수 적용 (플레이어/엔진 공용)
  // ------------------------------------------------------------
  const applyMove = (from: string, to: string, promotion: string | undefined): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return false;
    const beforeFen = chess.fen();
    pushHistory(beforeFen);
    let mv;
    try {
      mv = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      historyRef.current.pop();
      return false;
    }
    const now = Date.now();
    const mover = beforeFen.split(' ')[1] === 'b' ? 'b' : 'w';
    if (!untimed && tc) {
      const elapsed = now - lastAt;
      setClocks((prev) => {
        const next = { ...prev };
        if (mover === 'w') next.w = Math.max(0, prev.w - elapsed + tc.incMs);
        else next.b = Math.max(0, prev.b - elapsed + tc.incMs);
        return next;
      });
    }
    setLastAt(now);
    const afterFen = chess.fen();
    const ply = movesRef.current.length + 1;
    const uci = `${from}${to}${mv.promotion ?? ''}`;
    const entry: LocalMove = { ply, san: mv.san, uci, annotation: null };
    movesRef.current = [...movesRef.current, entry];
    setMoves(movesRef.current);
    setFen(afterFen);

    // 종료 판정
    if (chess.isCheckmate()) {
      const winner = mover === 'w' ? 'w' : 'b';
      endGame(
        winner === playerColor
          ? { title: '승리!', detail: '체크메이트' }
          : { title: '패배', detail: '체크메이트' },
      );
    } else if (
      chess.isStalemate() ||
      chess.isThreefoldRepetition() ||
      chess.isInsufficientMaterial() ||
      chess.isDrawByFiftyMoves()
    ) {
      endGame({ title: '무승부', detail: '무승부 규정' });
    }

    void fireEval(beforeFen, uci, afterFen, ply);
    return true;
  };
  const applyMoveRef = useRef(applyMove);
  applyMoveRef.current = applyMove;

  // ------------------------------------------------------------
  // 불법 무브 적용 (Admin 전용)
  // ------------------------------------------------------------
  const applyFreeMoveToGame = (from: string, to: string, promotion?: string): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return false;
    const beforeFen = fen;
    const newFen = applyFreeMove(beforeFen, from, to, promotion);
    if (!newFen) return false;
    pushHistory(beforeFen);

    const now = Date.now();
    if (!untimed && tc) {
      const elapsed = now - lastAt;
      setClocks((prev) => {
        const next = { ...prev };
        if (playerColor === 'w') next.w = Math.max(0, prev.w - elapsed + tc.incMs);
        else next.b = Math.max(0, prev.b - elapsed + tc.incMs);
        return next;
      });
    }
    setLastAt(now);

    let ok = false;
    try {
      chess.load(newFen);
      ok = true;
    } catch {
      ok = false;
    }
    validRef.current = ok;

    const ply = movesRef.current.length + 1;
    const entry: LocalMove = {
      ply,
      san: `${from}-${to}${promotion ? '=' + promotion.toUpperCase() : ''}${ok ? '' : ' (자유)'}`,
      uci: `${from}${to}${promotion ?? ''}`,
      annotation: null,
    };
    movesRef.current = [...movesRef.current, entry];
    setMoves(movesRef.current);
    setFen(newFen);

    if (ok) {
      if (chess.isCheckmate()) {
        endGame({ title: '승리!', detail: '체크메이트' });
      } else if (
        chess.isStalemate() ||
        chess.isThreefoldRepetition() ||
        chess.isInsufficientMaterial() ||
        chess.isDrawByFiftyMoves()
      ) {
        endGame({ title: '무승부', detail: '무승부 규정' });
      }
    }
    return true;
  };
  const applyFreeMoveRef = useRef(applyFreeMoveToGame);
  applyFreeMoveRef.current = applyFreeMoveToGame;

  /** 프로모션 선택이 필요한 수인지 */
  const needsPromotionPick = (from: string, to: string): boolean => {
    if (illegalMode) return isPromotionSquare(fen, from, to);
    const chess = chessRef.current;
    if (!chess) return false;
    try {
      const ms = chess.moves({ square: from as Square, verbose: true }) as {
        to: string;
        promotion?: string;
      }[];
      return ms.some((m) => m.to === to && m.promotion);
    } catch {
      return false;
    }
  };

  const tryPlayerMove = (from: string, to: string): boolean => {
    if (needsPromotionPick(from, to)) {
      setPromo({ from, to });
      return true;
    }
    if (illegalMode) return applyFreeMoveRef.current(from, to, undefined);
    return applyMoveRef.current(from, to, undefined);
  };

  // ------------------------------------------------------------
  // 플레이어 수 두기 (드래그)
  // ------------------------------------------------------------
  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current || !targetSquare || promo) return false;
    // 비정상 포지션에서는 정상 모드 입력 차단 (불법 모드로는 정리 가능)
    if (!illegalMode && !validRef.current) return false;
    if (chess.turn() !== playerColor && !illegalMode) return false;
    setSelected(null);
    return tryPlayerMove(sourceSquare, targetSquare);
  };

  // ------------------------------------------------------------
  // 플레이어 수 두기 (클릭-클릭)
  // ------------------------------------------------------------
  const [selected, setSelected] = useState<string | null>(null);

  const onSquareClick = ({ square, piece }: SquareHandlerArgs): void => {
    const chess = chessRef.current;
    if (!chess || resultRef.current || promo) return;
    // 비정상 포지션에서는 정상 모드 입력 차단 (불법 모드로는 정리 가능)
    if (!illegalMode && !validRef.current) return;
    if (chess.turn() !== playerColor && !illegalMode) return;
    if (selected) {
      setSelected(null);
      if (square !== selected) {
        // 선택된 기물 → 클릭한 칸으로 이동 시도 (불법이면 무시)
        tryPlayerMove(selected, square);
      }
      return;
    }
    // 불법 모드에서는 양쪽 기물 모두 선택 가능
    if (piece && (illegalMode || (piece.pieceType[0]?.toLowerCase() ?? '') === playerColor)) {
      setSelected(square);
    }
  };

  // ------------------------------------------------------------
  // 엔진 수 두기
  // ------------------------------------------------------------
  useEffect(() => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return;
    // 불법 포지션(킹 2개 등)에서는 엔진이 둘 수 없음 — Admin이 정리할 때까지 대기
    if (!validRef.current) return;
    if (chess.turn() !== engineColor || thinkingRef.current) return;
    let cancelled = false;
    thinkingRef.current = true;
    setThinking(true);
    (async () => {
      try {
        const res = await analyzeGamePosition(chess.fen(), {
          movetimeMs: level.movetimeMs,
          depth: level.depth,
          skill: level.skill,
          timeoutMs: 30000,
        });
        if (cancelled || resultRef.current) return;
        if (res.bestMoveUci && res.bestMoveUci.length >= 4) {
          const ok = applyMoveRef.current(
            res.bestMoveUci.slice(0, 2),
            res.bestMoveUci.slice(2, 4),
            res.bestMoveUci.slice(4) || undefined,
          );
          if (!ok) {
            endGame({ title: '무승부', detail: '엔진 오류' });
          }
        }
      } catch {
        if (!cancelled && !resultRef.current) {
          endGame({ title: '무승부', detail: '엔진을 불러오지 못했습니다' });
        }
      } finally {
        if (!cancelled) {
          thinkingRef.current = false;
          setThinking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, result]);

  // ------------------------------------------------------------
  // 시계
  // ------------------------------------------------------------
  useEffect(() => {
    if (untimed) return;
    const iv = setInterval(() => {
      if (resultRef.current) return;
      const chess = chessRef.current;
      if (!chess) return;
      setTick((t) => t + 1);
      const now = Date.now();
      const elapsed = now - lastAt;
      const turn = chess.turn();
      const wLeft = turn === 'w' ? clocks.w - elapsed : clocks.w;
      const bLeft = turn === 'b' ? clocks.b - elapsed : clocks.b;
      if ((turn === 'w' && wLeft <= 0) || (turn === 'b' && bLeft <= 0)) {
        const loser = turn;
        endGame(
          loser === playerColor
            ? { title: '패배', detail: '시간 초과' }
            : { title: '승리!', detail: '시간 초과' },
        );
      }
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAt, untimed, result]);

  const resign = () => {
    if (resultRef.current) return;
    if (!window.confirm('정말 기권하시겠습니까?')) return;
    endGame({ title: '패배', detail: '기권' });
  };

  // ------------------------------------------------------------
  // 파생 상태
  // ------------------------------------------------------------
  const nowMs = Date.now();
  const elapsedNow = untimed || result ? 0 : nowMs - lastAt;
  // 표시 중인 FEN 기준 턴 (불법 포지션에서도 정확)
  const turnNow = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const wMs = turnNow === 'w' && !result ? Math.max(0, clocks.w - elapsedNow) : clocks.w;
  const bMs = turnNow === 'b' && !result ? Math.max(0, clocks.b - elapsedNow) : clocks.b;

  // 보드 위쪽 = 상대(엔진), 아래쪽 = 나
  const topMs = playerColor === 'w' ? bMs : wMs;
  const bottomMs = playerColor === 'w' ? wMs : bMs;
  const topActive = !result && !untimed && turnNow === engineColor;
  const bottomActive = !result && !untimed && turnNow === playerColor;

  // 불법 모드에서는 비정상 포지션에서도 자유롭게 둘 수 있고(정리 가능),
  // 정상 모드에서는 비정상 포지션일 때 둘 수 없음 (무르기로 되돌려야 함)
  const canPlay =
    !result && !promo && (illegalMode || (validRef.current && turnNow === playerColor));

  const lastUci = moves[moves.length - 1]?.uci;
  const squareStyles: Record<string, CSSProperties> = {};
  if (lastUci && lastUci.length >= 4) {
    const hl: CSSProperties = { backgroundColor: 'rgba(155, 199, 0, 0.45)' };
    squareStyles[lastUci.slice(0, 2)] = hl;
    squareStyles[lastUci.slice(2, 4)] = hl;
  }
  // 클릭 선택 하이라이트 + 이동 가능 칸 점 표시 (정상 모드에서만)
  if (selected) {
    const chess = chessRef.current;
    squareStyles[selected] = { backgroundColor: 'rgba(20, 120, 220, 0.45)' };
    if (!illegalMode && validRef.current && chess) {
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
  const engineLabel = `Stockfish Lv.${level.display}${thinking ? ' · 생각 중…' : ''}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28">
      {illegalMode && (
        <div className="mx-auto mb-2 w-full max-w-[640px] rounded-md border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-center text-xs font-semibold text-amber-300">
          불법 무브 모드 ON · 양쪽 기물을 어디로든 움직일 수 있습니다
          {!validRef.current && ' · 현재 포지션은 정상 규칙으로 둘 수 없어 엔진이 대기 중입니다'}
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="mx-auto w-full max-w-[640px] flex-1">
          <div className="mb-2">
            {untimed ? (
              <div className="rounded-md bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200">
                {engineLabel}
              </div>
            ) : (
              <Clock ms={topMs} active={topActive} label={engineLabel} />
            )}
          </div>
          <div className="overflow-hidden rounded-lg shadow-2xl">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: (playerColor === 'b') !== flipped ? 'black' : 'white',
                allowDragging: canPlay,
                canDragPiece: ({ piece }) =>
                  canPlay &&
                  (illegalMode || (piece.pieceType[0]?.toLowerCase() ?? '') === playerColor),
                onPieceDrop,
                onSquareClick,
                squareStyles,
                darkSquareStyle: { backgroundColor: '#b58863' },
                lightSquareStyle: { backgroundColor: '#f0d9b5' },
                showNotation: true,
                animationDurationInMs: 150,
              }}
            />
          </div>
          <div className="mt-2">
            {untimed ? (
              <div className="rounded-md bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200">
                나
              </div>
            ) : (
              <Clock ms={bottomMs} active={bottomActive} label="나" />
            )}
          </div>
        </div>

        <aside className="flex w-full gap-3 lg:w-80">
          <EvalBar cp={evalCp} />
          <div className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-neutral-800 bg-[#1b1a17]">
            {result ? (
              <div className="border-b border-neutral-800 px-4 py-3 text-center">
                <p
                  className={`text-xl font-bold ${
                    result.title === '승리!'
                      ? 'text-green-400'
                      : result.title === '패배'
                        ? 'text-red-400'
                        : 'text-neutral-200'
                  }`}
                >
                  {result.title}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{result.detail}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={onRematch}
                    className="rounded-md bg-[#3692e7] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4a9fee]"
                  >
                    다시 두기
                  </button>
                  <button
                    onClick={onQuit}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    레벨 선택으로
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-b border-neutral-800 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-neutral-300">
                  Stockfish Lv.{level.display}와 대국 중
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {!validRef.current
                    ? '불법 포지션: ... 메뉴에서 무르기로 되돌리세요'
                    : thinking
                      ? '엔진이 생각하고 있습니다…'
                      : turnNow === playerColor
                        ? '당신의 차례입니다'
                        : '엔진 차례입니다'}
                </p>
              </div>
            )}
            <div className="max-h-[380px] flex-1 overflow-y-auto">
              <MoveList moves={moves as unknown as Move[]} />
            </div>
          </div>
        </aside>
      </div>

      {promo && (
        <PromotionPicker
          color={playerColor}
          allowKing={illegalMode}
          onPick={(p) => {
            const { from, to } = promo;
            setPromo(null);
            if (!p) return;
            if (illegalMode) applyFreeMoveRef.current(from, to, p);
            else applyMoveRef.current(from, to, p);
          }}
        />
      )}

      <GameBottomBar
        onResign={resign}
        onUndo={undo}
        canUndo={historyRef.current.length > 0 && !thinking && !result}
        illegalMode={illegalMode}
        canUseIllegal={admin}
        onToggleIllegal={() => {
          setIllegalMode((v) => !v);
          setSelected(null);
        }}
        onFlipBoard={() => setFlipped((v) => !v)}
        onQuit={onQuit}
        gameOver={!!result}
        onRematch={onRematch}
      />
    </div>
  );
}
