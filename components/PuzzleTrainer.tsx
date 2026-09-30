'use client';

// ============================================================
// 퍼즐 트레이너 (리체스 일일 퍼즐)
// - /api/puzzle 에서 오늘의 퍼즐을 가져옴
// - 정답 수순을 맞히면 다음 수로 진행, 틀리면 재시도
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareHandlerArgs } from 'react-chessboard';
import { getBoardTheme } from '../lib/boardTheme';
import { playSound } from '../lib/sound';
import { CapturedPieces } from './CapturedPieces';
import { IconTarget } from './icons';

interface PuzzleData {
  fen: string;
  solution: string[];
  rating: number;
  themes: string[];
  lastMove: string;
  gameId: string;
}

type Phase = 'loading' | 'ready' | 'success' | 'error';

export function PuzzleTrainer() {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [fen, setFen] = useState('');
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(0); // 맞힌 수의 개수
  const [wrong, setWrong] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [theme] = useState(getBoardTheme);
  const chessRef = useRef(new Chess());
  const solutionRef = useRef<string[]>([]);
  const errorMsg = useRef<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setPuzzle(null);
    setHint(null);
    setWrong(0);
    setStep(0);
    try {
      const res = await fetch('/api/puzzle');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const p = data.puzzle;
      if (!p?.fen || !Array.isArray(p.solution)) throw new Error('bad data');
      const chess = new Chess(p.fen);
      chessRef.current = chess;
      solutionRef.current = p.solution;
      setFen(chess.fen());
      setPuzzle({
        fen: p.fen,
        solution: p.solution,
        rating: p.rating,
        themes: p.themes ?? [],
        lastMove: p.lastMove ?? '',
        gameId: data.game?.id ?? '',
      });
      const lm = p.lastMove as string;
      if (lm && lm.length >= 4) {
        setLastMove({ from: lm.slice(0, 2), to: lm.slice(2, 4) });
      }
      setPhase('ready');
    } catch {
      errorMsg.current = '퍼즐을 불러오지 못했습니다.';
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';

  // 정답 수 적용 (사용자 수 또는 자동 응수)
  const applySolutionMove = useCallback(
    (uci: string) => {
      const chess = chessRef.current;
      const mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!mv) return false;
      setFen(chess.fen());
      setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      playSound(mv.captured ? 'capture' : 'move');
      return true;
    },
    [],
  );

  const tryMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (phase !== 'ready' || !puzzle) return false;
      const chess = chessRef.current;
      // 합법 수인지 먼저 확인
      const legal = chess.moves({ square: from as never, verbose: true }) as { from: string; to: string }[];
      const found = legal.find((m) => m.from === from && m.to === to);
      if (!found) return false;

      const uci = `${from}${to}${promotion ?? ''}`;
      const expected = solutionRef.current[step];

      // 프로모션은 퀸으로 가정 (퍼즐 대부분)
      const expectedBase = expected.slice(0, 4);
      if (uci.slice(0, 4) === expectedBase) {
        const promoUci = expected.length > 4 ? expected : uci.slice(0, 4) + (promotion ?? 'q');
        if (!applySolutionMove(promoUci)) return false;
        playSound('move');
        const nextStep = step + 1;
        setStep(nextStep);
        setSelected(null);
        setHint(null);
        if (nextStep >= solutionRef.current.length) {
          setPhase('success');
          setTimeout(() => playSound('end'), 200);
        } else {
          // 상대 응수 자동 재생
          setTimeout(() => {
            const reply = solutionRef.current[nextStep];
            if (applySolutionMove(reply)) {
              setStep(nextStep + 1);
              if (nextStep + 1 >= solutionRef.current.length) {
                setPhase('success');
              }
            }
          }, 600);
        }
        return true;
      } else {
        // 오답
        setWrong((w) => w + 1);
        setHint('틀렸습니다. 다시 생각해 보세요.');
        return true; // 수는 두지 않지만 입력은 소비
      }
    },
    [phase, puzzle, step, applySolutionMove],
  );

  const onPieceDrop = useCallback(
    ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      if (!sourceSquare || !targetSquare || sourceSquare === targetSquare) return false;
      // 프로모션 감지
      const chess = chessRef.current;
      const isPromo =
        piece.pieceType.toLowerCase().includes('pawn') &&
        (((piece.pieceType[0] === 'w') && targetSquare[1] === '8') ||
          ((piece.pieceType[0] === 'b') && targetSquare[1] === '1'));
      return tryMove(sourceSquare, targetSquare, isPromo ? 'q' : undefined);
    },
    [tryMove],
  );

  const onSquareClick = useCallback(
    ({ piece, square }: SquareHandlerArgs) => {
      if (phase !== 'ready') return;
      if (selected) {
        if (square === selected) {
          setSelected(null);
          return;
        }
        const chess = chessRef.current;
        const isPromo =
          chess.get(selected as never)?.type === 'p' &&
          ((chess.turn() === 'w' && square[1] === '8') || (chess.turn() === 'b' && square[1] === '1'));
        if (tryMove(selected, square, isPromo ? 'q' : undefined)) {
          return;
        }
      }
      if (piece && (piece.pieceType[0]?.toLowerCase() ?? '') === (turnColor === 'white' ? 'w' : 'b')) {
        setSelected(square);
      } else {
        setSelected(null);
      }
    },
    [phase, selected, tryMove, turnColor],
  );

  const showHint = () => {
    const expected = solutionRef.current[step];
    if (!expected) return;
    setHint(`힌트: ${expected.slice(0, 2)}의 기물을 움직여 보세요.`);
  };

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    const hl = { backgroundColor: 'rgba(155, 199, 0, 0.45)' };
    squareStyles[lastMove.from] = hl;
    squareStyles[lastMove.to] = hl;
  }
  if (selected) {
    squareStyles[selected] = { backgroundColor: 'rgba(20, 120, 220, 0.45)' };
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
          <IconTarget size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-100">퍼즐</h1>
          <p className="text-xs text-neutral-500">리체스 일일 퍼즐 · 최선의 수를 찾아보세요</p>
        </div>
      </div>

      {phase === 'loading' && (
        <p className="py-16 text-center text-sm text-neutral-500">퍼즐을 불러오는 중…</p>
      )}
      {phase === 'error' && (
        <div className="py-16 text-center">
          <p className="text-sm text-neutral-400">{errorMsg.current}</p>
          <button
            onClick={load}
            className="mt-4 rounded-md bg-[#3692e7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a9fee]"
          >
            다시 시도
          </button>
        </div>
      )}

      {(phase === 'ready' || phase === 'success') && puzzle && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="mx-auto w-full max-w-[640px] flex-1">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex-1 rounded-md bg-neutral-800/60 px-3 py-2 text-sm font-medium text-neutral-200">
                {phase === 'success'
                  ? '🎉 퍼즐 해결!'
                  : turnColor === 'white'
                    ? '백의 차례 — 최선수 찾기'
                    : '흑의 차례 — 최선수 찾기'}
              </div>
              <CapturedPieces fen={fen} byWhite={true} />
              <CapturedPieces fen={fen} byWhite={false} />
            </div>
            <div className="relative overflow-hidden rounded-lg shadow-2xl">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: turnColor,
                  allowDragging: phase === 'ready',
                  canDragPiece: ({ piece }) => phase === 'ready' && (piece.pieceType[0]?.toLowerCase() ?? '') === (turnColor === 'white' ? 'w' : 'b'),
                  onPieceDrop,
                  onSquareClick,
                  squareStyles,
                  darkSquareStyle: { backgroundColor: theme.dark },
                  lightSquareStyle: { backgroundColor: theme.light },
                  showNotation: true,
                  animationDurationInMs: 150,
                }}
              />
            </div>
            {hint && (
              <p className="mt-2 rounded-md bg-neutral-800/60 px-3 py-2 text-sm text-amber-300">{hint}</p>
            )}
            {phase === 'success' && (
              <div className="mt-3 rounded-lg border border-green-800/60 bg-green-950/30 p-4 text-center">
                <p className="text-lg font-bold text-green-400">정답!</p>
                <p className="mt-1 text-xs text-neutral-400">
                  레이팅 {puzzle.rating} · 오답 {wrong}회
                  {puzzle.themes.length > 0 && ` · ${puzzle.themes.slice(0, 3).join(', ')}`}
                </p>
                <button
                  onClick={load}
                  className="mt-3 rounded-md bg-[#3692e7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4a9fee]"
                >
                  다시 풀기
                </button>
              </div>
            )}
          </div>
          <aside className="w-full lg:w-80">
            <div className="rounded-lg border border-neutral-800 bg-[#1b1a17] p-4">
              <h2 className="text-sm font-bold text-neutral-200">오늘의 퍼즐</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">퍼즐 레이팅</dt>
                  <dd className="font-semibold text-neutral-200">{puzzle.rating}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">진행</dt>
                  <dd className="font-semibold text-neutral-200">
                    {Math.min(step, puzzle.solution.length)} / {puzzle.solution.length}수
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">오답</dt>
                  <dd className="font-semibold text-neutral-200">{wrong}회</dd>
                </div>
              </dl>
              {puzzle.themes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {puzzle.themes.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={showHint}
                  className="flex-1 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  힌트
                </button>
                <button
                  onClick={load}
                  className="flex-1 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  새 퍼즐
                </button>
              </div>
              {puzzle.gameId && (
                <a
                  href={`https://lichess.org/${puzzle.gameId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block text-center text-xs text-[#3692e7] hover:text-[#4a9fee]"
                >
                  원본 대국 보기 (lichess.org)
                </a>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
