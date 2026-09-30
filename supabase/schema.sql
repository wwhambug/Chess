-- ============================================================
-- chess-site Supabase 스키마
--
-- 실행 방법:
--   1. Supabase 대시보드 > SQL Editor > New query
--   2. 이 파일 전체를 붙여넣고 Run
--   3. Database > Replication 에서 challenges / games / moves /
--      friendships 4개 테이블이 realtime publication에 들어갔는지 확인
--      (아래 "Realtime" 섹션이 자동으로 추가함)
--
-- 섹션 구성:
--   A. 확장(extension)
--   B. 테이블 정의 (profiles / friendships / challenges / games / moves)
--   C. 신규 가입 시 프로필 자동 생성 트리거
--   D. Row Level Security (RLS) 활성화 + 정책
--   E. Realtime publication 등록
-- ============================================================

-- ------------------------------------------------------------
-- A. 확장: gen_random_uuid() 사용을 위한 pgcrypto
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- B. 테이블 정의
-- ------------------------------------------------------------

-- B-1. profiles: auth.users와 1:1 매칭되는 공개 프로필
--   - id는 auth.users(id)를 그대로 사용 (회원가입 트리거가 자동 생성)
--   - username은 고유 닉네임 (가입 직후에는 'user_xxxxxxxx' 임시값)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  rating int default 800 not null,
  wins int default 0 not null,
  losses int default 0 not null,
  draws int default 0 not null,
  created_at timestamptz default now() not null
);

-- B-2. friendships: 친구 요청/관계
--   - requester_id: 요청 보낸 사람, addressee_id: 요청 받은 사람
--   - status: pending(대기) / accepted(수락) / declined(거절)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'pending' not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now() not null,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- B-3. challenges: 대결 신청 (로비/빠른 매칭/친구 대결/리매치 공용)
--   - invitee_id가 NULL이면 공개 챌린지(로비에 노출)
--   - invitee_id가 있으면 특정 상대에게만 보이는 1:1 도전
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  time_control text not null,
  color_choice text default 'random' not null check (color_choice in ('white', 'black', 'random')),
  status text default 'open' not null check (status in ('open', 'accepted', 'cancelled')),
  game_id uuid,
  created_at timestamptz default now() not null
);

-- B-4. games: 대국
--   - fen/turn은 현재局面(포지션)과 수순을 캐시 (매 수 업데이트)
--   - draw_offer_by: 무승부 제안 중인 유저 id (없으면 NULL)
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  white_id uuid not null references public.profiles(id),
  black_id uuid not null references public.profiles(id),
  time_control text not null,
  status text default 'ongoing' not null check (status in ('ongoing', 'white_won', 'black_won', 'draw')),
  result_reason text check (result_reason in ('checkmate', 'resign', 'timeout', 'agreement', 'stalemate')),
  fen text default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' not null,
  turn text default 'w' not null,
  draw_offer_by uuid references public.profiles(id),
  rated boolean default true not null,
  created_at timestamptz default now() not null,
  finished_at timestamptz
);

-- B-5. moves: 기보 (수순별 기록)
--   - ply는 1부터 시작 (백의 1수 = ply 1, 흑의 1수 = ply 2)
--   - annotation: '!!' / '!' / '!?' / '?!' / '?' / '??'
--   - eval_cp: 백 관점 센티폰 평가값
--   - white_clock_ms / black_clock_ms: 해당 수를 둔 직후의 남은 시간
create table if not exists public.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  ply int not null,
  color text check (color in ('w', 'b')),
  san text,
  uci text,
  fen_after text,
  annotation text,
  eval_cp int,
  white_clock_ms int not null,
  black_clock_ms int not null,
  moved_at timestamptz default now() not null,
  unique (game_id, ply)
);

-- 조회 성능용 인덱스
create index if not exists idx_moves_game_ply on public.moves (game_id, ply);
create index if not exists idx_games_players on public.games (white_id, black_id);
create index if not exists idx_challenges_open on public.challenges (status, time_control) where invitee_id is null;

-- ------------------------------------------------------------
-- C. 신규 가입 시 프로필 자동 생성 트리거
--   - auth.users에 행이 insert되면 profiles 행을 자동 생성
--   - username은 'user_' + uuid 앞 8자리 임시값 (로그인 후 변경 유도)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- D. Row Level Security (RLS)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.challenges enable row level security;
alter table public.games enable row level security;
alter table public.moves enable row level security;

