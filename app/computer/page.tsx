'use client';

// ============================================================
// 컴퓨터와 대결: 레벨 선택 → Stockfish 대국
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ENGINE_LEVELS } from '../../lib/stockfish';
import { TIME_CONTROLS } from '../../lib/timeControl';
import { ComputerGame, UNTIMED_ID } from '../../components/ComputerGame';

export const dynamic = 'force-dynamic';

const COLOR_CHOICES = [
  { id: 'white', label: '백' },
  { id: 'black', label: '흑' },
  { id: 'random', label: '랜덤' },
] as const;

type ColorId = (typeof COLOR_CHOICES)[number]['id'];

export default function ComputerPage() {
  const [levelId, setLevelId] = useState('4');
  const [colorId, setColorId] = useState<ColorId>('random');
  const [tcId, setTcId] = useState(TIME_CONTROLS[3].id);
  const [started, setStarted] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const playerColor = useMemo<'w' | 'b'>(() => {
    if (colorId === 'white') return 'w';
    if (colorId === 'black') return 'b';
    return Math.random() < 0.5 ? 'w' : 'b';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameKey, colorId]);

  if (started) {
    return (
      <ComputerGame
        key={gameKey}
        levelId={levelId}
        playerColor={playerColor}
        tcId={tcId}
        onQuit={() => setStarted(false)}
        onRematch={() => setGameKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <Link href="/lobby" className="text-sm text-amber-400 hover:text-amber-300">
        ← 로비로
      </Link>
      <h1 className="mt-2 text-xl font-bold text-neutral-100">컴퓨터와 대결</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Stockfish 17.1 탑재 · 매 수는 실시간으로 평가됩니다
      </p>

      {/* 레벨 선택 */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold text-neutral-300">레벨</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ENGINE_LEVELS.map((lv) => {
            const isMax = lv.id === 'max';
            const active = levelId === lv.id;
            return (
              <button
                key={lv.id}
                onClick={() => setLevelId(lv.id)}
                className={`rounded-lg border px-2 py-3 text-center transition-colors ${
                  active
                    ? isMax
                      ? 'border-red-500 bg-red-600/20'
                      : 'border-amber-500 bg-amber-600/20'
                    : 'border-neutral-800 bg-[#1b1a17] hover:border-neutral-600'
                }`}
              >
                <div
                  className={`text-lg font-black ${
                    isMax ? 'text-red-400' : active ? 'text-amber-200' : 'text-neutral-200'
                  }`}
                >
                  {isMax ? '9999' : lv.display}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{lv.label}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-neutral-600">
          레벨 8과 MAX(9999)는 힘 제한이 없는 풀파워 Stockfish입니다.
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
                  ? 'border-amber-500 bg-amber-600/20 text-amber-200'
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
                  ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                  : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
              }`}
            >
              {tc.label}
            </button>
          ))}
          <button
            onClick={() => setTcId(UNTIMED_ID)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tcId === UNTIMED_ID
                ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                : 'border-neutral-800 bg-[#1b1a17] text-neutral-400 hover:border-neutral-600'
            }`}
          >
            시간 제한 없음
          </button>
        </div>
      </section>

      <button
        onClick={() => {
          setGameKey((k) => k + 1);
          setStarted(true);
        }}
        className="mt-6 w-full rounded-lg bg-amber-600 py-3 text-sm font-bold text-white hover:bg-amber-500"
      >
        대국 시작
      </button>
      <p className="mt-3 text-center text-[11px] text-neutral-600">
        엔진은 처음 한 번만 내려받으며, 이후에는 기기에서 바로 돕니다.
      </p>
    </div>
  );
}
