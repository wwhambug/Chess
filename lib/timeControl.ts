// ============================================================
// 시간 제어 (Time Control) 정의
// ============================================================

export interface TimeControl {
  /** DB에 저장되는 식별자 (예: 'blitz-5-0') */
  id: string;
  /** 표시용 라벨 (예: 'Blitz 5+0') */
  label: string;
  /** 기본 시간 (밀리초) */
  baseMs: number;
  /** 수당 증가 시간 (밀리초, 피셔 방식) */
  incMs: number;
  /** 분류 */
  category: 'Bullet' | 'Blitz' | 'Rapid';
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'bullet-1-0', label: 'Bullet 1+0', baseMs: 60_000, incMs: 0, category: 'Bullet' },
  { id: 'bullet-2-1', label: 'Bullet 2+1', baseMs: 120_000, incMs: 1_000, category: 'Bullet' },
  { id: 'blitz-3-0', label: 'Blitz 3+0', baseMs: 180_000, incMs: 0, category: 'Blitz' },
  { id: 'blitz-5-0', label: 'Blitz 5+0', baseMs: 300_000, incMs: 0, category: 'Blitz' },
  { id: 'rapid-10-0', label: 'Rapid 10+0', baseMs: 600_000, incMs: 0, category: 'Rapid' },
];

/** 기본값 (로비/빠른 매칭의 기본 선택) */
export const DEFAULT_TC_ID = 'blitz-5-0';

/** 커스텀 시간제 id */
export const CUSTOM_TC_ID = 'custom';

/** 커스텀 시간제 생성 (분 + 초읽기) */
export function customTC(
  baseMin: number,
  incSec: number,
): { baseMs: number; incMs: number; label: string } {
  const m = Math.max(0.5, Math.min(180, baseMin));
  const s = Math.max(0, Math.min(180, incSec));
  return {
    baseMs: Math.round(m * 60_000),
    incMs: Math.round(s * 1000),
    label: `커스텀 ${m}+${s}`,
  };
}

/**
 * 시간 제어 id → { baseMs, incMs, label }
 * 알 수 없는 id가 들어오면 기본값(Blitz 5+0)을 반환한다.
 */
export function parseTC(id: string): { baseMs: number; incMs: number; label: string } {
  const tc = TIME_CONTROLS.find((t) => t.id === id);
  if (!tc) {
    const d = TIME_CONTROLS.find((t) => t.id === DEFAULT_TC_ID)!;
    return { baseMs: d.baseMs, incMs: d.incMs, label: d.label };
  }
  return { baseMs: tc.baseMs, incMs: tc.incMs, label: tc.label };
}

/**
 * 밀리초 → "m:ss.d" 형식 (예: 299950 → "4:59.9")
 * 음수는 0으로 클램프한다.
 */
export function formatClock(ms: number): string {
  const m = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(m / 60_000);
  const seconds = Math.floor((m % 60_000) / 1000);
  const tenths = Math.floor((m % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
