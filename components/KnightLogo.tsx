'use client';

// ============================================================
// 나이트 로고: 다운로드한 실제 SVG 이미지 (이모지 대체 금지)
// ============================================================

export function KnightLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/knight-logo.svg"
      alt="체스 나이트 로고"
      width={size}
      height={size}
      className={`inline-block ${className}`}
      draggable={false}
    />
  );
}

/** 기물 이미지 (프로모션 선택 등에서 사용). color: 'w' | 'b', piece: 'kqrbnp' */
export function PieceImage({
  color,
  piece,
  size = 40,
  className = '',
}: {
  color: 'w' | 'b';
  piece: 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={`/pieces/${color}${piece}.svg`}
      alt={`${color}${piece}`}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      draggable={false}
    />
  );
}
