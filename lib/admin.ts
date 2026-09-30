/**
 * lib/admin.ts — Admin 판별.
 *
 * 불법 무브 모드 같은 관리자 전용 기능의 노출 여부를 결정한다.
 * 다음 중 하나라도 맞으면 Admin이다:
 *  1) 프로필 username이 'Admin' (형님 계정)
 *  2) Vercel 환경변수 NEXT_PUBLIC_ADMIN_EMAILS에 등록된 이메일
 *     (쉼표 구분, 예: NEXT_PUBLIC_ADMIN_EMAILS=me@gmail.com)
 */

import type { User } from '@supabase/supabase-js';
import type { Profile } from './db';

function adminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(
  user: User | null | undefined,
  profile?: Profile | null,
): boolean {
  if (profile?.username?.toLowerCase() === 'admin') return true;
  const email = user?.email?.toLowerCase();
  return !!email && adminEmails().includes(email);
}
