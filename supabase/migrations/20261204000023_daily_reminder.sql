-- =====================================================================
-- Orion Projects — 0023 Daily update reminder
--
-- On working days at a time administrators choose (default 16:30, Malta
-- time) technicians on active projects who haven't posted today's daily
-- update get a reminder (🔔 + phone notification). Sent once per day.
--
-- Something must wake the app every 15 minutes to check the time: a
-- Supabase scheduled job (pg_cron) calls /api/cron/reminders. Admin → Setup
-- shows the one-time snippet. The job proves who it is with the token in
-- public.job_secrets, so no secret has to be copied around.
-- =====================================================================

alter table public.app_settings
  add column daily_reminder_enabled boolean not null default true,
  add column daily_reminder_time    time    not null default '16:30',
  add column daily_reminder_sent_on date,
  add column reminder_checked_at    timestamptz;

-- Token the scheduled job sends with each call. Only the server can read it.
create table public.job_secrets (
  name  text primary key,
  token text not null
);
alter table public.job_secrets enable row level security;
revoke all on public.job_secrets from public, anon, authenticated;
grant all on public.job_secrets to service_role;
insert into public.job_secrets (name, token)
values ('reminders', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- Called every ~15 minutes. Sends the reminders once, when the chosen time has
-- come on a working day (and up to 3 hours after, in case a check was missed).
-- Returns how many people were reminded.
create or replace function public.queue_daily_update_reminders(p_now timestamptz default now())
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  s        public.app_settings%rowtype;
  local_ts timestamp := p_now at time zone 'Europe/Malta';
  today    date := (p_now at time zone 'Europe/Malta')::date;
  n        integer := 0;
  r        record;
begin
  update public.app_settings set reminder_checked_at = p_now where id returning * into s;

  if not s.daily_reminder_enabled
     or s.daily_reminder_sent_on is not distinct from today
     or not (extract(isodow from today)::smallint = any (s.daily_update_weekdays))
     or local_ts::time < s.daily_reminder_time
     or local_ts::time > s.daily_reminder_time + interval '3 hours' then
    return 0;
  end if;

  update public.app_settings set daily_reminder_sent_on = today where id;

  for r in
    select pr.id
    from public.profiles pr
    where pr.role = 'technician' and pr.status = 'active'
      and exists (
        select 1 from public.project_members pm
        join public.projects p on p.id = pm.project_id
        where pm.user_id = pr.id and p.status = 'active' and not p.is_template
      )
      and not exists (
        select 1 from public.daily_updates du where du.author_id = pr.id and du.work_date = today
      )
  loop
    perform app.notify(
      r.id, 'daily.reminder',
      'Time to post today''s daily update',
      'What did you do today? Add a few words and photos — it only takes a minute.',
      '/daily-update', null, null, null
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.queue_daily_update_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_daily_update_reminders(timestamptz) to service_role;
