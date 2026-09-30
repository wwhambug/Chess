'use client';

// ============================================================
// 하단 탭 내비게이션: 홈 / 퍼즐 / 배우기 / 중계 / 더보기
// (리체스 모바일 앱 구조 — 라인 아이콘 사용)
// ============================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconHome, IconLearn, IconMenu, IconPuzzle, IconTv } from './icons';

const TABS = [
  { href: '/', label: '홈', Icon: IconHome },
  { href: '/puzzles', label: '퍼즐', Icon: IconPuzzle },
  { href: '/learn', label: '배우기', Icon: IconLearn },
  { href: '/tv', label: '중계', Icon: IconTv },
  { href: '/more', label: '더보기', Icon: IconMenu },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#2e2b26] bg-[#161512]/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-1 pt-1">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 transition-colors ${
                active ? 'text-neutral-100' : 'text-[#8c8c8c] hover:text-[#bababa]'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2 : 1.7} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
