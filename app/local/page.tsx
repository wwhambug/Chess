'use client';

// ============================================================
// 로컬 대국: 한 기기에서 2인 플레이 (시간제 선택 → 시작)
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { TIME_CONTROLS, CUSTOM_TC_ID, customTC } from '../../lib/timeControl';
import { LocalGame, UNTIMED_ID } from '../../components/LocalGame';

export const dynamic = 'force-dynamic';

export default function LocalPage() {
  const [tcId, setTcId] = useState(TIME_CONTROLS[4].id);
  const [customMin, setCustomMin] = useState(10);
  const [customInc, setCustomInc] = useState(5);
  const [started, setStarted] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const custom = tcId === CUSTOM_TC_ID ? customTC(customMin, customInc) : null;

  if (started) {
    return (
      <LocalGame
        key={gameKey}
        tcId={tcId}
        customTc={custom ?? undefined}
        onQuit={() => setStarted(false)}
        onRematch={() => setGameKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <Link href="/lobby" className="text-sm text-[#3692e7] hover:text-[#4a9fee]">
        ← 로비로
      </Link>
      <h1 className="mt-2 text-xl font-bold text-neutral-100">로컬 대국</h1>
      <p className="mt-1 text-xs text-neutral-500">
        한 기기에서 둘이서 두는 2인용 · 로그인 불필요
      </p>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-neutral-300">시간제</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_CONTROLS.map((tc) => (
            <button
              key={tc.id}
              onClick={() => setTcId(tc.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                tcId === tc.id
                  ? 'border-[#3692e7] bg-[#3692e7]/15 text-[#9ccbf5]'
                  : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {tc.label}
            </button>
          ))}
          <button
            onClick={() => setTcId(CUSTOM_TC_ID)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tcId === CUSTOM_TC_ID
                ? 'border-[#3692e7] bg-[#3692e7]/15 text-[#9ccbf5]'
                : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
            }`}
          >
            커스텀
          </button>
          <button
            onClick={() => setTcId(UNTIMED_ID)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tcId === UNTIMED_ID
                ? 'border-[#3692e7] bg-[#3692e7]/15 text-[#9ccbf5]'
                : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
            }`}
          >
            시간 제한 없음
          </button>
        </div>
        {tcId === CUSTOM_TC_ID && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-neutral-800 bg-[#1b1a17] p-3">
            <label className="flex flex-1 items-center gap-2 text-sm text-neutral-300">
              기본
              <input
                type="number"
                min={1}
                max={180}
                value={customMin}
                onChange={(e) => setCustomMin(Number(e.target.value))}
                className="w-20 rounded-md border border-neutral-700 bg-[#161512] px-2 py-1.5 text-center text-neutral-100"
              />
              분
            </label>
            <label className="flex flex-1 items-center gap-2 text-sm text-neutral-300">
              초읽기
              <input
                type="number"
                min={0}
                max={180}
                value={customInc}
                onChange={(e) => setCustomInc(Number(e.target.value))}
                className="w-20 rounded-md border border-neutral-700 bg-[#161512] px-2 py-1.5 text-center text-neutral-100"
              />
              초
            </label>
          </div>
        )}
      </section>

      <button
        onClick={() => {
          setGameKey((k) => k + 1);
          setStarted(true);
        }}
        className="mt-6 w-full rounded-lg bg-[#3692e7] py-3 text-sm font-bold text-white hover:bg-[#4a9fee]"
      >
        대국 시작
      </button>
    </div>
  );
}
