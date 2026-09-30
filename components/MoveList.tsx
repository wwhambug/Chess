'use client';

// ============================================================
// 기보 목록: 수 번호별 2열 (SAN + 평가 주석 기호를 수 바로 옆에 표시)
// ============================================================

import type { Move } from '../lib/db';
import { annotationColor, annotationLabel } from '../lib/annotations';

/** 수 옆에 평가 주석 기호 표시 (???/??/?/★/!/!!/!!!) */
export function AnnotatedSan({ san, annotation }: { san: string; annotation: string | null }) {
  const color = annotationColor(annotation);
  const label = annotationLabel(annotation);
  return (
    <span className="font-medium text-neutral-200">
      {san}
      {annotation ? (
        <span className={`font-black ${color}`} title={label || '수 평가'}>
          {annotation}
        </span>
      ) : null}
    </span>
  );
}

export function MoveList({
  moves,
  selectedPly,
  onSelectPly,
}: {
  moves: Move[];
  selectedPly?: number | null;
  onSelectPly?: (ply: number | null) => void;
}) {
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
          {pair.map((mv) => {
            const isSel = selectedPly === mv.ply;
            const clickable = !!onSelectPly;
            return (
              <button
                key={mv.ply}
                type="button"
                disabled={!clickable}
                onClick={() => onSelectPly?.(isSel ? null : mv.ply)}
                className={`w-1/2 truncate pr-1 text-left ${
                  isSel ? 'rounded bg-[#3692e7]/25' : ''
                } ${clickable ? 'cursor-pointer hover:bg-neutral-700/40' : ''}`}
              >
                <AnnotatedSan san={mv.san ?? ''} annotation={mv.annotation} />
              </button>
            );
          })}
          {pair.length === 1 && <span className="w-1/2" />}
        </li>
      ))}
    </ol>
  );
}
