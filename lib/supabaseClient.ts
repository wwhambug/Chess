// ============================================================
// Supabase 클라이언트 (브라우저용)
// - 빌드 시점에 환경변수가 없어도 throw하지 않도록 placeholder 사용
// - isSupabaseConfigured()가 false면 UI에서 "Supabase 미설정" 안내 표시
// ============================================================

import { createClient } from '@supabase/supabase-js';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;

/** 실제 Supabase 접속 정보가 설정되었는지 여부 */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    url !== PLACEHOLDER_URL &&
    anonKey !== PLACEHOLDER_KEY
  );
}

export const supabase = createClient(url, anonKey);
