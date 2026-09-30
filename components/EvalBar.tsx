'use client';

// ============================================================
// 평가 막대: 백 관점 센티폰(cp) → 흰색 영역 높이 = 백 승률
// ============================================================

import { formatEval, winProbability } from '../lib/evalClient';

export function EvalBar({ cp }: { cp: number | null }) {
  const pct = cp == null ? 50 : Math.max(0, Math.min(100, winProbability(cp) * 100));
  return (
    <div
      className="relative w-9 shrink-0 self-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-900"
      title={cp == null ? '평가 없음' : `평가: ${formatEval(cp)}`}
    >
      {/* 흰색 영역 (아래에서 위로 채움) */}
      <div
        className="absolute bottom-0 left-0 w-full bg-neutral-100 transition-[height] duration-500"
        style={{ height: `${pct}%` }}
      />
      {/* 수치 라벨 */}
      <div className="absolute inset-x-0 bottom-1 z-10 text-center">
        <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] font-semibold text-neutral-200">
          {formatEval(cp)}
        </span>
      </div>
    </div>
  );
}
