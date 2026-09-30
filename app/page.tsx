'use client';

// ============================================================
// 홈: 리체스 모바일 스타일 대시보드
// - 시간대별 인사말, 타임컨트롤별 레이팅 카드, 친구들, 최근 대국
// - 하단 탭 내비게이션은 layout의 TabBar가 담당
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { TIME_CONTROLS } from '../lib/timeControl';
import type { Game, Profile } from '../lib/db';
import { useAuth } from '../components/AuthProvider';

export const dynamic = 'force-dynamic';

/** 시간대별 인사말 */
function greeting(): { icon: string; text: string } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { icon: '☀️', text: '좋은 아침이에요' };
  if (h >= 12 && h < 18) return { icon: '☀️', text: '좋은 낮이에요' };
  if (h >= 18 && h < 24) return { icon: '🌙', text: '좋은 저녁이에요' };
  return { icon: '🌙', text: '좋은 밤이에요' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}주 전`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

const CATEGORY_ICON: Record<string, string> = {
  Bullet: '💥',
  Blitz: '⚡',
  Rapid: '🐇',
};

function categoryOf(tcId: string): string {
  return TIME_CONTROLS.find((t) => t.id === tcId)?.category ?? 'Blitz';
}

type GameWithOpponent = Game & { opponent: Profile | null };

export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [friends, setFriends] = useState<Profile[]>([]);
  const [games, setGames] = useState<GameWithOpponent[]>([]);

  // 친구 목록 (수락된 관계)
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    (async () => {
      const me = user.id;
      const { data: fs } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
      const ids = [...new Set(((fs ?? []) as { requester_id: string; addressee_id: string }[]).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id)))];
      if (ids.length === 0) {
        setFriends([]);
        return;
      }
      const { data: ps } = await supabase.from('profiles').select('id, username, rating').in('id', ids);
      setFriends(((ps ?? []) as Profile[]).slice(0, 10));
    })();
  }, [authLoading, user?.id, configured]);

  // 최근 대국 (종료된 것만)
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    (async () => {
      const me = user.id;
      const { data: gs } = await supabase
        .from('games')
        .select('*')
        .or(`white_id.eq.${me},black_id.eq.${me}`)
        .neq('status', 'ongoing')
        .order('created_at', { ascending: false })
        .limit(8);
      const rows = ((gs ?? []) as Game[]);
      const oppIds = [...new Set(rows.map((g) => (g.white_id === me ? g.black_id : g.white_id)))];
      let oppMap: Record<string, Profile> = {};
      if (oppIds.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, username, rating').in('id', oppIds);
        for (const p of ((ps ?? []) as Profile[])) oppMap[p.id] = p;
      }
      setGames(rows.map((g) => ({ ...g, opponent: oppMap[g.white_id === me ? g.black_id : g.white_id] ?? null })));
    })();
  }, [authLoading, user?.id, configured]);

  const g = greeting();

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-amber-200">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">.env.local</code>에 Supabase URL과
          anon key를 설정한 뒤 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  if (authLoading) {
    return <p className="px-4 py-16 text-center text-sm text-neutral-500">불러오는 중…</p>;
  }

  const myId = user?.id;

  const resultOf = (game: Game): 'win' | 'loss' | 'draw' => {
    if (game.status === 'draw') return 'draw';
    const iWon = (game.status === 'white_won') === (game.white_id === myId);
    return iWon ? 'win' : 'loss';
  };

  const ratingCards = [
    { label: '불렛', icon: '💥', value: profile ? `${profile.rating}?` : '–' },
    { label: '블리츠', icon: '⚡', value: profile ? `${profile.rating}?` : '–' },
    { label: '래피드', icon: '🐇', value: profile ? `${profile.rating}?` : '–' },
    { label: '퍼즐', icon: '🎯', value: '–' },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-5">
      {/* 인사말 */}
      <h1 className="text-xl font-bold text-neutral-100">
        {g.icon} {g.text}
        {profile ? `, ${profile.username}님` : '!'}
      </h1>

      {!user ? (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-[#1b1a17] p-6 text-center">
          <p className="text-2xl">♞</p>
          <p className="mt-2 text-sm text-neutral-400">로그인하고 실시간 대국을 시작해 보세요.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            로그인 / 회원가입
          </Link>
        </div>
      ) : (
        <>
          {/* 레이팅 카드 */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {ratingCards.map((c) => (
              <div
                key={c.label}
                className="min-w-[104px] flex-1 rounded-lg border border-neutral-800 bg-[#1b1a17] px-3 py-3 text-center"
              >
                <div className="text-xs text-neutral-400">{c.label}</div>
                <div className="my-1 text-2xl">{c.icon}</div>
                <div className="text-base font-bold text-neutral-100">{c.value}</div>
              </div>
            ))}
          </div>

          {/* 친구들 */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-neutral-100">친구들</h2>
              <Link href="/friends" className="text-sm text-blue-400 hover:text-blue-300">
                더보기 ›
              </Link>
            </div>
            {friends.length === 0 ? (
              <p className="mt-2 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-4 text-center text-sm text-neutral-500">
                아직 친구가 없습니다.{' '}
                <Link href="/friends" className="text-blue-400">
                  친구 추가하기
                </Link>
              </p>
            ) : (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {friends.map((f) => (
                  <Link
                    key={f.id}
                    href="/friends"
                    className="min-w-[150px] rounded-lg border border-neutral-800 bg-[#1b1a17] px-3 py-3 hover:border-neutral-600"
                  >
                    <div className="truncate text-sm font-semibold text-neutral-100">{f.username}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">레이팅 {f.rating}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 최근 대국 */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-neutral-100">최근 대국</h2>
              <Link href="/history" className="text-sm text-blue-400 hover:text-blue-300">
                더보기 ›
              </Link>
            </div>
            {games.length === 0 ? (
              <p className="mt-2 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-4 text-center text-sm text-neutral-500">
                아직 둔 대국이 없습니다. 플레이 버튼으로 시작해 보세요!
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-800/60 rounded-lg border border-neutral-800 bg-[#1b1a17]">
                {games.map((game) => {
                  const r = resultOf(game);
                  return (
                    <li key={game.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-2xl">{CATEGORY_ICON[categoryOf(game.time_control)] ?? '♞'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-neutral-100">
                          {game.opponent?.username ?? '알 수 없음'}{' '}
                          <span className="font-normal text-neutral-500">
                            {game.opponent ? game.opponent.rating : ''}
                          </span>
                        </span>
                        <span className="block text-xs text-neutral-500">{timeAgo(game.created_at)}</span>
                      </span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-lg font-black ${
                          r === 'win'
                            ? 'bg-green-500/20 text-green-400'
                            : r === 'loss'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-orange-500/20 text-orange-400'
                        }`}
                        title={r === 'win' ? '승리' : r === 'loss' ? '패배' : '무승부'}
                      >
                        {r === 'win' ? '+' : r === 'loss' ? '−' : '='}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* 플레이 FAB */}
      <Link
        href="/lobby"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-blue-500"
      >
        <span className="text-lg leading-none">♟</span> 플레이
      </Link>
    </div>
  );
}
