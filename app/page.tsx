'use client';

// ============================================================
// 로비: 빠른 매칭 / 챌린지 만들기 / 공개 챌린지 / 받은 도전
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { TIME_CONTROLS, DEFAULT_TC_ID, parseTC } from '../lib/timeControl';
import { acceptChallenge } from '../lib/gameLogic';
import type { Challenge, ColorChoice, Profile } from '../lib/db';
import { useAuth } from '../components/AuthProvider';

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
    const myRows = ((my ?? []) as Challenge[]);
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
        if (c.creator_id === me) {
          setMine((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges' }, (payload) => {
        const c = payload.new as Challenge;
        // 내가 매칭 대기 중인 챌린지가 수락되면 대국으로 이동
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
          stillOpen && c.creator_id === me
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
  // 빠른 매칭: 같은 시간제의 가장 오래된 공개 챌린지 수락,
  // 없으면 공개 챌린지를 만들고 상대가 수락할 때까지 대기
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
        showToast('매칭 생성에 실패했습니다.');
        return;
      }
      setMatchmakingId((created as Challenge).id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '빠른 매칭에 실패했습니다.');
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
      const { error } = await supabase.from('challenges').insert({
        creator_id: user.id,
        invitee_id: null,
        time_control: tcId,
        color_choice: colorChoice,
        status: 'open',
      });
      if (error) showToast('챌린지 생성에 실패했습니다.');
      else showToast('챌린지를 만들었습니다. 상대가 참가하면 대국이 시작됩니다.');
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

  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-amber-200">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">.env.local</code>에 Supabase URL과
          anon key를 설정한 뒤 다시 시도해 주세요. (README.md 참조)
        </p>
      </div>
    );
  }

  if (authLoading) return <p className="px-4 py-16 text-center text-sm text-neutral-500">불러오는 중…</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-amber-100">♞ 체스</h1>
        <p className="mt-3 text-sm text-neutral-400">로그인하고 실시간 대국을 시작해 보세요.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          로그인 / 회원가입
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-200 shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-amber-100">로비</h1>

      {/* 시간제 선택 */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-[#1b1a17] p-4">
        <h2 className="text-sm font-semibold text-neutral-300">시간제</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc.id}
              onClick={() => setTcId(tc.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                tcId === tc.id
                  ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                  : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
              }`}
            >
              {tc.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {matchmakingId ? (
            <>
              <span className="animate-pulse text-sm text-amber-200">상대 찾는 중…</span>
              <button
                onClick={cancelMatchmaking}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              >
                취소
              </button>
            </>
          ) : (
            <button
              onClick={quickMatch}
              disabled={busy}
              className="rounded-md bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              빠른 매칭
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">내 색상</label>
            <select
              value={colorChoice}
              onChange={(e) => setColorChoice(e.target.value as ColorChoice)}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
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
              className="rounded-md border border-neutral-600 px-4 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              챌린지 만들기
            </button>
          </div>
        </div>
      </section>

      {/* 받은 도전 */}
      {incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-300">받은 도전 ({incoming.length})</h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-neutral-200">{nameOf(c.creator_id)}</span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                  {tcLabel(c.time_control)}
                </span>
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() => respondInvite(c, true)}
                    disabled={busy}
                    className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => respondInvite(c, false)}
                    disabled={busy}
                    className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
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
        <h2 className="text-sm font-semibold text-neutral-300">공개 챌린지 ({openChallenges.length})</h2>
        {openChallenges.length === 0 ? (
          <p className="mt-2 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-6 text-center text-sm text-neutral-500">
            현재 열린 공개 챌린지가 없습니다. 빠른 매칭이나 챌린지 만들기로 대국을 시작해 보세요.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {openChallenges.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-neutral-200">{nameOf(c.creator_id)}</span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                  {tcLabel(c.time_control)}
                </span>
                <button
                  onClick={() => joinChallenge(c)}
                  disabled={busy}
                  className="ml-auto rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  참가
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 내가 만든 챌린지 */}
      {mine.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-300">내가 만든 챌린지 ({mine.length})</h2>
          <ul className="mt-2 space-y-2">
            {mine.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-2.5"
              >
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                  {tcLabel(c.time_control)}
                </span>
                <span className="text-xs text-neutral-500">
                  {c.invitee_id ? '1:1 도전' : '공개'} · 대기 중…
                </span>
                <button
                  onClick={() => cancelChallenge(c.id)}
                  className="ml-auto rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
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
