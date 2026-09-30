/**
 * lib/engine.ts — Client-side chess engine: static evaluation, alpha-beta
 * search, and move grading (annotations like !, ?, ??, !!).
 *
 * Pure logic only: ZERO browser/DOM APIs. This module must run inside a
 * Web Worker (see engine.worker.ts) and under Node.
 */

import { Chess } from 'chess.js';
import type { Color, Move, PieceSymbol } from 'chess.js';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BestMoveResult {
  /** UCI of the best move, e.g. "e2e4" or "e7e8q"; null when no legal moves. */
  bestUci: string | null;
  /** Evaluation in centipawns from the SIDE-TO-MOVE's perspective. */
  scoreCp: number;
  /** Plies until forced mate for the side to move; null when no forced mate. */
  mateIn: number | null;
}

export interface GradeResult {
  /** Annotation: '!!', '!', '!?', '', '?!', '?', or '??'. */
  annotation: string;
  /** Centipawns lost vs. the engine's best move, from the mover's perspective. */
  lossCp: number;
  /** Evaluation in centipawns from WHITE's perspective AFTER the move. */
  evalAfterCp: number;
}

/* ------------------------------------------------------------------ */
/* Static evaluation                                                   */
/* ------------------------------------------------------------------ */

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0, // king safety handled via PST; excluded from material sums
};

/**
 * Simple midgame piece-square tables, indexed from White's perspective:
 * index 0 = a1, index 63 = h8 (index = rank * 8 + file, rank 0 = rank 1).
 * Black pieces use the vertically mirrored index.
 */
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -20, -20, 10, 10, 5, 5, -5, -10, 0, 0,
    -10, -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10,
    20, 30, 30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0,
    0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5,
    15, 20, 20, 15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0,
    0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 5, 0, 0, 0, 0, 5, -10, -10,
    10, 10, 10, 10, 10, 10, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 5, 5,
    10, 10, 5, 5, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0,
    -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 5, 5, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, 5, 10, 10, 10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 5, 0, 0, 0, 0, -10, -10, 5,
    5, 5, 5, 5, 0, -10, 0, 0, 5, 5, 5, 5, 0, -5, -5, 0, 5, 5, 5, 5, 0, -5,
    -10, 0, 5, 5, 5, 5, 0, -10, -10, 0, 0, 0, 0, 0, 0, -10, -20, -10, -10,
    -5, -5, -10, -10, -20,
  ],
  k: [
    20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20,
    -20, -20, -20, -20, -10, -20, -30, -30, -40, -40, -30, -30, -20, -30, -40,
    -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30,
    -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  ],
};

/** White-perspective static evaluation of a live Chess instance. */
function staticEvalBoard(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const rank = 7 - row; // 0 = rank 1, 7 = rank 8
      const idx =
        piece.color === 'w' ? rank * 8 + col : (7 - rank) * 8 + col;
      const value = PIECE_VALUES[piece.type] + PST[piece.type][idx];
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

/** White-perspective static evaluation of a FEN position, in centipawns. */
export function staticEvalCp(fen: string): number {
  return staticEvalBoard(new Chess(fen));
}

/** Sum of piece values (pawns=100 etc., king=0) for one color. */
function materialFor(chess: Chess, color: Color): number {
  let total = 0;
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) total += PIECE_VALUES[piece.type];
    }
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Negamax search                                                      */
/* ------------------------------------------------------------------ */

const MATE_SCORE = 100000;
const MATE_BOUND = MATE_SCORE - 1000; // scores beyond this are mate scores
const NODE_CAP = 200000;

let nodeCount = 0;
const CAP_EXCEEDED: unique symbol = Symbol('engine-node-cap-exceeded');

/** Capture-first move ordering, MVV-LVA-lite. Higher = searched first. */
function moveOrderScore(move: Move): number {
  const flags = move.flags;
  let score = 0;
  if (flags.includes('p')) score += 900; // promotion
  if (flags.includes('c') || flags.includes('e')) {
    const victimType = flags.includes('e')
      ? 'p'
      : (move.captured ?? 'p');
    const victim = PIECE_VALUES[victimType] ?? 100;
    const attacker = PIECE_VALUES[move.piece] ?? 0;
    score += 1000 + victim - attacker / 16;
  }
  return score;
}

function orderedMoves(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true });
  moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
  return moves;
}

/** Negamax with alpha-beta. Returns side-to-move-perspective centipawns. */
function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  nodeCount++;
  if (nodeCount > NODE_CAP) throw CAP_EXCEEDED;

  const moves = orderedMoves(chess);
  if (moves.length === 0) {
    // Checkmate: prefer faster mates via ply offset. Stalemate = draw = 0.
    return chess.inCheck() ? -(MATE_SCORE - ply) : 0;
  }
  if (depth <= 0) {
    const evalWhite = staticEvalBoard(chess);
    return chess.turn() === 'w' ? evalWhite : -evalWhite;
  }

  let best = -Infinity;
  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Find the best move for the side to move in `fen`.
 * @param depth search depth (default 3)
 */
