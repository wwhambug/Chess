'use client';

// ============================================================
// 홈: 리체스 모바일 스타일 대시보드
// - 진행 중인 대국 (이어 두기) / 인사말 / 시간제별 레이팅 카드
// - 친구들 / 최근 대국
// - 하단 탭 내비게이션은 layout의 TabBar가 담당
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { parseTC } from '../lib/timeControl';
import type { Game, Profile } from '../lib/db';
import { useAuth } from '../components/AuthProvider';
import {
  IconBlitz,
  IconBot,
  IconBullet,
  IconChevronRight,
  IconPlay,
  IconRapid,
  IconTarget,
} from '../components/icons';

export const dynamic = 'force-dynamic';

/** 시간대별 인사말 */
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '좋은 아침이에요';
  if (h >= 12 && h < 18) return '좋은 낮이에요';
  if (h >= 18 && h < 24) return '좋은 저녁이에요';
  return '좋은 밤이에요';
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

type GameWithOpponent = Game & { opponent: Profile | null };

async function attachOpponents(
  rows: Game[],
  me: string,
): Promise<GameWithOpponent[]> {
  const oppIds = [...new Set(rows.map((g) => (g.white_id === me ? g.black_id : g.white_id)))];
  let oppMap: Record<string, Profile> = {};
  if (oppIds.length > 0) {
    const { data: ps } = await supabase.from('profiles').select('id, username, rating').in('id', oppIds);
    for (const p of ((ps ?? []) as Profile[])) oppMap[p.id] = p;
  }
  return rows.map((g) => ({
    ...g,
    opponent: oppMap[g.white_id === me ? g.black_id : g.white_id] ?? null,
  }));
}

