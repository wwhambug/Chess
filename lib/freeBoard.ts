/**
 * lib/freeBoard.ts — Admin 불법 무브 모드용 수동 포지션 조작.
 *
 * chess.js는 턴 검증·아군 캡처 금지·킹 중복 금지 등을 강제하므로
 * 불법 무브(상대 기물 이동, 아군 잡기, 킹으로 프로모션)는 chess.js로 둘 수 없다.
 * 대신 FEN 문자열을 직접 파싱/조작해서 새 FEN을 만든다.
 * 결과가 정상 포지션이면 호출자가 chess.js에 load해서 계속 쓰고,
 * 비정상이면(킹 2개 등) 보드 표시용으로만 쓴다.
 */

import { Chess } from 'chess.js';

export interface FreePiece {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
}

const FILES = 'abcdefgh';

export function squareToIndex(sq: string): number {
  const f = FILES.indexOf(sq[0]);
  const r = 8 - parseInt(sq[1], 10);
  return r * 8 + f;
}

export function indexToSquare(i: number): string {
  return FILES[i % 8] + String(8 - Math.floor(i / 8));
}

/** FEN 배치 부분을 64칸 배열로 (a8=인덱스 0 … h1=인덱스 63) */
export function parsePlacement(fen: string): (FreePiece | null)[] {
  const board: (FreePiece | null)[] = new Array(64).fill(null);
  const placement = fen.split(' ')[0];
  let i = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) {
      i += parseInt(ch, 10);
    } else {
      board[i] = {
        type: ch.toLowerCase() as FreePiece['type'],
        color: ch === ch.toUpperCase() ? 'w' : 'b',
      };
      i += 1;
    }
  }
  return board;
}

/** 64칸 배열 → FEN 배치 문자열 */
export function serializePlacement(board: (FreePiece | null)[]): string {
  const toFen = (p: FreePiece): string =>
    p.color === 'w' ? p.type.toUpperCase() : p.type;
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) {
        empty += 1;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += toFen(p);
      }
    }
    if (empty > 0) out += String(empty);
    if (r < 7) out += '/';
  }
  return out;
}

export function pieceAt(fen: string, sq: string): FreePiece | null {
  return parsePlacement(fen)[squareToIndex(sq)];
}

/**
 * 불법 무브 적용 후의 새 FEN을 반환한다.
 * - from의 기물을 to로 이동, to에 있던 기물은 색깔 무관하게 제거
 * - 폰이 마지막 랭크에 닿으면 promotion('q'|'r'|'b'|'n'|'k', 기본 'q')으로 승급
 * - 캐슬링/앙파상 권리 제거, 턴 전환
 */
export function applyFreeMove(
  fen: string,
  from: string,
  to: string,
  promotion?: string,
): string | null {
  const parts = fen.split(' ');
  if (parts.length < 2) return null;
  const board = parsePlacement(fen);
  const fromI = squareToIndex(from);
  const toI = squareToIndex(to);
  const piece = board[fromI];
  if (!piece) return null;

  const toRank = 8 - Math.floor(toI / 8); // 1~8
  let moved: FreePiece = piece;
  if (piece.type === 'p' && (toRank === 8 || toRank === 1)) {
    const promo = (promotion ?? 'q').toLowerCase();
    const t = 'qrb nk'.replace(' ', '').includes(promo) ? promo : 'q';
    moved = { type: t as FreePiece['type'], color: piece.color };
  }

  board[fromI] = null;
  board[toI] = moved;

  const turn = parts[1] === 'w' ? 'b' : 'w';
  const fullmove = parseInt(parts[5] ?? '1', 10) + (parts[1] === 'b' ? 1 : 0);
  return `${serializePlacement(board)} ${turn} - - 0 ${fullmove}`;
}

/** chess.js가 받아들일 수 있는 정상 포지션인지 (킹 2개 등은 false) */
export function isLegalPosition(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** 해당 칸의 폰이 상대 진영 끝까지 가는지 (프로모션 선택기 표시 여부) */
export function isPromotionSquare(fen: string, from: string, to: string): boolean {
  const piece = pieceAt(fen, from);
  if (!piece || piece.type !== 'p') return false;
  const toRank = 8 - Math.floor(squareToIndex(to) / 8);
  return (
    (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1)
  );
}
