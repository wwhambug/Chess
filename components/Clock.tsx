'use client';

// ============================================================
// 체스 시계 표시 (formatClock: "m:ss.d")
// ============================================================

import { formatClock } from '../lib/timeControl';

interface ClockProps {
  /** 남은 시간 (밀리초) */
  ms: number;
  /** 현재 수순인 쪽인지 (강조 표시) */
  active: boolean;
  /** 라벨 (예: 상대 닉네임) */
  label?: string;
}

export function Clock({ ms, active, label }: ClockProps) {
  const low = ms < 20_000;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 transition-colors ${
        active ? 'border-[#3692e7]/70 bg-neutral-800' : 'border-neutral-800 bg-neutral-900/60'
      }`}
    >
      {label && <span className="truncate text-xs text-neutral-400">{label}</span>}
      <span
        className={`font-mono text-xl font-bold tabular-nums ${
          low ? 'text-red-400' : active ? 'text-[#9ccbf5]' : 'text-neutral-300'
        }`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}
