'use client';

// ============================================================
// 상단 바: 로고 + 닉네임/레이팅 칩 (모바일 우선, 슬림)
// ============================================================

import Link from 'next/link';
import { useAuth } from './AuthProvider';

export function TopBar() {
  const { user, profile, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#161512]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-neutral-100">
          ♞ 체스
        </Link>
        <div className="ml-auto">
          {loading ? (
            <span className="text-sm text-neutral-500">…</span>
          ) : user && profile ? (
            <span className="rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-300">
              <span className="font-semibold text-amber-100">{profile.username}</span>
              <span className="ml-1.5 text-xs text-neutral-500">{profile.rating}</span>
            </span>
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
