'use client';

// ============================================================
// 기보 목록: 수 번호별 2열 (SAN + 평가 주석 기호를 수 바로 옆에 표시)
// ============================================================

import type { Move } from '../lib/db';

/** 주석 기호 → 색상 (리체스 스타일: 수 옆에 !! ? 등을 직접 표기) */
const ANNOTATION_COLORS: Record<string, string> = {
  '!!': 'text-cyan-300',
  '!': 'text-green-400',
  '!?': 'text-lime-300',
  '?!': 'text-[#e8c15a]',
  '?': 'text-orange-400',
  '??': 'text-red-400',
};

export function AnnotatedSan({ san, annotation }: { san: string; annotation: string | null }) {
  const color = annotation ? (ANNOTATION_COLORS[annotation] ?? 'text-neutral-300') : '';
  return (
    <span className="font-medium text-neutral-200">
      {san}
      {annotation ? (
        <span className={`font-black ${color}`} title="수 평가">
          {annotation}
        </span>
      ) : null}
    </span>
  );
}

export function MoveList({ moves }: { moves: Move[] }) {
  if (moves.length === 0) {
    return <p className="px-2 py-4 text-center text-sm text-neutral-500">아직 둔 수가 없습니다.</p>;
  }
  const rows: Move[][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push([moves[i], moves[i + 1]].filter(Boolean) as Move[]);
  }
  return (
    <ol className="divide-y divide-neutral-800/60 text-sm">
      {rows.map((pair, idx) => (
        <li key={idx} className="flex items-center px-2 py-1 hover:bg-neutral-800/40">
          <span className="w-8 shrink-0 text-xs text-neutral-500">{idx + 1}.</span>
          {pair.map((mv) => (
            <span key={mv.ply} className="w-1/2 truncate pr-1">
              <AnnotatedSan san={mv.san ?? ''} annotation={mv.annotation} />
            </span>
          ))}
          {pair.length === 1 && <span className="w-1/2" />}
        </li>
      ))}
    </ol>
  );
}
