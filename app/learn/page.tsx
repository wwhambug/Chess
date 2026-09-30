'use client';

// 배우기 탭 — 준비 중
import { IconLearn } from '../../components/icons';

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#3692e7]/15 text-[#3692e7]">
        <IconLearn size={32} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-neutral-100">배우기</h1>
      <p className="mt-2 text-sm text-neutral-500">체스 강좌를 준비하고 있습니다.</p>
    </div>
  );
}
