'use client';

// ============================================================
// 로그인 / 회원가입 + 임시 닉네임 설정
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { useAuth, isTempUsername } from '../../components/AuthProvider';
import { KnightLogo } from '../../components/KnightLogo';

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/user already registered/i.test(message)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/password/i.test(message) && /at least|length|short/i.test(message))
    return '비밀번호는 6자 이상이어야 합니다.';
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 진짜 닉네임을 가진 로그인 상태면 로비로
  useEffect(() => {
    if (!loading && user && profile && !isTempUsername(profile.username)) {
      router.replace('/');
    }
  }, [loading, user, profile, router]);

  const needsUsernameSetup =
    !loading && !!user && !!profile && isTempUsername(profile.username);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(friendlyAuthError(error.message));
        return;
      }
      // 이후 AuthProvider가 profile을 로드하고 위 useEffect가 리다이렉트 처리
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    if (name.length < 2 || name.length > 20) {
      setError('닉네임은 2~20자로 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setError(friendlyAuthError(error.message));
        return;
      }
      if (!data.session || !data.user) {
        setError('가입 메일이 발송되었습니다. 이메일 인증 후 로그인해 주세요.');
        return;
      }
      // 트리거가 만든 임시 프로필 행에 닉네임 설정
      const { error: uErr } = await supabase
        .from('profiles')
        .update({ username: name })
        .eq('id', data.user.id);
      if (uErr) {
        if (uErr.code === '23505') setError('이미 사용 중인 닉네임입니다.');
        else setError(`닉네임 설정 실패: ${uErr.message}`);
        return;
      }
      await refreshProfile();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const handleUsernameSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = newUsername.trim();
    if (name.length < 2 || name.length > 20) {
      setError('닉네임은 2~20자로 입력해 주세요.');
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ username: name }).eq('id', user.id);
      if (error) {
        if (error.code === '23505') setError('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.');
        else setError(`닉네임 설정 실패: ${error.message}`);
        return;
      }
      await refreshProfile();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[#9ccbf5]">Supabase 미설정</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">.env.local</code>에 Supabase URL과
          anon key를 설정한 뒤 다시 시도해 주세요. (README.md 참조)
        </p>
      </div>
    );
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-neutral-500">불러오는 중…</p>;
  }

  // 임시 닉네임 보유자 → 닉네임 설정 폼
  if (needsUsernameSetup) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-center text-xl font-bold text-neutral-100">닉네임 설정</h1>
        <p className="mt-2 text-center text-sm text-neutral-400">
          대국에서 사용할 닉네임을 정해 주세요. (2~20자)
        </p>
        <form onSubmit={handleUsernameSetup} className="mt-6 space-y-3">
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="닉네임"
            maxLength={20}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#3692e7] py-2 text-sm font-semibold text-white hover:bg-[#4a9fee] disabled:opacity-50"
          >
            {busy ? '저장 중…' : '닉네임 저장하고 시작하기'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center justify-center gap-2 text-center text-2xl font-bold text-neutral-100">
        <KnightLogo size={30} />
        체스
      </h1>
      <p className="mt-2 text-center text-sm text-neutral-400">실시간 대국을 시작해 보세요.</p>

      <div className="mt-6 flex rounded-md border border-neutral-800 bg-[#1b1a17] p-1">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
              mode === m ? 'bg-neutral-800 text-[#9ccbf5]' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {m === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#3692e7] py-2 text-sm font-semibold text-white hover:bg-[#4a9fee] disabled:opacity-50"
          >
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (6자 이상)"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="닉네임 (2~20자)"
            maxLength={20}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[#3692e7] focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#3692e7] py-2 text-sm font-semibold text-white hover:bg-[#4a9fee] disabled:opacity-50"
          >
            {busy ? '가입 중…' : '회원가입'}
          </button>
        </form>
      )}
    </div>
  );
}
