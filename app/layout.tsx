import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { TopBar } from '@/components/TopBar';
import { Chrome } from '@/components/Chrome';

export const metadata: Metadata = {
  title: '체스 — 실시간 대국',
  description: '친구와 실시간으로 두는 웹 체스. 빠른 매칭, 공개 챌린지, 수별 평가 지원.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-[#161512] text-neutral-200 antialiased">
        <AuthProvider>
          <TopBar />
          <main className="pb-28">{children}</main>
          <Chrome />
        </AuthProvider>
      </body>
    </html>
  );
}
