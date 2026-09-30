'use client';

// ============================================================
// 상단 네비게이션 바: 로비 / 친구 / 기록 + 닉네임·레이팅 + 로그아웃
// ============================================================

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

const LINKS = [
  { href: '/', label: '로비' },
  { href: '/friends', label: '친구' },
  { href: '/history', label: '기록' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#1b1a17]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-amber-100">
          ♞ 체스
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-neutral-800 text-amber-200'
                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-neutral-500">…</span>
          ) : user && profile ? (
            <>
              <span className="text-sm text-neutral-300">
                <span className="font-semibold text-amber-100">{profile.username}</span>
                <span className="ml-1.5 text-xs text-neutral-500">({profile.rating})</span>
              </span>
              <button
                onClick={handleSignOut}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
