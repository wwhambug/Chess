'use client';

// ============================================================
// 친구: 닉네임 검색 → 친구 요청 / 받은 요청 수락·거절 / 친구 목록 + 대결 신청
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import type { Friendship, Profile } from '../../lib/db';
import { useAuth } from '../../components/AuthProvider';

export const dynamic = 'force-dynamic';

export default function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => setToast(msg);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const me = user.id;
    const { data } = await supabase.from('friendships').select('*').or(`requester_id.eq.${me},addressee_id.eq.${me}`);
    const rows = ((data ?? []) as Friendship[]);
    setIncoming(rows.filter((f) => f.status === 'pending' && f.addressee_id === me));
    setFriends(rows.filter((f) => f.status === 'accepted'));
    const ids = new Set<string>();
    for (const f of rows) {
      ids.add(f.requester_id === me ? f.addressee_id : f.requester_id);
    }
    if (ids.size > 0) {
      const { data: p } = await supabase.from('profiles').select('id, username, rating').in('id', [...ids]);
      if (p) {
        const map: Record<string, Profile> = {};
        for (const row of p as Profile[]) map[row.id] = row;
        setProfiles(map);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || !user || !configured) return;
    void loadAll();
  }, [authLoading, user?.id, configured, loadAll]);

  // friendships realtime 구독 → 변경 시 목록 새로고침
  useEffect(() => {
    if (authLoading || !user || !configured) return;
    const channel = supabase
      .channel('friends:all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void loadAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id, configured, loadAll]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const q = query.trim();
    if (!q) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, username, rating')
      .eq('username', q)
      .neq('id', user.id)
      .limit(5);
    setResults((data ?? []) as Profile[]);
    if (!data || data.length === 0) showToast('해당 닉네임의 유저를 찾을 수 없습니다.');
  };

  const sendRequest = async (friendId: string) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('friendships').insert({
        requester_id: user.id,
        addressee_id: friendId,
        status: 'pending',
      });
      if (error) {
        if (error.code === '23505') showToast('이미 친구 요청을 보냈거나 친구인 유저입니다.');
        else showToast(`요청 실패: ${error.message}`);
        return;
      }
      showToast('친구 요청을 보냈습니다.');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (f: Friendship, accept: boolean) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', f.id);
    if (error) showToast(`처리 실패: ${error.message}`);
    else showToast(accept ? '친구 요청을 수락했습니다.' : '친구 요청을 거절했습니다.');
  };

  const challengeFriend = async (friendId: string) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('challenges').insert({
        creator_id: user.id,
        invitee_id: friendId,
        time_control: 'blitz-5-0',
        color_choice: 'random',
        status: 'open',
      });
      if (error) showToast(`도전 실패: ${error.message}`);
      else showToast('도전 보냄 — 상대가 수락하면 대국이 시작됩니다.');
    } finally {
      setBusy(false);
    }
  };

  const otherId = (f: Friendship) => (user && f.requester_id === user.id ? f.addressee_id : f.requester_id);
  const nameOf = (id: string) => {
    const p = profiles[id];
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
  if (!user) return <p className="px-4 py-16 text-center text-sm text-neutral-500">로그인이 필요합니다.</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-200 shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-amber-100">친구</h1>

      {/* 닉네임 검색 */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-[#1b1a17] p-4">
        <h2 className="text-sm font-semibold text-neutral-300">친구 찾기</h2>
        <form onSubmit={search} className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임으로 검색"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
          >
            검색
          </button>
        </form>
        {results.length > 0 && (
          <ul className="mt-3 space-y-2">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2"
              >
                <span className="text-sm font-medium text-neutral-200">
                  {r.username} <span className="text-xs text-neutral-500">({r.rating})</span>
                </span>
                <button
                  onClick={() => sendRequest(r.id)}
                  disabled={busy}
                  className="ml-auto rounded-md border border-neutral-600 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                >
                  친구 요청
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 받은 요청 */}
      {incoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-300">받은 친구 요청 ({incoming.length})</h2>
          <ul className="mt-2 space-y-2">
            {incoming.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-neutral-200">{nameOf(f.requester_id)}</span>
                <span className="ml-auto flex gap-2">
                  <button
                    onClick={() => respond(f, true)}
                    className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => respond(f, false)}
                    className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
                  >
                    거절
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 친구 목록 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-300">친구 목록 ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="mt-2 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-6 text-center text-sm text-neutral-500">
            아직 친구가 없습니다. 닉네임으로 검색해 친구 요청을 보내 보세요.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {friends.map((f) => {
              const fid = otherId(f);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-neutral-200">{nameOf(fid)}</span>
                  <button
                    onClick={() => challengeFriend(fid)}
                    disabled={busy}
                    className="ml-auto rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    대결 신청
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
