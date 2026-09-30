'use client';

// ============================================================
// 분석판 (리체스 스타일): 자유 대국 + Stockfish 실시간 평가
// - 양쪽 기물 이동, 수순 탐색(|◀ ◀ ▶ ▶|)
// - 평가 막대 + 최선수 칸 하이라이트
// - FEN 불러오기/복사, PGN 가져오기, 보드 뒤집기
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { PieceDropHandlerArgs, SquareHandlerArgs } from 'react-chessboard';
import { EvalBar } from './EvalBar';
import { CapturedPieces } from './CapturedPieces';
import { ExplorerPanel } from './ExplorerPanel';
import { MoveList } from './MoveList';
import { analyzePosition, isStockfishBroken } from '../lib/stockfish';
import { formatEval } from '../lib/engine';
import { openingName } from '../lib/openings';
import { pgnToSans, movesToPgn, downloadPgn } from '../lib/pgn';
import { playSound } from '../lib/sound';
import { getBoardTheme } from '../lib/boardTheme';
import type { Move } from '../lib/db';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface HistEntry {
  fen: string;
  san: string;
  uci: string;
}

export function AnalysisBoard({
  initialFen,
  initialPgn,
}: {
  initialFen?: string;
  initialPgn?: string;
} = {}) {
  const startFen = (() => {
    if (initialFen) {
      try {
        return new Chess(initialFen).fen();
      } catch {
        /* 무시 */
      }
    }
    return STARTPOS;
  })();
  // PGN으로 시작하면 수순을 재생해 히스토리 구성
  const startHistory = (() => {
    if (!initialPgn) return null;
    try {
      const sans = pgnToSans(initialPgn);
      if (!sans || sans.length === 0) return null;
      const chess = new Chess(startFen);
      const hist: HistEntry[] = [{ fen: chess.fen(), san: '', uci: '' }];
      for (const san of sans) {
        const mv = chess.move(san);
        if (!mv) return null;
        hist.push({ fen: chess.fen(), san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? '') });
      }
      return hist;
    } catch {
      return null;
    }
  })();
  const [history, setHistory] = useState<HistEntry[]>(startHistory ?? [{ fen: startFen, san: '', uci: '' }]);
  const [ply, setPly] = useState(startHistory ? startHistory.length - 1 : 0);
  const [flipped, setFlipped] = useState(false);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [bestUci, setBestUci] = useState<string | null>(null);
  const [mateIn, setMateIn] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [pgnInput, setPgnInput] = useState('');
  const [showPgn, setShowPgn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState(getBoardTheme);
  const evalSeq = useRef(0);

  const fen = history[ply].fen;

  // 보드 테마 변경 감지 (더보기 설정에서 바꿨을 때)
  useEffect(() => {
    const onFocus = () => setTheme(getBoardTheme());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 엔진 평가 (디바운스)
  useEffect(() => {
    const seq = ++evalSeq.current;
    setThinking(true);
    const t = setTimeout(() => {
      analyzePosition(fen, { depth: 18, skill: 20 })
        .then((res) => {
          if (evalSeq.current !== seq) return;
          setEvalCp(res.scoreCpWhite);
          setBestUci(res.bestMoveUci);
          setMateIn(res.mateIn);
        })
        .catch(() => {
          if (evalSeq.current !== seq) return;
          setEvalCp(null);
          setBestUci(null);
        })
        .finally(() => {
          if (evalSeq.current === seq) setThinking(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [fen]);

  const doMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const chess = new Chess(fen);
      let mv;
      try {
        mv = chess.move({ from, to, promotion: promotion ?? 'q' });
      } catch {
        return false;
      }
      const newFen = chess.fen();
      const uci = `${from}${to}${mv.promotion ?? ''}`;
      setHistory((h) => [...h.slice(0, ply + 1), { fen: newFen, san: mv.san, uci }]);
      setPly((p) => p + 1);
      setSelected(null);
      playSound(mv.captured ? 'capture' : 'move');
      if (chess.inCheck()) setTimeout(() => playSound('check'), 120);
      return true;
    },
    [fen, ply],
  );

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!targetSquare) return false;
    setSelected(null);
    return doMove(sourceSquare, targetSquare);
  };

  const onSquareClick = ({ square, piece }: SquareHandlerArgs): void => {
    if (selected) {
      const from = selected;
      setSelected(null);
      if (square !== from) doMove(from, square);
      return;
    }
    if (piece) setSelected(square);
  };

  const gotoPly = (p: number) => {
    setPly(Math.max(0, Math.min(history.length - 1, p)));
    setSelected(null);
  };

  // 키보드 기보 탐색 (리체스 스타일: ←/→)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') gotoPly(ply - 1);
      else if (e.key === 'ArrowRight') gotoPly(ply + 1);
      else if (e.key === 'ArrowUp') gotoPly(0);
      else if (e.key === 'ArrowDown') gotoPly(history.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, history.length]);

  const loadFen = () => {
    const input = fenInput.trim();
    if (!input) return;
    try {
      const chess = new Chess(input);
      const f = chess.fen();
      setHistory([{ fen: f, san: '', uci: '' }]);
      setPly(0);
      setMsg(null);
    } catch {
      setMsg('FEN이 올바르지 않습니다.');
    }
  };

  const loadPgn = () => {
    const sans = pgnToSans(pgnInput.trim());
    if (!sans || sans.length === 0) {
      setMsg('PGN을 해석할 수 없습니다.');
      return;
    }
    try {
      const chess = new Chess();
      const hist: HistEntry[] = [{ fen: chess.fen(), san: '', uci: '' }];
      for (const san of sans) {
        const mv = chess.move(san);
        hist.push({ fen: chess.fen(), san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? '') });
      }
      setHistory(hist);
      setPly(hist.length - 1);
      setMsg(null);
      setShowPgn(false);
    } catch {
      setMsg('PGN을 해석할 수 없습니다.');
    }
  };

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setMsg('FEN을 복사했습니다.');
      setTimeout(() => setMsg(null), 1500);
    } catch {
      setMsg('복사에 실패했습니다.');
    }
  };

  const exportPgn = () => {
    const sans = history.slice(1).map((h) => h.san);
    downloadPgn(movesToPgn(sans), 'analysis.pgn');
  };

  // 최선수 칸 하이라이트
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) squareStyles[selected] = { backgroundColor: 'rgba(54, 146, 231, 0.55)' };
  if (bestUci && bestUci.length >= 4) {
    const bFrom = bestUci.slice(0, 2);
    const bTo = bestUci.slice(2, 4);
    squareStyles[bFrom] = { ...(squareStyles[bFrom] ?? {}), boxShadow: 'inset 0 0 0 3px rgba(74, 222, 128, 0.9)' };
    squareStyles[bTo] = { ...(squareStyles[bTo] ?? {}), boxShadow: 'inset 0 0 0 3px rgba(74, 222, 128, 0.9)' };
  }

  const moves: Move[] = history.slice(1).map((h, i) => ({
    id: `a${i}`,
    game_id: '',
    ply: i + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san: h.san,
    uci: h.uci,
    fen_after: h.fen,
    annotation: null,
    eval_cp: null,
    white_clock_ms: 0,
    black_clock_ms: 0,
    moved_at: '',
  }));

  const sans = history.slice(1).map((h) => h.san);
  const opening = openingName(sans.slice(0, ply));
  const lastMoveSquares = ply > 0 ? [history[ply].uci.slice(0, 2), history[ply].uci.slice(2, 4)] : [];

  return (
    <div className="mx-auto max-w-5xl px-3 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-100">분석판</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFlipped((v) => !v)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            보드 뒤집기
          </button>
          <button
            onClick={exportPgn}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            PGN 저장
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full max-w-[560px]">
          <div className="mb-2 flex h-8 items-center justify-between gap-2 rounded-md bg-neutral-800/60 px-3">
            <span className="shrink-0 text-xs text-neutral-400">
              {thinking ? '엔진 생각 중…' : isStockfishBroken() ? '엔진 오프라인' : formatEval(evalCp) + (mateIn ? ` · 메이트 ${mateIn}수` : '')}
            </span>
            {opening && <span className="truncate text-xs font-medium text-neutral-300">{opening}</span>}
            <div className="flex shrink-0 items-center gap-2">
              <CapturedPieces fen={fen} byWhite={true} />
              <CapturedPieces fen={fen} byWhite={false} />
            </div>
          </div>
          <div className="overflow-hidden rounded-lg shadow-2xl">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: flipped ? 'black' : 'white',
                allowDragging: true,
                onPieceDrop,
                onSquareClick,
                squareStyles,
                darkSquareStyle: { backgroundColor: theme.dark },
                lightSquareStyle: { backgroundColor: theme.light },
                showNotation: true,
                animationDurationInMs: 120,
              }}
            />
          </div>
          {/* 수순 탐색 (리체스 스타일) */}
          <div className="mt-2 flex items-center justify-center gap-1">
            {[
              { label: '⏮', to: 0, title: '처음으로' },
              { label: '◀', to: ply - 1, title: '이전 수' },
              { label: '▶', to: ply + 1, title: '다음 수' },
              { label: '⏭', to: history.length - 1, title: '마지막으로' },
            ].map((b) => (
              <button
                key={b.label}
                title={b.title}
                onClick={() => gotoPly(b.to)}
                disabled={b.to === ply || b.to < 0 || b.to > history.length - 1}
                className="rounded-md px-4 py-2 text-lg text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-center text-[11px] text-neutral-600">
            {ply}수 / {history.length - 1}수
            {lastMoveSquares.length === 2 && ` · 마지막 수: ${history[ply].san}`}
          </p>
        </div>

        <aside className="flex w-full gap-3 lg:w-80">
          <EvalBar cp={evalCp} />
          <div className="flex min-h-[420px] flex-1 flex-col rounded-lg border border-neutral-800 bg-[#1b1a17]">
            <div className="max-h-64 flex-1 overflow-y-auto">
              <MoveList moves={moves.slice(0, ply)} />
            </div>
            <div className="border-t border-neutral-800 p-3">
              <label className="text-xs font-medium text-neutral-400">FEN</label>
              <div className="mt-1 flex gap-1">
                <input
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  placeholder="FEN 입력…"
                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                />
                <button onClick={loadFen} className="rounded-md bg-[#3692e7] px-2 py-1.5 text-xs font-semibold text-white">
                  적용
                </button>
                <button onClick={copyFen} className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300">
                  복사
                </button>
              </div>
              <button
                onClick={() => setShowPgn((v) => !v)}
                className="mt-2 text-xs text-[#3692e7] hover:underline"
              >
                PGN 가져오기 {showPgn ? '▲' : '▼'}
              </button>
              {showPgn && (
                <div className="mt-1">
                  <textarea
                    value={pgnInput}
                    onChange={(e) => setPgnInput(e.target.value)}
                    placeholder="PGN 붙여넣기…"
                    rows={4}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
                  />
                  <button onClick={loadPgn} className="mt-1 rounded-md bg-[#3692e7] px-3 py-1.5 text-xs font-semibold text-white">
                    불러오기
                  </button>
                </div>
              )}
              {msg && <p className="mt-1 text-xs text-amber-400">{msg}</p>}
            </div>
            <ExplorerPanel fen={fen} />
          </div>
        </aside>
      </div>
    </div>
  );
}
