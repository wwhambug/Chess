// ============================================================
// 라인 아이콘 세트 (리체스 모바일 스타일)
// - 24x24, stroke 기반, currentColor
// - 이모지 대신 사용해 UI 밀도를 리체스에 맞춤
// ============================================================

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />
    </Base>
  );
}

export function IconPuzzle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4h6v4h4v6h-4v2.2a2.3 2.3 0 1 0 0 3.6V20H9v-4H5v-6h4V4Z" />
      <path d="M9 10v6M5 13h14" strokeWidth={1.2} opacity={0.55} />
    </Base>
  );
}

export function IconLearn(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 4.5 12 2l10 2.5L12 7 2 4.5Z" />
      <path d="M6 6.2V14c0 1.5 2.7 3 6 3s6-1.5 6-3V6.2" />
      <path d="M18 8.5V14" />
    </Base>
  );
}

export function IconTv(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="m10 9 5 2.5-5 2.5V9Z" fill="currentColor" stroke="none" />
      <path d="M9 21h6" />
    </Base>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

/** 불렛: 스피드 라인 */
export function IconBullet(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 7h9M3 12h13M3 17h9" />
      <path d="m17 5 4 2-4 2" />
    </Base>
  );
}

/** 블리츠: 번개 */
export function IconBlitz(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </Base>
  );
}

/** 래피드: 시계 */
export function IconRapid(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

/** 퍼즐: 타깃 */
export function IconTarget(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** 컴퓨터: CPU */
export function IconBot(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </Base>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 1 2.5 6" />
      <path d="M3.5 12H7M3.5 12V8.5" />
      <path d="M12 8v4l3 2" />
    </Base>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9 5 7 7-7 7" />
    </Base>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m15 5-7 7 7 7" />
    </Base>
  );
}

export function IconChevronsLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m11 5-7 7 7 7" />
      <path d="m18 5-7 7 7 7" />
    </Base>
  );
}

export function IconChevronsRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6 5 7 7-7 7" />
      <path d="m13 5 7 7-7 7" />
    </Base>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 6 3.5-6 3.5v-7Z" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </Base>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </Base>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconX(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Base>
  );
}

export function IconSwords(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m14.5 17.5-7-7M5 4l3 3M4 5l2-2M19 4l-3 3M20 5l-2-2" />
      <path d="m9.5 14.5-4.7 4.7a1.4 1.4 0 0 0 2 2l4.7-4.7M14.5 9.5l4.7-4.7a1.4 1.4 0 0 1 2 2l-4.7 4.7" />
    </Base>
  );
}
