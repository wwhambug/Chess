'use client';

// ============================================================
// 대국 중 하단바: 기권 / 무르기 / ...(메뉴)
// ... 메뉴(바텀시트): 불법 무브 모드(Admin 전용) 토글, 보드 뒤집기, 그만두기
// ============================================================

import { useState } from 'react';

interface GameBottomBarProps {
  onResign: () => void;
  onUndo: (() => void) | null;
  canUndo: boolean;
  illegalMode: boolean;
  canUseIllegal: boolean;
  onToggleIllegal: () => void;
  onFlipBoard?: () => void;
  onQuit: () => void;
  gameOver: boolean;
  onRematch?: () => void;
}

export function GameBottomBar({
  onResign,
  onUndo,
  canUndo,
  illegalMode,
  canUseIllegal,
  onToggleIllegal,
  onFlipBoard,
  onQuit,
  gameOver,
  onRematch,
}: GameBottomBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#2e2b26] bg-[#161512]/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
          {gameOver ? (
            <button
              onClick={onRematch}
              className="flex-1 rounded-lg bg-[#3692e7] py-2.5 text-sm font-bold text-white hover:bg-[#4a9fee]"
            >
              다시 두기
            </button>
          ) : (
            <button
              onClick={onResign}
              className="flex-1 rounded-lg border border-red-900/60 bg-red-950/40 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-900/40"
            >
              기권
            </button>
          )}
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo || gameOver}
              className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              무르기
            </button>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-lg border border-neutral-700 px-4 py-2.5 text-lg font-bold leading-none text-neutral-300 hover:bg-neutral-800"
            aria-label="더보기 메뉴"
          >
            …
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border-t border-[#2e2b26] bg-[#262421] p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700" />
            {canUseIllegal && (
              <button
                onClick={() => {
                  onToggleIllegal();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-neutral-800"
              >
                <span>
                  <span className="block text-sm font-semibold text-neutral-100">
                    불법 무브 모드 {illegalMode ? '끄기' : '켜기'}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    Admin 전용 · 상대 기물 이동, 아군 잡기, 킹으로 프로모션 가능
                  </span>
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    illegalMode ? 'bg-[#3692e7]' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      illegalMode ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>
            )}
            {onFlipBoard && (
              <button
                onClick={() => {
                  onFlipBoard();
                  setMenuOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-3 text-left text-sm font-semibold text-neutral-100 hover:bg-neutral-800"
              >
                보드 뒤집기
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false);
                onQuit();
              }}
              className="block w-full rounded-lg px-3 py-3 text-left text-sm font-semibold text-red-300 hover:bg-neutral-800"
            >
              그만두기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
