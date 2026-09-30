# ♞ 체스 — 실시간 웹 체스

Next.js 16 + React 19 + Supabase로 만든 Lichess 스타일 실시간 체스 웹앱입니다.
빠른 매칭, 공개 챌린지 로비, 친구 대결, 수별 엔진 평가(`!!`/`!`/`!?`/`?!`/`?`/`??`
주석 + 평가 막대), 시계/기권/무승부 제안/리매치, Elo 레이팅을 지원합니다.

## 준비물

- Node.js 18+
- Supabase 계정 (무료 플랜으로 충분)

## 1단계 — Supabase 프로젝트 생성

1. https://supabase.com → New project
2. 프로젝트 이름/비밀번호/리전(서울 권장) 입력 후 생성 (1~2분 소요)

## 2단계 — 스키마 SQL 실행

1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 이 저장소의 `supabase/schema.sql` 파일 전체를 복사해 붙여넣기
3. **Run** 클릭 — 테이블 5개(profiles, friendships, challenges, games, moves),
   RLS 정책, 신규 가입 시 프로필 자동 생성 트리거가 만들어집니다.

## 3단계 — Realtime 확인

`schema.sql`의 마지막 섹션이 4개 테이블(challenges, games, moves, friendships)을
`supabase_realtime` publication에 자동 등록합니다.

확인: 대시보드 → **Database** → **Replication** 에서 4개 테이블이 목록에 있는지 확인.
없으면 SQL Editor에서 직접 실행:

```sql
alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.moves;
alter publication supabase_realtime add table public.friendships;
```

## 4단계 — API 키 복사 → .env.local 작성

1. 대시보드 → **Project Settings** → **API**
2. **Project URL**과 **anon public key** 복사
3. 프로젝트 루트에 `.env.local` 파일 생성:

```bash
cp .env.example .env.local
# .env.local을 열어 실제 값으로 교체
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> 키가 없으면 화면에 "Supabase 미설정" 안내가 표시되고, 앱이 빌드/실행 자체는
> 깨지지 않습니다.

## 5단계 — 설치 & 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
```

타입 체크만 따로 하려면: `npx tsc --noEmit`

## 6단계 — Vercel 배포

1. 이 프로젝트를 GitHub에 push
2. https://vercel.com → **Add New Project** → 저장소 Import
3. **Environment Variables**에 아래 2개 등록:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**

## 알아두면 좋은 것

- **모바일 홈**: `/`는 리체스 모바일 스타일 홈(인사말·레이팅 카드·친구들·최근 대국·
  하단 탭 내비)입니다. 매칭·챌린지 로비는 `/lobby`로 이동했고, 하단 탭은
  홈 `/` · 퍼즐 `/puzzles` · 배우기 `/learn` · 중계 `/tv` · 더보기 `/more`입니다.
  퍼즐/배우기/중계는 아직 준비 중 화면이며, 더보기 탭에서 친구·기록·
  컴퓨터 대결·로그인/로그아웃에 접근할 수 있습니다.
- **컴퓨터와 대결**: `/computer`에서 Stockfish와 바로 대국할 수 있습니다(로그인
  불필요). 색상(백/흑/랜덤), 시간제(기존 6종 + 무제한), 레벨 1~8 + MAX를
  선택할 수 있습니다. MAX는 UI에 `9999`로 표시되며 레벨 8/MAX는
  Skill 20·깊이 20/23의 풀파워 설정입니다.
- **Stockfish 엔진**: 클라이언트에서 Stockfish 17.1 Lite WASM(`lib/stockfish.ts`)을
  Web Worker로 실행합니다. 엔진 JS는 unpkg CDN에서 로드되고, 워커 스크립트와
  같은 경로의 `.wasm` 파일이 자동으로 함께 로드됩니다(CORS 허용 확인).
  네트워크 실패 시 자동으로 재시도하며, 대국 중에는 절대 종료되지 않습니다.
- **수 평가**: 모든 수의 `!!`/`!`/`!?`/`?!`/`?`/`??` 주석은 Stockfish 평가
  (수 전·후 depth 14 분석, centipawn loss 기준)로 계산됩니다. 엔진 로드 실패 시에만
  내장 평가(`lib/engine.ts`)로 폴백합니다. 실시간 대국(`GameRoom`)과 컴퓨터
  대결 모두에 평가 막대와 함께 표시됩니다.
- **RLS**: 모든 테이블에 Row Level Security가 켜져 있습니다. 대국은 참가자(백/흑)만
  조회·수정할 수 있고, 공개 챌린지(`invitee_id IS NULL`, `status='open'`)만 로비에
  노출됩니다.
- **닉네임**: 회원가입 직후 프로필 닉네임은 `user_xxxxxxxx` 임시값입니다.
  로그인하면 닉네임 설정 화면이 먼저 뜨고, 중복 닉네임은 안내 메시지와 함께
  거부됩니다.
- **레이팅**: 대국 종료 시 K=32 Elo로 양쪽 클라이언트가 각자 자신의 프로필만
  1회씩 갱신합니다. (시간제별 개별 레이팅은 아직 분리되어 있지 않아 홈의
  불렛/블리츠/래피드 카드에는 공용 레이팅이 표시됩니다.)
