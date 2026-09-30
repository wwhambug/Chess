'use client';

// ============================================================
// 컴퓨터와 대결: Stockfish 17.1 WASM과의 로컬 대국
// - DB를 사용하지 않는 1인용 모드 (로그인 불필요)
// - 매 수는 Stockfish eval로 실시간 평가 (!!, !, !?, ?!, ?, ??)
// - 레벨 1~8 + MAX(9999): 8/MAX는 Skill 제한 없는 풀파워
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs } from 'react-chessboard';
import { evaluateMove } from '../lib/evalClient';
import { analyzePosition, getEngineLevel } from '../lib/stockfish';
import { TIME_CONTROLS } from '../lib/timeControl';
import { Clock } from './Clock';
import { EvalBar } from './EvalBar';
import { MoveList } from './MoveList';
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

interface ComputerGameProps {
  levelId: string;
  playerColor: 'w' | 'b';
  /** TIME_CONTROLS id 또는 'untimed' */
  tcId: string;
  onQuit: () => void;
  onRematch: () => void;
}

export function ComputerGame({ levelId, playerColor, tcId, onQuit, onRematch }: ComputerGameProps) {
  const level = getEngineLevel(levelId);
  const engineColor: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
  const untimed = tcId === UNTIMED_ID;
  const tc = TIME_CONTROLS.find((t) => t.id === tcId);

  const [fen, setFen] = useState(STARTPOS);
  const [moves, setMoves] = useState<LocalMove[]>([]);
  const [clocks, setClocks] = useState({ w: tc?.baseMs ?? 0, b: tc?.baseMs ?? 0 });
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [thinking, setThinking] = useState(false);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [, setTick] = useState(0);

  const chessRef = useRef<Chess | null>(null);
  const movesRef = useRef<LocalMove[]>([]);
  const thinkingRef = useRef(false);
  const resultRef = useRef<GameResult | null>(null);
  if (!chessRef.current) chessRef.current = new Chess();
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
  // 수 적용 (플레이어/엔진 공용)
  // ------------------------------------------------------------
  const applyMove = (from: string, to: string, promotion: string | undefined): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return false;
    const beforeFen = chess.fen();
    let mv;
    try {
      mv = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
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
  // 플레이어 수 두기
  // ------------------------------------------------------------
  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    const chess = chessRef.current;
    if (!chess || resultRef.current || !targetSquare) return false;
    if (chess.turn() !== playerColor) return false;
    return applyMoveRef.current(sourceSquare, targetSquare, undefined);
  };

  // ------------------------------------------------------------
  // 엔진 수 두기
  // ------------------------------------------------------------
  useEffect(() => {
    const chess = chessRef.current;
    if (!chess || resultRef.current) return;
    if (chess.turn() !== engineColor || thinkingRef.current) return;
    let cancelled = false;
    thinkingRef.current = true;
    setThinking(true);
    (async () => {
      try {
        const res = await analyzePosition(chess.fen(), {
          depth: level.depth,
          skill: level.skill,
          timeoutMs: 120000,
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
  const chess = chessRef.current;
  const turnNow = chess?.turn() ?? 'w';
  const wMs = turnNow === 'w' && !result ? Math.max(0, clocks.w - elapsedNow) : clocks.w;
  const bMs = turnNow === 'b' && !result ? Math.max(0, clocks.b - elapsedNow) : clocks.b;

  // 보드 위쪽 = 상대(엔진), 아래쪽 = 나
  const topMs = playerColor === 'w' ? bMs : wMs;
  const bottomMs = playerColor === 'w' ? wMs : bMs;
  const topActive = !result && !untimed && turnNow === engineColor;
  const bottomActive = !result && !untimed && turnNow === playerColor;

  const canPlay = !result && turnNow === playerColor;

  const lastUci = moves[moves.length - 1]?.uci;
  const squareStyles: Record<string, CSSProperties> = {};
  if (lastUci && lastUci.length >= 4) {
    const hl: CSSProperties = { backgroundColor: 'rgba(155, 199, 0, 0.45)' };
    squareStyles[lastUci.slice(0, 2)] = hl;
    squareStyles[lastUci.slice(2, 4)] = hl;
  }
  const engineLabel = `Stockfish Lv.${level.display}${thinking ? ' · 생각 중…' : ''}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
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
                boardOrientation: playerColor === 'b' ? 'black' : 'white',
                allowDragging: canPlay,
                canDragPiece: ({ piece }) =>
                  canPlay && (piece.pieceType[0]?.toLowerCase() ?? '') === playerColor,
                onPieceDrop,
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

          {!result && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={resign}
                className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900/40"
              >
                기권
              </button>
              <button
                onClick={onQuit}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                그만두기
              </button>
            </div>
          )}
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
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
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
                  {thinking ? '엔진이 생각하고 있습니다…' : '당신의 차례입니다'}
                </p>
              </div>
            )}
            <div className="max-h-[380px] flex-1 overflow-y-auto">
              <MoveList moves={moves as unknown as Move[]} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