export function searchBestMove(fen: string, depth = 3): BestMoveResult {
  const chess = new Chess(fen);
  nodeCount = 0;

  const moves = orderedMoves(chess);
  if (moves.length === 0) {
    const score = chess.inCheck() ? -MATE_SCORE : 0;
    return { bestUci: null, scoreCp: score, mateIn: null };
  }

  let bestUci: string | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  try {
    for (const move of moves) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      const score = -negamax(chess, depth - 1, -Infinity, -alpha, 1);
      chess.undo();
      if (score > bestScore) {
        bestScore = score;
        bestUci = uciOf(move.from, move.to, move.promotion);
      }
      if (score > alpha) alpha = score;
    }
  } catch (e) {
    if (e !== CAP_EXCEEDED) throw e;
    // Node cap hit mid-search: keep the best move found so far.
  }

  if (bestUci === null) {
    // Cap hit before any root move finished: fall back to a static score
    // with the first ordered move so callers always get a usable UCI.
    const evalWhite = staticEvalBoard(chess);
    bestScore = chess.turn() === 'w' ? evalWhite : -evalWhite;
    const first = moves[0];
    bestUci = uciOf(first.from, first.to, first.promotion);
  }

  const scoreCp = Math.round(bestScore);
  const mateIn = scoreCp > MATE_BOUND ? MATE_SCORE - scoreCp : null;
  return { bestUci, scoreCp, mateIn };
}

/* ------------------------------------------------------------------ */
/* Move grading                                                        */
/* ------------------------------------------------------------------ */

/** White-perspective evaluation of a FEN: depth-2 search, static fallback. */
function whiteEvalCp(fen: string): number {
  try {
    const chess = new Chess(fen);
    const result = searchBestMove(fen, 2);
    const cp = chess.turn() === 'w' ? result.scoreCp : -result.scoreCp;
    return clampCp(cp);
  } catch {
    try {
      return clampCp(staticEvalCp(fen));
    } catch {
      return 0;
    }
  }
}

function clampCp(cp: number): number {
  return Math.max(-MATE_SCORE, Math.min(MATE_SCORE, cp));
}

/**
 * Grade the move `moveUci` played from `beforeFen` (resulting in `afterFen`).
 * The grade is from the mover's perspective.
 */
export function gradeMove(
  beforeFen: string,
  moveUci: string,
  afterFen: string,
): GradeResult {
  const evalAfterCp = whiteEvalCp(afterFen);

  // Delivering checkmate is brilliant by definition.
  const after = new Chess(afterFen);
  if (after.isCheckmate()) {
    return { annotation: '!!', lossCp: 0, evalAfterCp };
  }

  const before = new Chess(beforeFen);
  const mover = before.turn();

  // Engine's best move for the mover, and the mover-perspective score of
  // the move actually played (negate the opponent-perspective reply).
  const best = searchBestMove(beforeFen, 3);
  let playedScore: number;
  try {
    playedScore = -searchBestMove(afterFen, 2).scoreCp;
  } catch {
    const staticWhite = staticEvalCp(afterFen);
    playedScore = mover === 'w' ? staticWhite : -staticWhite;
  }

  const lossCp = Math.max(0, clampCp(best.scoreCp) - clampCp(playedScore));
  const loss = Math.round(lossCp);

  // The engine's best move: brilliant if it's a sacrifice or forces mate.
  if (best.bestUci !== null && moveUci === best.bestUci) {
    const materialBefore = materialFor(before, mover);
    const materialAfter = materialFor(after, mover);
    if (materialBefore - materialAfter > 150) {
      return { annotation: '!!', lossCp: loss, evalAfterCp };
    }
    if (best.mateIn !== null) {
      return { annotation: '!!', lossCp: loss, evalAfterCp };
    }
    return { annotation: '!', lossCp: loss, evalAfterCp };
  }

  let annotation = '';
  if (loss < 30) annotation = '';
  else if (loss < 80) annotation = '!?';
  else if (loss < 150) annotation = '?!';
  else if (loss < 300) annotation = '?';
  else annotation = '??';
  return { annotation, lossCp: loss, evalAfterCp };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Format an evaluation for display. Mate scores are represented by passing
 * ±100000 (they render as "#" / "-#"). null means unknown → "?".
 * Examples: "+1.2", "-0.4", "0.0", "#", "-#", "?"
 */
export function formatEval(cp: number | null): string {
  if (cp === null) return '?';
  if (cp >= MATE_BOUND) return '#';
  if (cp <= -MATE_BOUND) return '-#';
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '-' : '';
  return `${sign}${Math.abs(pawns).toFixed(1)}`;
}

/**
 * Win probability (0..1) for the side the eval favors, as a logistic curve.
 * Used to drive the eval bar.
 */
export function winProbability(cp: number): number {
  const p = 1 / (1 + Math.exp(-0.004 * cp));
  return Math.min(1, Math.max(0, p));
}

/** Build a UCI string: "e2e4", or "e7e8q" with promotion. */
export function uciOf(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ''}`;
}