export default function HomePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [friends, setFriends] = useState<Profile[]>([]);
  const [games, setGames] = useState<GameWithOpponent[]>([]);
  const [ongoing, setOngoing] = useState<GameWithOpponent[]>([]);

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

  // 진행 중인 대국 + 최근 대국
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    (async () => {
      const me = user.id;
      const [{ data: og }, { data: gs }] = await Promise.all([
        supabase
          .from('games')
          .select('*')
          .or(`white_id.eq.${me},black_id.eq.${me}`)
          .eq('status', 'ongoing')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('games')
          .select('*')
          .or(`white_id.eq.${me},black_id.eq.${me}`)
          .neq('status', 'ongoing')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      setOngoing(await attachOpponents(((og ?? []) as Game[]), me));
      setGames(await attachOpponents(((gs ?? []) as Game[]), me));
    })();
  }, [authLoading, user?.id, configured]);

  const g = greeting();

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-neutral-200">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-[#8c8c8c]">
          <code className="rounded bg-[#262421] px-1.5 py-0.5 text-xs">.env.local</code>에 Supabase URL과
          anon key를 설정한 뒤 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  if (authLoading) {
    return <p className="px-4 py-16 text-center text-sm text-[#8c8c8c]">불러오는 중…</p>;
  }

  const myId = user?.id;

  const resultOf = (game: Game): 'win' | 'loss' | 'draw' => {
    if (game.status === 'draw') return 'draw';
    const iWon = (game.status === 'white_won') === (game.white_id === myId);
    return iWon ? 'win' : 'loss';
  };

  const myTurnOf = (game: Game): boolean => {
    if (!myId) return false;
    return (game.turn === 'w') === (game.white_id === myId);
  };

  const ratingCards = [
    { label: '불렛', Icon: IconBullet, value: profile ? `${profile.rating}?` : '–' },
    { label: '블리츠', Icon: IconBlitz, value: profile ? `${profile.rating}?` : '–' },
    { label: '래피드', Icon: IconRapid, value: profile ? `${profile.rating}?` : '–' },
    { label: '퍼즐', Icon: IconTarget, value: '–' },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-5">
      {/* 인사말 */}
      <h1 className="text-xl font-bold text-[#cccccc]">
        {g}
        {profile ? `, ${profile.username}님` : '!'}
      </h1>

      {!user ? (
        <>
          <div className="mt-6 rounded-lg border border-[#2e2b26] bg-[#262421] p-6 text-center">
            <p className="text-2xl text-neutral-300">♞</p>
            <p className="mt-2 text-sm text-[#8c8c8c]">로그인하고 실시간 대국을 시작해 보세요.</p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-md bg-[#3692e7] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4a9fee]"
            >
              로그인 / 회원가입
            </Link>
          </div>
          {/* 로그인 없이 바로 즐길 수 있는 메뉴 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/computer"
              className="flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] p-4 hover:border-[#3692e7]/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
                <IconBot size={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#cccccc]">컴퓨터와 대결</span>
                <span className="block text-xs text-[#8c8c8c]">로그인 없이 바로</span>
              </span>
            </Link>
            <Link
              href="/puzzles"
              className="flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] p-4 hover:border-[#3692e7]/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
                <IconTarget size={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#cccccc]">퍼즐</span>
                <span className="block text-xs text-[#8c8c8c]">로그인 없이 바로</span>
              </span>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* 진행 중인 대국 */}
          {ongoing.length > 0 && (
            <section className="mt-4">
              <h2 className="text-base font-bold text-[#cccccc]">진행 중인 대국</h2>
              <ul className="mt-2 space-y-2">
                {ongoing.map((game) => {
                  const myTurn = myTurnOf(game);
                  return (
                    <li key={game.id}>
                      <Link
                        href={`/play/${game.id}`}
                        className="flex items-center gap-3 rounded-lg border border-[#3692e7]/40 bg-[#262421] px-4 py-3 hover:border-[#3692e7]"
                      >
                        <span className="relative flex h-2.5 w-2.5">
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                              myTurn ? 'bg-[#3692e7]' : 'bg-[#8c8c8c]'
                            }`}
                          />
                          <span
                            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                              myTurn ? 'bg-[#3692e7]' : 'bg-[#8c8c8c]'
                            }`}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#cccccc]">
                            {game.opponent?.username ?? '알 수 없음'}{' '}
                            <span className="font-normal text-[#8c8c8c]">
                              {game.opponent ? game.opponent.rating : ''}
                            </span>
                          </span>
                          <span className="block text-xs text-[#8c8c8c]">
                            {parseTC(game.time_control).label} ·{' '}
                            {myTurn ? (
                              <span className="font-semibold text-[#3692e7]">내 차례</span>
                            ) : (
                              '상대 차례'
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold text-[#3692e7]">
                          이어 두기 <IconChevronRight size={16} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* 레이팅 카드 */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {ratingCards.map(({ label, Icon, value }) => (
              <div
                key={label}
                className="min-w-[104px] flex-1 rounded-lg border border-[#2e2b26] bg-[#262421] px-3 py-3 text-center"
              >
                <div className="text-xs text-[#8c8c8c]">{label}</div>
                <div className="my-1.5 flex justify-center text-[#8c8c8c]">
                  <Icon size={22} />
                </div>
                <div className="text-base font-bold text-[#cccccc]">{value}</div>
              </div>
            ))}
          </div>

          {/* 친구들 */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-[#cccccc]">친구들</h2>
              <Link href="/friends" className="text-sm text-[#3692e7] hover:text-[#4a9fee]">
                더보기 ›
              </Link>
            </div>
            {friends.length === 0 ? (
              <p className="mt-2 rounded-lg border border-[#2e2b26] bg-[#262421] px-4 py-4 text-center text-sm text-[#8c8c8c]">
                아직 친구가 없습니다.{' '}
                <Link href="/friends" className="text-[#3692e7]">
                  친구 추가하기
                </Link>
              </p>
            ) : (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {friends.map((f) => (
                  <Link
                    key={f.id}
                    href="/friends"
                    className="min-w-[150px] rounded-lg border border-[#2e2b26] bg-[#262421] px-3 py-3 hover:border-[#4a4a44]"
                  >
                    <div className="truncate text-sm font-semibold text-[#cccccc]">{f.username}</div>
                    <div className="mt-0.5 text-xs text-[#8c8c8c]">레이팅 {f.rating}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 최근 대국 */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-[#cccccc]">최근 대국</h2>
              <Link href="/history" className="text-sm text-[#3692e7] hover:text-[#4a9fee]">
                더보기 ›
              </Link>
            </div>
            {games.length === 0 ? (
              <p className="mt-2 rounded-lg border border-[#2e2b26] bg-[#262421] px-4 py-4 text-center text-sm text-[#8c8c8c]">
                아직 둔 대국이 없습니다. 플레이 버튼으로 시작해 보세요!
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[#2e2b26]/70 rounded-lg border border-[#2e2b26] bg-[#262421]">
                {games.map((game) => {
                  const r = resultOf(game);
                  return (
                    <li key={game.id}>
                      <Link href={`/play/${game.id}`} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-md text-lg font-black ${
                            r === 'win'
                              ? 'bg-[#629924]/20 text-[#9ccc65]'
                              : r === 'loss'
                                ? 'bg-[#c0413b]/20 text-[#e07a74]'
                                : 'bg-[#e8a039]/20 text-[#e8a039]'
                          }`}
                          title={r === 'win' ? '승리' : r === 'loss' ? '패배' : '무승부'}
                        >
                          {r === 'win' ? '+' : r === 'loss' ? '−' : '='}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#cccccc]">
                            {game.opponent?.username ?? '알 수 없음'}{' '}
                            <span className="font-normal text-[#8c8c8c]">
                              {game.opponent ? game.opponent.rating : ''}
                            </span>
                          </span>
                          <span className="block text-xs text-[#8c8c8c]">
                            {parseTC(game.time_control).label} · {timeAgo(game.created_at)}
                          </span>
                        </span>
                        <IconChevronRight size={16} className="text-[#707070]" />
                      </Link>
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
        className="fixed bottom-24 right-4 z-40 flex items-center gap-1.5 rounded-full bg-[#3692e7] px-5 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-[#4a9fee]"
      >
        <IconPlay size={18} /> 플레이
      </Link>
    </div>
  );
}
