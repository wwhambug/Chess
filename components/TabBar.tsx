'use client';

// ============================================================
// 하단 탭 내비게이션: 홈 / 퍼즐 / 배우기 / 중계 / 더보기
// (리체스 모바일 앱 구조)
// ============================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/puzzles', label: '퍼즐', icon: '🧩' },
  { href: '/learn', label: '배우기', icon: '🎓' },
  { href: '/tv', label: '중계', icon: '📺' },
  { href: '/more', label: '더보기', icon: '☰' },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-[#1b1a17]/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-1 pt-1">
        {TABS.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${
                active ? 'bg-neutral-800 text-amber-200' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="text-[11px] font-medium">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
