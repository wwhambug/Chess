'use client';

// ============================================================
// 잡은 기물 표시 (리체스/체스닷컴 스타일)
// - FEN에서 양쪽이 잃은 기물을 계산해 작은 아이콘으로 나열
// - 점수 차이는 +N 으로 표시
// ============================================================

import { useMemo } from 'react';

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER = ['q', 'r', 'b', 'n', 'p'];

function pieceSrc(color: 'w' | 'b', type: string): string {
  return `/pieces/${color}${type}.svg`;
}

export function CapturedPieces({ fen, byWhite }: { fen: string; byWhite: boolean }) {
  const { icons, scoreDiff } = useMemo(() => {
    const counts: Record<string, number> = {};
    const board = fen.split(' ')[0];
    for (const ch of board) {
      if (/[pnbrqkPNBRQK]/.test(ch)) {
        counts[ch] = (counts[ch] ?? 0) + 1;
      }
    }
    // byWhite=true → 백이 잡은 흑 기물 (소문자)
    const captured: string[] = [];
    let myMat = 0;
    let oppMat = 0;
    for (const t of ORDER) {
      const mine = byWhite ? t.toLowerCase() : t.toUpperCase();
      const theirs = byWhite ? t.toUpperCase() : t.toLowerCase();
      const missing = (START_COUNT[t] ?? 0) - (counts[mine] ?? 0);
      for (let i = 0; i < missing; i++) captured.push(mine);
      myMat += (counts[theirs] ?? 0) * (VALUES[t] ?? 0);
      oppMat += (counts[mine] ?? 0) * (VALUES[t] ?? 0);
    }
    return { icons: captured, scoreDiff: myMat - oppMat };
  }, [fen, byWhite]);

  if (icons.length === 0 && scoreDiff <= 0) return null;

  return (
    <div className="flex min-h-[20px] items-center gap-0.5">
      <div className="flex -space-x-1.5">
        {icons.map((p, i) => {
          const color = p === p.toLowerCase() ? 'b' : 'w';
          return (
            <img
              key={i}
              src={pieceSrc(color, p.toLowerCase())}
              alt={p}
              className="h-5 w-5"
              draggable={false}
            />
          );
        })}
      </div>
      {scoreDiff > 0 && (
        <span className="ml-1 text-xs font-semibold text-neutral-400">+{scoreDiff}</span>
      )}
    </div>
  );
}
