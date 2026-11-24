-- =====================================================================
-- Orion Projects — 0025 Important messages (administrators only)
--
-- An administrator sends a message to chosen people. Each person gets a
-- phone notification that stays on screen, and a full-screen message in
-- the app that they must confirm ("I've read this"). Administrators see who
-- has read it. Unread messages are sent again every few hours (working
-- hours, for up to 3 days) by the 15-minute job (/api/cron/reminders).
-- =====================================================================

create table public.announcements (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(trim(title)) between 1 and 120),
  body               text not null check (char_length(trim(body)) between 1 and 4000),
  remind_every_hours smallint check (remind_every_hours is null or remind_every_hours between 1 and 24),
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now()
);

create table public.announcement_recipients (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz,
  last_sent_at    timestamptz not null default now(),
  times_sent      smallint not null default 1,
  primary key (announcement_id, user_id)
);
create index announcement_recipients_unread_idx on public.announcement_recipients (user_id) where read_at is null;

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;

-- Read: administrators see everything; everyone else only messages sent to them.
create policy "announcements: admins read" on public.announcements
  for select to authenticated using (app.is_admin());
create policy "announcements: recipients read" on public.announcements
  for select to authenticated using (
    exists (select 1 from public.announcement_recipients r where r.announcement_id = announcements.id and r.user_id = auth.uid())
  );
create policy "announcements: admins delete" on public.announcements
  for delete to authenticated using (app.is_admin());
create policy "announcement recipients: admins read" on public.announcement_recipients
  for select to authenticated using (app.is_admin());
create policy "announcement recipients: own row" on public.announcement_recipients
  for select to authenticated using (user_id = auth.uid());
-- No insert/update policies: sending and "I've read this" go through the functions below.
revoke all on public.announcements, public.announcement_recipients from public, anon, authenticated;
grant select, delete on public.announcements to authenticated;
grant select on public.announcement_recipients to authenticated;
grant all on public.announcements, public.announcement_recipients to service_role;

-- Administrators: send a message to these people (active accounts only).
create or replace function public.send_announcement(p_title text, p_body text, p_user_ids uuid[], p_remind_every_hours smallint default 2)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a_id uuid;
  r record;
begin
  if not app.is_admin() then
    raise exception 'Only administrators can send important messages' using errcode = '42501';
  end if;
  insert into public.announcements (title, body, remind_every_hours, created_by)
  values (trim(p_title), trim(p_body), p_remind_every_hours, auth.uid())
  returning id into a_id;

  for r in
    select pr.id from public.profiles pr
    where pr.id = any (p_user_ids) and pr.status = 'active'
  loop
    insert into public.announcement_recipients (announcement_id, user_id) values (a_id, r.id);
    -- The sender gets it too if they chose themselves (handy for testing).
    insert into public.notifications (user_id, type, title, body, link, actor_id)
    values (r.id, 'announcement', left('Important: ' || trim(p_title), 200), left(trim(p_body), 1000), '/home?message=' || a_id, auth.uid());
  end loop;

  if not exists (select 1 from public.announcement_recipients where announcement_id = a_id) then
    raise exception 'Choose at least one active person' using errcode = '22023';
  end if;
  return a_id;
end;
$$;

-- "I've read this".
create or replace function public.mark_announcement_read(p_id uuid)
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.announcement_recipients set read_at = now()
  where announcement_id = p_id and user_id = auth.uid() and read_at is null;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and type = 'announcement' and link = '/home?message=' || p_id and read_at is null;
$$;

-- Every 15 minutes (server only): send unread messages again when it's time,
-- 07:00–19:00 Malta, for up to 3 days and at most 10 times. Returns how many.
create or replace function public.queue_announcement_reminders(p_now timestamptz default now())
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  local_time time := (p_now at time zone 'Europe/Malta')::time;
  n integer := 0;
  r record;
begin
  if local_time < '07:00' or local_time > '19:00' then
    return 0;
  end if;
  for r in
    select rc.announcement_id, rc.user_id, a.title, a.body
    from public.announcement_recipients rc
    join public.announcements a on a.id = rc.announcement_id
    join public.profiles pr on pr.id = rc.user_id and pr.status = 'active'
    where rc.read_at is null
      and a.remind_every_hours is not null
      and a.created_at > p_now - interval '3 days'
      and rc.times_sent < 10
      and rc.last_sent_at <= p_now - make_interval(hours => a.remind_every_hours) + interval '2 minutes'
    for update of rc skip locked
  loop
    update public.announcement_recipients set last_sent_at = p_now, times_sent = times_sent + 1
    where announcement_id = r.announcement_id and user_id = r.user_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (r.user_id, 'announcement', left('Reminder – important: ' || r.title, 200), left(r.body, 1000), '/home?message=' || r.announcement_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.send_announcement(text, text, uuid[], smallint) from public, anon;
grant execute on function public.send_announcement(text, text, uuid[], smallint) to authenticated, service_role;
revoke all on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.mark_announcement_read(uuid) to authenticated, service_role;
revoke all on function public.queue_announcement_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_announcement_reminders(timestamptz) to service_role;
