'use client';

// ============================================================
// 컴퓨터와 대결: 레벨 선택(1~15 슬라이더) → Stockfish 대국
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ENGINE_LEVELS } from '../../lib/stockfish';
import { TIME_CONTROLS, CUSTOM_TC_ID, customTC } from '../../lib/timeControl';
import { ComputerGame, UNTIMED_ID } from '../../components/ComputerGame';

export const dynamic = 'force-dynamic';

const COLOR_CHOICES = [
  { id: 'white', label: '백' },
  { id: 'black', label: '흑' },
  { id: 'random', label: '랜덤' },
] as const;

type ColorId = (typeof COLOR_CHOICES)[number]['id'];

export default function ComputerPage() {
  const [level, setLevel] = useState(4);
  const [colorId, setColorId] = useState<ColorId>('random');
  const [tcId, setTcId] = useState(TIME_CONTROLS[3].id);
  const [customMin, setCustomMin] = useState(10);
  const [customInc, setCustomInc] = useState(5);
  const [started, setStarted] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const playerColor = useMemo<'w' | 'b'>(() => {
    if (colorId === 'white') return 'w';
    if (colorId === 'black') return 'b';
    return Math.random() < 0.5 ? 'w' : 'b';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameKey, colorId]);

  const custom = tcId === CUSTOM_TC_ID ? customTC(customMin, customInc) : null;
  const levelInfo = ENGINE_LEVELS[level - 1];

  if (started) {
    return (
      <ComputerGame
        key={gameKey}
        levelId={String(level)}
        playerColor={playerColor}
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
      <h1 className="mt-2 text-xl font-bold text-neutral-100">컴퓨터와 대결</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Stockfish 17.1 탑재 · 매 수는 실시간으로 평가됩니다
      </p>

      {/* 레벨 선택 (슬라이더 1~15) */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">레벨</h2>
          <span className="text-2xl font-black text-[#9ccbf5]">{level}</span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={1}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          className="mt-3 w-full accent-[#3692e7]"
          aria-label="스톡피시 레벨"
        />
        <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
          <span>1 (입문)</span>
          <span>15 (풀파워)</span>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-neutral-600">
          {levelInfo
            ? `레벨 ${level}: 생각 시간 약 ${(levelInfo.movetimeMs / 1000).toFixed(1)}초${level === 15 ? ' · Skill 제한 없는 풀파워 Stockfish입니다.' : ''}`
            : ''}
        </p>
      </section>

      {/* 색상 */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold text-neutral-300">내 색상</h2>
        <div className="mt-2 flex gap-2">
          {COLOR_CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={() => setColorId(c.id)}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm ${
                colorId === c.id
                  ? 'border-[#3692e7] bg-[#3692e7]/15 text-[#9ccbf5]'
                  : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* 시간제 */}
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
      <p className="mt-3 text-center text-[11px] text-neutral-600">
        엔진은 처음 한 번만 내려받으며, 이후에는 기기에서 바로 돕니다.
      </p>
    </div>
  );
}
