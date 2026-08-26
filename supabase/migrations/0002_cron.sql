-- 대화 3일 자동 삭제 스케줄 (docs/08 10단계). pg_cron은 Supabase가 제공하는 확장이다.
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge-conversations') then
    perform cron.schedule('purge-conversations', '17 * * * *', 'select public.purge_stale_conversations()');
  end if;
end $$;
