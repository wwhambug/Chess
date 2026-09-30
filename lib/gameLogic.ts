// ============================================================
// 대국 생성 / Elo 레이팅 계산
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Challenge } from './db';

const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * 챌린지를 수락하고 대국(games 행)을 생성한다.
 *
 * - color_choice가 'white'/'black'이면 생성자가 해당 색을 가져감
 * - 'random'이면 무작위로 색을 배정
 * - challenge 상태를 'accepted'로 바꾸고 game_id를 연결
 * - 동시 수락 레이스 방지: status='open' 조건 업데이트가 0행을
 *   건드리면 이미 수락된 것으로 보고 생성한 대국을 롤백 후 throw
 *
 * @returns 생성된 game id
 */
export async function acceptChallenge(
  supabase: SupabaseClient,
  challenge: Challenge,
  acceptorId: string,
): Promise<string> {
  let whiteId: string;
  let blackId: string;
  const choice = challenge.color_choice;
  if (choice === 'white') {
    whiteId = challenge.creator_id;
    blackId = acceptorId;
  } else if (choice === 'black') {
    whiteId = acceptorId;
    blackId = challenge.creator_id;
  } else {
    // random
    if (Math.random() < 0.5) {
      whiteId = challenge.creator_id;
      blackId = acceptorId;
    } else {
      whiteId = acceptorId;
      blackId = challenge.creator_id;
    }
  }

  const { data: game, error: gErr } = await supabase
    .from('games')
    .insert({
      white_id: whiteId,
      black_id: blackId,
      time_control: challenge.time_control,
      fen: STARTPOS,
      turn: 'w',
      rated: true,
    })
    .select('id')
    .single();
  if (gErr || !game) throw gErr ?? new Error('대국 생성에 실패했습니다.');

  const gameId = (game as { id: string }).id;

  // status='open' 조건으로 낙관적 동시성 제어
  const { data: updated, error: cErr } = await supabase
    .from('challenges')
    .update({ status: 'accepted', game_id: gameId })
    .eq('id', challenge.id)
    .eq('status', 'open')
    .select('id');
  if (cErr) {
    await supabase.from('games').delete().eq('id', gameId);
    throw cErr;
  }
  if (!updated || (updated as unknown[]).length === 0) {
    // 다른 사람이 먼저 수락함 → 만든 대국 롤백
    await supabase.from('games').delete().eq('id', gameId);
    throw new Error('이미 수락된 챌린지입니다.');
  }

  return gameId;
}

/**
 * Elo 레이팅 계산 (K=32)
 * @param result 'w' = 백 승, 'b' = 흑 승, 'draw' = 무승부
 * @returns 갱신된 { white, black } 레이팅 (반올림된 정수)
 */
export function applyElo(
  whiteR: number,
  blackR: number,
  result: 'w' | 'b' | 'draw',
): { white: number; black: number } {
  const K = 32;
  const expected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));
  const [whiteScore, blackScore] =
    result === 'w' ? [1, 0] : result === 'b' ? [0, 1] : [0.5, 0.5];
  return {
    white: Math.round(whiteR + K * (whiteScore - expected(whiteR, blackR))),
    black: Math.round(blackR + K * (blackScore - expected(blackR, whiteR))),
  };
}
