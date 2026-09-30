'use client';

// ============================================================
// 프로모션 선택기: 실제 기물 이미지 버튼 (이모지 사용 금지)
// 불법 무브 모드에서는 킹(K)으로도 프로모션 가능
// ============================================================

import { PieceImage } from './KnightLogo';

const CHOICES = [
  { id: 'q', label: '퀸' },
  { id: 'r', label: '룩' },
  { id: 'b', label: '비숍' },
  { id: 'n', label: '나이트' },
] as const;

export function PromotionPicker({
  color,
  allowKing = false,
  onPick,
}: {
  color: 'w' | 'b';
  allowKing?: boolean;
  onPick: (piece: 'q' | 'r' | 'b' | 'n' | 'k' | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={() => onPick(null)}
    >
      <div
        className="rounded-xl border border-[#2e2b26] bg-[#262421] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-semibold text-neutral-200">
          프로모션 기물 선택
        </p>
        <div className="flex gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className="flex flex-col items-center gap-1 rounded-lg border border-neutral-700 bg-[#1b1a17] p-2 hover:border-[#3692e7]"
              aria-label={c.label}
            >
              <PieceImage color={color} piece={c.id} size={48} />
              <span className="text-[11px] text-neutral-400">{c.label}</span>
            </button>
          ))}
          {allowKing && (
            <button
              onClick={() => onPick('k')}
              className="flex flex-col items-center gap-1 rounded-lg border border-red-800 bg-[#1b1a17] p-2 hover:border-red-500"
              aria-label="킹 (불법)"
            >
              <PieceImage color={color} piece="k" size={48} />
              <span className="text-[11px] text-red-400">킹!</span>
            </button>
          )}
        </div>
        <button
          onClick={() => onPick(null)}
          className="mt-3 w-full rounded-md border border-neutral-700 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
        >
          취소
        </button>
      </div>
    </div>
  );
}
