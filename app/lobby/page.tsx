'use client';

// ============================================================
// 로비
// - 컴퓨터와 대결: DB를 쓰지 않는 1인용 모드 (챌린지 아님)
// - 상대 찾기(빠른 매칭): 공개 시크(seek). 상대를 기다리는 동안만 유지되며,
//   페이지를 벗어나면 자동 취소됨. 챌린지 목록에 섞이지 않음
// - 챌린지: 특정 상대에게 보내는 1:1 초대, 또는 공개 챌린지 만들기
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { TIME_CONTROLS, DEFAULT_TC_ID, parseTC } from '../../lib/timeControl';
import { acceptChallenge } from '../../lib/gameLogic';
import type { Challenge, ColorChoice, Profile } from '../../lib/db';
import { useAuth } from '../../components/AuthProvider';
import { KnightLogo } from '../../components/KnightLogo';
import { IconBot, IconChevronRight, IconSwords, IconX } from '../../components/icons';

export const dynamic = 'force-dynamic';

const COLOR_CHOICES: { id: ColorChoice; label: string }[] = [
  { id: 'random', label: '랜덤' },
  { id: 'white', label: '백' },
  { id: 'black', label: '흑' },
];

export default function LobbyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [tcId, setTcId] = useState(DEFAULT_TC_ID);
  const [colorChoice, setColorChoice] = useState<ColorChoice>('random');
  const [openChallenges, setOpenChallenges] = useState<Challenge[]>([]);
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [mine, setMine] = useState<Challenge[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<Record<string, Profile>>({});
  const [matchmakingId, setMatchmakingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const matchmakingRef = useRef<string | null>(null);
  matchmakingRef.current = matchmakingId;

  const showToast = (msg: string) => setToast(msg);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 페이지를 벗어나면 진행 중인 상대 찾기를 자동 취소
  // (이미 수락된 건 status='open' 조건 때문에 건드리지 않음)
  useEffect(() => {
    return () => {
      const id = matchmakingRef.current;
      if (id) {
        void supabase
          .from('challenges')
          .update({ status: 'cancelled' })
          .eq('id', id)
          .eq('status', 'open');
      }
    };
  }, []);

  const loadProfiles = useCallback(async (ids: string[]) => {
    const uniq = [...new Set(ids)].filter(Boolean);
    if (uniq.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, username, rating').in('id', uniq);
    if (data) {
      setCreatorProfiles((prev) => {
        const next = { ...prev };
        for (const row of data as Profile[]) next[row.id] = row as Profile;
        return next;
      });
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const me = user.id;
    const [{ data: open }, { data: inc }, { data: my }] = await Promise.all([
      supabase
        .from('challenges')
        .select('*')
        .eq('status', 'open')
        .is('invitee_id', null)
        .neq('creator_id', me)
        .order('created_at', { ascending: true }),
      supabase
        .from('challenges')
        .select('*')
        .eq('status', 'open')
        .eq('invitee_id', me)
        .order('created_at', { ascending: false }),
      supabase
        .from('challenges')
        .select('*')
        .eq('status', 'open')
        .eq('creator_id', me)
        .order('created_at', { ascending: false }),
    ]);
    const openRows = ((open ?? []) as Challenge[]);
    const incRows = ((inc ?? []) as Challenge[]);
    // 상대 찾기(seek)는 "내가 보낸 도전"에 섞지 않음
    const myRows = ((my ?? []) as Challenge[]).filter((c) => c.id !== matchmakingRef.current);
    setOpenChallenges(openRows);
    setIncoming(incRows);
    setMine(myRows);
    void loadProfiles([...openRows.map((c) => c.creator_id), ...incRows.map((c) => c.creator_id)]);
  }, [user?.id, loadProfiles]);

  useEffect(() => {
    if (authLoading || !user || !configured) return;
    void loadAll();
  }, [authLoading, user?.id, configured, loadAll]);

  // challenges 테이블 realtime 구독 (INSERT/UPDATE/DELETE)
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    const me = user.id;
    const channel = supabase
      .channel('lobby:challenges')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'challenges' }, (payload) => {
        const c = payload.new as Challenge;
        if (c.status !== 'open') return;
        if (c.invitee_id == null && c.creator_id !== me) {
          setOpenChallenges((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
          void loadProfiles([c.creator_id]);
        }
        if (c.invitee_id === me) {
          setIncoming((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
          void loadProfiles([c.creator_id]);
        }
        if (c.creator_id === me && c.id !== matchmakingRef.current) {
          setMine((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges' }, (payload) => {
        const c = payload.new as Challenge;
        // 내가 찾고 있던 상대가 잡히면 대국으로 이동
        if (matchmakingRef.current && c.id === matchmakingRef.current) {
          if (c.status === 'accepted' && c.game_id) {
            router.push(`/play/${c.game_id}`);
            return;
          }
          if (c.status !== 'open') {
            setMatchmakingId(null);
            setMine((prev) => prev.filter((x) => x.id !== c.id));
            return;
          }
        }
        const stillOpen = c.status === 'open';
        setOpenChallenges((prev) =>
          stillOpen && c.invitee_id == null && c.creator_id !== me
            ? prev.some((x) => x.id === c.id)
              ? prev.map((x) => (x.id === c.id ? c : x))
              : [...prev, c]
            : prev.filter((x) => x.id !== c.id),
        );
        setIncoming((prev) =>
          stillOpen && c.invitee_id === me
            ? prev.some((x) => x.id === c.id)
              ? prev.map((x) => (x.id === c.id ? c : x))
              : [c, ...prev]
            : prev.filter((x) => x.id !== c.id),
        );
        setMine((prev) =>
          stillOpen && c.creator_id === me && c.id !== matchmakingRef.current
            ? prev.some((x) => x.id === c.id)
              ? prev.map((x) => (x.id === c.id ? c : x))
              : [c, ...prev]
            : prev.filter((x) => x.id !== c.id),
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'challenges' }, (payload) => {
        const old = payload.old as { id: string };
        setOpenChallenges((prev) => prev.filter((x) => x.id !== old.id));
        setIncoming((prev) => prev.filter((x) => x.id !== old.id));
        setMine((prev) => prev.filter((x) => x.id !== old.id));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id, configured, loadProfiles, router]);

  // ------------------------------------------------------------
  // 상대 찾기: 같은 시간제의 가장 오래된 공개 챌린지 수락,
  // 없으면 공개 시크를 만들고 상대가 잡힐 때까지 대기
  // ------------------------------------------------------------
  const quickMatch = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { data } = await supabase
        .from('challenges')
        .select('*')
        .eq('status', 'open')
        .eq('time_control', tcId)
        .is('invitee_id', null)
        .neq('creator_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      const found = (data ?? []) as Challenge[];
      if (found.length > 0) {
        const newId = await acceptChallenge(supabase, found[0], user.id);
        router.push(`/play/${newId}`);
        return;
      }
      const { data: created, error } = await supabase
        .from('challenges')
        .insert({
          creator_id: user.id,
          invitee_id: null,
          time_control: tcId,
          color_choice: 'random',
          status: 'open',
        })
        .select('*')
        .single();
      if (error || !created) {
        showToast('상대 찾기를 시작하지 못했습니다.');
        return;
      }
      setMine((prev) => prev.filter((x) => x.id !== (created as Challenge).id));
      setMatchmakingId((created as Challenge).id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '상대 찾기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const cancelMatchmaking = async () => {
    if (!matchmakingId) return;
    await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', matchmakingId);
    setMatchmakingId(null);
    setMine((prev) => prev.filter((x) => x.id !== matchmakingId));
  };

  // ------------------------------------------------------------
  // 챌린지 만들기 (공개)
  // ------------------------------------------------------------
  const createChallenge = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('challenges')
        .insert({
          creator_id: user.id,
          invitee_id: null,
          time_control: tcId,
          color_choice: colorChoice,
          status: 'open',
        })
        .select('*')
        .single();
      if (error || !data) showToast('챌린지 생성에 실패했습니다.');
      else {
        setMine((prev) => [data as Challenge, ...prev]);
        showToast('챌린지를 만들었습니다. 상대가 참가하면 대국이 시작됩니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  const joinChallenge = async (c: Challenge) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const newId = await acceptChallenge(supabase, c, user.id);
      router.push(`/play/${newId}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '참가에 실패했습니다.');
      void loadAll();
    } finally {
      setBusy(false);
    }
  };

  const cancelChallenge = async (id: string) => {
    await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', id);
    if (matchmakingId === id) setMatchmakingId(null);
    setMine((prev) => prev.filter((x) => x.id !== id));
  };

  const respondInvite = async (c: Challenge, accept: boolean) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (accept) {
        const newId = await acceptChallenge(supabase, c, user.id);
        router.push(`/play/${newId}`);
      } else {
        await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', c.id);
        setIncoming((prev) => prev.filter((x) => x.id !== c.id));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '처리에 실패했습니다.');
      void loadAll();
    } finally {
      setBusy(false);
    }
  };

  const tcLabel = (id: string) => parseTC(id).label;
  const nameOf = (id: string) => {
    const p = creatorProfiles[id];
    return p ? `${p.username} (${p.rating})` : '…';
  };
  // 진행 중인 상대 찾기(seek)는 "내가 보낸 도전"에 절대 섞지 않음 (렌더 단계 최종 필터)
  const displayMine = mine.filter((c) => c.id !== matchmakingId);

  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-neutral-200">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-[#8c8c8c]">
          <code className="rounded bg-[#262421] px-1.5 py-0.5 text-xs">.env.local</code>에 Supabase URL과
          anon key를 설정한 뒤 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  if (authLoading) return <p className="px-4 py-16 text-center text-sm text-[#8c8c8c]">불러오는 중…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <KnightLogo size={56} />
        <p className="mt-3 text-sm text-[#8c8c8c]">로그인하고 실시간 대국을 시작해 보세요.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-[#3692e7] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4a9fee]"
        >
          로그인 / 회원가입
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md bg-[#262421] px-4 py-2 text-sm text-[#cccccc] shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-lg font-bold text-[#cccccc]">플레이</h1>

      {/* 컴퓨터와 대결 — DB를 쓰지 않는 1인용 */}
      <Link
        href="/computer"
        className="mt-3 flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] p-4 transition-colors hover:border-[#3692e7]/60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
          <IconBot size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#cccccc]">컴퓨터와 대결</span>
          <span className="block text-xs text-[#8c8c8c]">
            Stockfish 17.1 · 레벨 1~15 · 기록에 저장되지 않는 1인용
          </span>
        </span>
        <IconChevronRight size={18} className="shrink-0 text-[#707070]" />
      </Link>

      {/* 로컬 대국 — 한 기기 2인용 */}
      <Link
        href="/local"
        className="mt-3 flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] p-4 transition-colors hover:border-[#3692e7]/60"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
          <IconSwords size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#cccccc]">로컬 대국</span>
          <span className="block text-xs text-[#8c8c8c]">
            한 기기에서 둘이서 · 로그인 불필요
          </span>
        </span>
        <IconChevronRight size={18} className="shrink-0 text-[#707070]" />
      </Link>

      {/* 상대 찾기 */}
      <section className="mt-4 rounded-lg border border-[#2e2b26] bg-[#262421] p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3692e7]/15 text-[#3692e7]">
            <IconSwords size={18} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#cccccc]">상대 찾기</h2>
            <p className="text-xs text-[#8c8c8c]">온라인 상대를 자동으로 찾아 대국을 시작합니다</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc.id}
              onClick={() => setTcId(tc.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                tcId === tc.id
                  ? 'border-[#3692e7] bg-[#3692e7]/15 text-[#9ccbf5]'
                  : 'border-[#2e2b26] text-[#8c8c8c] hover:border-[#4a4a44] hover:text-[#bababa]'
              }`}
            >
              {tc.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {matchmakingId ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-[#3692e7]/40 bg-[#3692e7]/10 px-4 py-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3692e7] opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#3692e7]" />
              </span>
              <span className="flex-1 text-sm text-[#9ccbf5]">
                상대를 찾고 있습니다…
                <span className="block text-xs font-normal text-[#8c8c8c]">
                  이 화면을 벗어나면 찾기가 자동 취소됩니다
                </span>
              </span>
              <button
                onClick={cancelMatchmaking}
                className="flex items-center gap-1 rounded-md border border-[#2e2b26] px-3 py-1.5 text-sm text-[#bababa] hover:bg-[#1b1a17]"
              >
                <IconX size={14} /> 취소
              </button>
            </div>
          ) : (
            <button
              onClick={quickMatch}
              disabled={busy}
              className="w-full rounded-md bg-[#3692e7] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#4a9fee] disabled:opacity-50"
            >
              상대 찾기 시작
            </button>
          )}
        </div>
      </section>

      {/* 챌린지 만들기 */}
      <section className="mt-4 rounded-lg border border-[#2e2b26] bg-[#262421] p-4">
        <h2 className="text-sm font-bold text-[#cccccc]">챌린지 만들기</h2>
        <p className="mt-0.5 text-xs text-[#8c8c8c]">
          공개 챌린지를 만들어 두면 다른 사람이 참가할 수 있습니다
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-[#8c8c8c]">내 색상</label>
          <select
            value={colorChoice}
            onChange={(e) => setColorChoice(e.target.value as ColorChoice)}
            className="rounded-md border border-[#2e2b26] bg-[#1b1a17] px-2 py-1.5 text-sm text-[#cccccc]"
          >
            {COLOR_CHOICES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={createChallenge}
            disabled={busy}
            className="rounded-md border border-[#2e2b26] px-4 py-1.5 text-sm text-[#bababa] hover:bg-[#1b1a17] disabled:opacity-50"
          >
            챌린지 만들기
          </button>
        </div>
      </section>

      {/* 받은 도전 */}
      {incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-[#cccccc]">받은 도전 ({incoming.length})</h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-[#3692e7]/40 bg-[#262421] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-[#cccccc]">{nameOf(c.creator_id)}</span>
                <span className="rounded bg-[#1b1a17] px-1.5 py-0.5 text-xs text-[#8c8c8c]">
                  {tcLabel(c.time_control)}
                </span>
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() => respondInvite(c, true)}
                    disabled={busy}
                    className="rounded-md bg-[#3692e7] px-3 py-1 text-sm font-semibold text-white hover:bg-[#4a9fee] disabled:opacity-50"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => respondInvite(c, false)}
                    disabled={busy}
                    className="rounded-md border border-[#2e2b26] px-3 py-1 text-sm text-[#8c8c8c] hover:bg-[#1b1a17] disabled:opacity-50"
                  >
                    거절
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 공개 챌린지 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold text-[#cccccc]">공개 챌린지 ({openChallenges.length})</h2>
        {openChallenges.length === 0 ? (
          <p className="mt-2 rounded-lg border border-[#2e2b26] bg-[#262421] px-4 py-6 text-center text-sm text-[#8c8c8c]">
            현재 열린 공개 챌린지가 없습니다.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {openChallenges.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-[#cccccc]">{nameOf(c.creator_id)}</span>
                <span className="rounded bg-[#1b1a17] px-1.5 py-0.5 text-xs text-[#8c8c8c]">
                  {tcLabel(c.time_control)}
                </span>
                <button
                  onClick={() => joinChallenge(c)}
                  disabled={busy}
                  className="ml-auto rounded-md bg-[#3692e7] px-3 py-1 text-sm font-semibold text-white hover:bg-[#4a9fee] disabled:opacity-50"
                >
                  참가
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 내가 보낸 도전 */}
      {displayMine.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-[#cccccc]">내가 보낸 도전 ({displayMine.length})</h2>
          <ul className="mt-2 space-y-2">
            {displayMine.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-[#2e2b26] bg-[#262421] px-4 py-2.5"
              >
                <span className="rounded bg-[#1b1a17] px-1.5 py-0.5 text-xs text-[#8c8c8c]">
                  {tcLabel(c.time_control)}
                </span>
                <span className="text-xs text-[#8c8c8c]">
                  {c.invitee_id ? '1:1 도전' : '공개'} · 대기 중…
                </span>
                <button
                  onClick={() => cancelChallenge(c.id)}
                  className="ml-auto rounded-md border border-[#2e2b26] px-3 py-1 text-sm text-[#8c8c8c] hover:bg-[#1b1a17]"
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
