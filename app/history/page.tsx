'use client';

// ============================================================
// 기록: 내가 둔 대국 목록 (최신순) — 결과/시간제/상대/종료 사유 표시
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { parseTC } from '../../lib/timeControl';
import type { Game, Profile } from '../../lib/db';
import { resultReasonLabel } from '../../lib/db';
import { useAuth } from '../../components/AuthProvider';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const configured = isSupabaseConfigured();

  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const me = user.id;
    const { data } = await supabase
      .from('games')
      .select('*')
      .or(`white_id.eq.${me},black_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(100);
    const rows = ((data ?? []) as Game[]);
    setGames(rows);
    const ids = new Set<string>();
    for (const g of rows) ids.add(g.white_id === me ? g.black_id : g.white_id);
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
    void load();
  }, [authLoading, user?.id, configured, load]);

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

  const resultOf = (g: Game): { label: string; cls: string } => {
    const me = user.id;
    const iWhite = g.white_id === me;
    if (g.status === 'ongoing') return { label: '진행 중', cls: 'text-amber-300' };
    if (g.status === 'draw') return { label: '무', cls: 'text-neutral-300' };
    const iWon = (g.status === 'white_won') === iWhite;
    return iWon ? { label: '승', cls: 'text-green-400' } : { label: '패', cls: 'text-red-400' };
  };

  const dateLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-amber-100">대국 기록</h1>
      {games.length === 0 ? (
        <p className="mt-4 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-8 text-center text-sm text-neutral-500">
          아직 둔 대국이 없습니다. 로비에서 첫 대국을 시작해 보세요.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {games.map((g) => {
            const me = user.id;
            const oppId = g.white_id === me ? g.black_id : g.white_id;
            const opp = profiles[oppId];
            const r = resultOf(g);
            return (
              <li key={g.id}>
                <Link
                  href={`/play/${g.id}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-[#1b1a17] px-4 py-3 transition-colors hover:border-neutral-600"
                >
                  <span className={`w-6 text-center text-lg font-bold ${r.cls}`}>{r.label}</span>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                    {parseTC(g.time_control).label}
                  </span>
                  <span className="text-sm text-neutral-200">
                    vs {opp ? `${opp.username} (${opp.rating})` : '…'}
                  </span>
                  <span className="hidden text-xs text-neutral-500 sm:inline">
                    {g.status === 'ongoing' ? '진행 중' : resultReasonLabel(g.result_reason)}
                  </span>
                  <span className="ml-auto text-xs text-neutral-500">{dateLabel(g.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
