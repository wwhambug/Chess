// ============================================================
// Supabase 스키마와 1:1로 대응하는 TypeScript 인터페이스
// (스키마 정의는 supabase/schema.sql 참조)
// ============================================================

export interface Profile {
  id: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export type ChallengeStatus = 'open' | 'accepted' | 'cancelled';
export type ColorChoice = 'white' | 'black' | 'random';

export interface Challenge {
  id: string;
  creator_id: string;
  invitee_id: string | null;
  time_control: string;
  color_choice: ColorChoice;
  status: ChallengeStatus;
  game_id: string | null;
  created_at: string;
}

export type GameStatus = 'ongoing' | 'white_won' | 'black_won' | 'draw';
export type ResultReason = 'checkmate' | 'resign' | 'timeout' | 'agreement' | 'stalemate' | null;

export interface Game {
  id: string;
  white_id: string;
  black_id: string;
  time_control: string;
  status: GameStatus;
  result_reason: ResultReason;
  fen: string;
  turn: 'w' | 'b';
  draw_offer_by: string | null;
  rated: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface Move {
  id: string;
  game_id: string;
  /** 1부터 시작하는 수 번호 (백 1수 = ply 1) */
  ply: number;
  color: 'w' | 'b';
  san: string | null;
  uci: string | null;
  fen_after: string | null;
  /** 수 평가 주석: '!!' | '!' | '!?' | '?!' | '?' | '??' */
  annotation: string | null;
  /** 백 관점 평가값 (센티폰) */
  eval_cp: number | null;
  white_clock_ms: number;
  black_clock_ms: number;
  moved_at: string;
}

/** 결과 사유 → 한국어 라벨 */
export const RESULT_REASON_LABEL: Record<string, string> = {
  checkmate: '체크메이트',
  resign: '기권',
  timeout: '시간 초과',
  agreement: '무승부 합의',
  stalemate: '스테일메이트',
};

export function resultReasonLabel(reason: string | null): string {
  if (!reason) return '무승부 규정';
  return RESULT_REASON_LABEL[reason] ?? reason;
}
