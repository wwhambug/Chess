/**
 * lib/evalClient.ts — UI-facing 수 평가 API (클라이언트 컴포넌트용).
 *
 * evaluateMove()는 Stockfish 17.1 WASM(lib/stockfish.ts)으로 수를 평가한다.
 * - 수를 두기 전局面을 Stockfish가 분석 → 최선수 점수
 * - 수를 둔 뒤局面을 Stockfish가 분석 → 실제 둔 수의 점수
 * - 둘의 차이(centipawn loss)로 !!, !, !?, ?!, ?, ?? 주석을 매긴다.
 * Stockfish를 사용할 수 없으면(Worker 생성 실패 등) 구형 자체 엔진
 * (lib/engine.ts)으로 폴백한다.
 *
 * formatEval / winProbability는 평가값 표시용 순수 함수로 그대로 둔다.
 */

import { Chess } from 'chess.js';
import { gradeMove } from './engine';
import { analyzePosition, STOCKFISH_MATE_CP } from './stockfish';

export { formatEval, winProbability } from './engine';
export type { GradeResult } from './engine';
import type { GradeResult } from './engine';

/** 수 평가용 탐색 깊이 (싱글스레드 기준 수백 ms ~ 1초대) */
const GRADE_DEPTH = 14;

const PIECE_CP: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/** 한 색상의 기물 점수 합 (희생수 판정용) */
function materialOf(fen: string, color: 'w' | 'b'): number {
  try {
    const c = new Chess(fen);
    let total = 0;
    for (const row of c.board()) {
      for (const sq of row) {
        if (sq && sq.color === color) total += PIECE_CP[sq.type] ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function normUci(uci: string | null | undefined): string {
  return (uci ?? '').toLowerCase();
}

/**
 * Stockfish로 수 평가.
 * - beforeFen에서 moveUci를 두어 afterFen이 되었다고 가정한다.
 * - 주석은 수를 둔 사람 관점으로 매긴다.
 */
async function gradeWithStockfish(
  beforeFen: string,
  moveUci: string,
  afterFen: string,
): Promise<GradeResult> {
  const before = new Chess(beforeFen);
  const mover = before.turn(); // 'w' | 'b'

  // 체크메이트를 만들었다면 무조건 brilliant
  const after = new Chess(afterFen);
  if (after.isCheckmate()) {
    return {
      annotation: '!!',
      lossCp: 0,
      evalAfterCp: mover === 'w' ? STOCKFISH_MATE_CP : -STOCKFISH_MATE_CP,
    };
  }

  // Stockfish 분석 2회: 최선수 점수 vs 실제 둔 수의 점수
  const best = await analyzePosition(beforeFen, { depth: GRADE_DEPTH, skill: 20 });
  const reply = await analyzePosition(afterFen, { depth: GRADE_DEPTH, skill: 20 });

  const toMover = (cpWhite: number): number => (mover === 'w' ? cpWhite : -cpWhite);
  const bestMover = toMover(best.scoreCpWhite);
  const playedMover = toMover(reply.scoreCpWhite);
  const loss = Math.max(0, Math.round(bestMover - playedMover));
  const evalAfterCp = Math.round(reply.scoreCpWhite);

  // 엔진의 최선수를 그대로 두었다면 '!' (메이트 찾기/희생이면 '!!')
  if (best.bestMoveUci && normUci(best.bestMoveUci) === normUci(moveUci)) {
    const matesForMover = best.mateIn != null; // beforeFen은 mover 수순이므로 mate = mover의 메이트
    const sacrificed = materialOf(beforeFen, mover) - materialOf(afterFen, mover) > 150;
    if (matesForMover || sacrificed) {
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

/**
 * 수를 평가한다. Stockfish 우선, 실패 시 구형 자체 엔진으로 폴백.
 * 절대 예외를 던지지 않아야 하는 호출자는 여기서 catch까지 처리한다.
 */
export async function evaluateMove(
  beforeFen: string,
  moveUci: string,
  afterFen: string,
): Promise<GradeResult> {
  try {
    return await gradeWithStockfish(beforeFen, moveUci, afterFen);
  } catch {
    return gradeMove(beforeFen, moveUci, afterFen);
  }
}
