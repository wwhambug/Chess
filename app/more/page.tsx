'use client';

// ============================================================
// 더보기 탭: 친구 / 기록 / 컴퓨터와 대결 / 로그인·로그아웃
// ============================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export const dynamic = 'force-dynamic';

export default function MorePage() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const items = [
    { href: '/friends', icon: '🤝', label: '친구' },
    { href: '/history', icon: '🕘', label: '대국 기록' },
    { href: '/computer', icon: '🤖', label: '컴퓨터와 대결' },
    { href: '/lobby', icon: '♟', label: '로비 (매칭·챌린지)' },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="text-xl font-bold text-neutral-100">더보기</h1>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">불러오는 중…</p>
      ) : user && profile ? (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-3">
          <div className="text-sm font-semibold text-amber-100">{profile.username}</div>
          <div className="mt-0.5 text-xs text-neutral-500">
            레이팅 {profile.rating} · {profile.wins}승 {profile.draws}무 {profile.losses}패
          </div>
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-neutral-800/60 rounded-lg border border-neutral-800 bg-[#1b1a17]">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-800/40">
              <span className="text-xl">{it.icon}</span>
              <span className="text-sm font-medium text-neutral-200">{it.label}</span>
              <span className="ml-auto text-neutral-600">›</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {user ? (
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            로그아웃
          </button>
        ) : (
          <Link
            href="/login"
            className="block w-full rounded-lg bg-amber-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-500"
          >
            로그인 / 회원가입
          </Link>
        )}
      </div>
    </div>
  );
}
