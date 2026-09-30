/**
 * lib/admin.ts — Admin 판별.
 *
 * 불법 무브 모드 같은 관리자 전용 기능의 노출 여부를 결정한다.
 * Vercel 환경변수 NEXT_PUBLIC_ADMIN_EMAILS에 로그인 이메일을
 * 쉼표로 구분해 등록하면 해당 계정이 Admin이 된다.
 * (예: NEXT_PUBLIC_ADMIN_EMAILS=me@gmail.com)
 */

import type { User } from '@supabase/supabase-js';

function adminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: User | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && adminEmails().includes(email);
}