-- authenticated 롤에 기본 권한 부여 (세부 접근 제어는 아래 정책이 담당)
grant select, insert, update, delete
  on public.profiles, public.friendships, public.challenges, public.games, public.moves
  to authenticated;

-- ---- D-1. profiles ----
--   - 조회: 로그인한 사용자 누구나 (닉네임 검색/상대 표시용)
--   - 생성/수정: 본인 행만
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---- D-2. friendships ----
--   - 조회/수정/삭제: 당사자(requester 또는 addressee)만
--   - 생성: requester_id가 본인인 경우만
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select"
  on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships_insert" on public.friendships;
create policy "friendships_insert"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "friendships_update" on public.friendships;
create policy "friendships_update"
  on public.friendships for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete"
  on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---- D-3. challenges ----
--   - 공개 로비: status='open' 이고 invitee_id가 NULL인 챌린지는
--     로그인한 사용자 누구나 조회 가능
--   - 1:1 도전: 생성자/초대받은 사람만 조회 가능
--   - 생성: creator_id가 본인인 경우만
--   - 수정: 생성자/초대받은 사람만 (수락/취소)
drop policy if exists "challenges_lobby_select" on public.challenges;
create policy "challenges_lobby_select"
  on public.challenges for select to authenticated
  using (status = 'open' and invitee_id is null);

drop policy if exists "challenges_participant_select" on public.challenges;
create policy "challenges_participant_select"
  on public.challenges for select to authenticated
  using (creator_id = auth.uid() or invitee_id = auth.uid());

drop policy if exists "challenges_insert" on public.challenges;
create policy "challenges_insert"
  on public.challenges for insert to authenticated
  with check (creator_id = auth.uid());

drop policy if exists "challenges_update" on public.challenges;
create policy "challenges_update"
  on public.challenges for update to authenticated
  using (creator_id = auth.uid() or invitee_id = auth.uid())
  with check (creator_id = auth.uid() or invitee_id = auth.uid());

drop policy if exists "challenges_delete" on public.challenges;
create policy "challenges_delete"
  on public.challenges for delete to authenticated
  using (creator_id = auth.uid());

-- ---- D-4. games ----
--   - 대국자(백/흑)만 조회/생성/수정
drop policy if exists "games_select" on public.games;
create policy "games_select"
  on public.games for select to authenticated
  using (white_id = auth.uid() or black_id = auth.uid());

drop policy if exists "games_insert" on public.games;
create policy "games_insert"
  on public.games for insert to authenticated
  with check (white_id = auth.uid() or black_id = auth.uid());

drop policy if exists "games_update" on public.games;
create policy "games_update"
  on public.games for update to authenticated
  using (white_id = auth.uid() or black_id = auth.uid())
  with check (white_id = auth.uid() or black_id = auth.uid());

-- ---- D-5. moves ----
--   - 해당 대국의 대국자만 조회/생성/수정 (games 테이블 EXISTS 서브쿼리로 판정)
drop policy if exists "moves_select" on public.moves;
create policy "moves_select"
  on public.moves for select to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.white_id = auth.uid() or g.black_id = auth.uid())
    )
  );

drop policy if exists "moves_insert" on public.moves;
create policy "moves_insert"
  on public.moves for insert to authenticated
  with check (
    exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.white_id = auth.uid() or g.black_id = auth.uid())
    )
  );

drop policy if exists "moves_update" on public.moves;
create policy "moves_update"
  on public.moves for update to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.white_id = auth.uid() or g.black_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.white_id = auth.uid() or g.black_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- E. Realtime: 4개 테이블을 supabase_realtime publication에 등록
--   - challenges: 로비/도전 실시간 반영
--   - games:     대국 상태(수순/무승부 제안/종료) 실시간 반영
--   - moves:     기보 실시간 반영 (+ 수 평가 업데이트)
--   - friendships: 친구 요청 실시간 반영
--   - (이미 등록되어 있으면 건너뜀 — 스크립트 재실행 안전)
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges'
  ) then
    alter publication supabase_realtime add table public.challenges;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moves'
  ) then
    alter publication supabase_realtime add table public.moves;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end
$$;
