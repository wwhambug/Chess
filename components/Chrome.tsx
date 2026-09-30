'use client';

// ============================================================
// 크롬(전역 내비) 래퍼: 대국 화면에서는 하단 탭바를 숨기고
// 각 대국 화면의 GameBottomBar가 하단을 차지하게 한다.
// ============================================================

import { usePathname } from 'next/navigation';
import { TabBar } from './TabBar';

export function Chrome() {
  const pathname = usePathname();
  const hideTabBar =
    pathname === '/computer' || pathname === '/local' || pathname.startsWith('/play/');
  if (hideTabBar) return null;
  return <TabBar />;
}
