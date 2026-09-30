'use client';

// ============================================================
// 기보 목록: 수 번호별 2열(SAN + 평가 주석 배지)
// ============================================================

import type { Move } from '../lib/db';

/** 주석 → 배지 색상 (Lichess 스타일) */
const ANNOTATION_STYLES: Record<string, string> = {
  '!!': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  '!': 'bg-green-500/20 text-green-400 border-green-500/40',
  '!?': 'bg-lime-500/20 text-lime-300 border-lime-500/40',
  '?!': 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  '?': 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  '??': 'bg-red-500/20 text-red-400 border-red-500/40',
};

export function AnnotationBadge({ annotation }: { annotation: string | null }) {
  if (!annotation) return null;
  const style = ANNOTATION_STYLES[annotation] ?? 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40';
  return (
    <span
      className={`ml-1 inline-block rounded border px-1 text-[10px] font-bold leading-4 ${style}`}
      title="수 평가"
    >
      {annotation}
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
            <span key={mv.ply} className="w-1/2 truncate pr-1 font-medium text-neutral-200">
              {mv.san ?? ''}
              <AnnotationBadge annotation={mv.annotation} />
            </span>
          ))}
          {pair.length === 1 && <span className="w-1/2" />}
        </li>
      ))}
    </ol>
  );
}
