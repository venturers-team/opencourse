-- 오픈코스 챗봇 스키마 (구현 계획 10단계 — docs/07 감사 결과가 설계 입력).
-- 프로젝트 생성(서울 ap-northeast-2 확인)은 사용자와 함께 하는 정지 지점이고,
-- 이 파일은 그 뒤 `supabase db push`로 적용한다.

-- ── 대화 ─────────────────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_slug text not null,
  chapter_id text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- RLS를 단순하게 하려고 소유자를 비정규화해 둔다 (대화 삭제 연쇄와 별개의 방어선)
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'ai')),
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, id);

-- ── 사용량 (원자적 이중 한도) ────────────────────────────────────────────────
create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  used int not null default 0,
  primary key (user_id, day)
);

create table public.global_counters (
  day date primary key,
  used int not null default 0
);

-- ── 동의 기록 (목적별, 시각·문서 버전 포함 — docs/07) ───────────────────────
create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null,
  doc_version text not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

-- ── RLS: 자기 것만 (auth.uid() = user_id) ───────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_counters enable row level security;
alter table public.consents enable row level security;
alter table public.global_counters enable row level security; -- 정책 없음: 클라이언트 접근 전면 차단

create policy conversations_own on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_own on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy usage_own_read on public.usage_counters
  for select using (auth.uid() = user_id);
create policy consents_own on public.consents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 모델 호출 전에 부르는 원자적 한도 소비 ──────────────────────────────────
-- 사용자·전체 카운터를 한 트랜잭션에서 조건부 증가시킨다. 한도를 넘는 요청은
-- 카운터를 바꾸지 못하고 거부 사유만 받는다. 경합에도 초과 증가가 없다.
create or replace function public.consume_quota(
  p_user uuid,
  p_user_limit int default 10,
  p_global_limit int default 500
) returns table (allowed boolean, reason text, user_used int, user_remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  insert into usage_counters (user_id, day, used) values (p_user, current_date, 0)
    on conflict (user_id, day) do nothing;
  insert into global_counters (day, used) values (current_date, 0)
    on conflict (day) do nothing;

  update usage_counters set used = used + 1
    where user_id = p_user and day = current_date and used < p_user_limit
    returning used into v_used;
  if v_used is null then
    return query select false, 'user_exhausted'::text, p_user_limit, 0;
    return;
  end if;

  update global_counters set used = used + 1
    where day = current_date and used < p_global_limit;
  if not found then
    -- 전체 한도 초과 — 방금 올린 사용자 카운터를 되돌린다
    update usage_counters set used = used - 1 where user_id = p_user and day = current_date;
    return query select false, 'global_exhausted'::text, v_used - 1, p_user_limit - v_used + 1;
    return;
  end if;

  return query select true, null::text, v_used, p_user_limit - v_used;
end;
$$;

-- Edge Function(service_role)만 부른다 — 클라이언트 직접 호출 차단.
-- PUBLIC 기본 grant를 걷어내면 service_role도 잃으므로 명시적으로 되돌려 준다.
revoke execute on function public.consume_quota from public, anon, authenticated;
grant execute on function public.consume_quota to service_role;

-- ── 대화 3일 자동 삭제 ──────────────────────────────────────────────────────
create or replace function public.purge_stale_conversations()
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from conversations where last_active_at < now() - interval '3 days' returning 1
  )
  select count(*)::int from gone;
$$;
revoke execute on function public.purge_stale_conversations from public, anon, authenticated;
grant execute on function public.purge_stale_conversations to service_role;

-- pg_cron은 프로젝트 생성 뒤 대시보드에서 확장을 켜고 아래를 실행한다 (10단계 절차):
--   select cron.schedule('purge-conversations', '17 * * * *',
--     $$select public.purge_stale_conversations()$$);
