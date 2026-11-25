-- =====================================================================
-- Orion Projects — 0027 When important messages are sent again
--
-- Unread important messages are sent again only inside a time window.
-- Administrators set the default in Admin → Settings (07:00–17:00, every
-- day, for 3 days) and can change it for a single message when sending.
-- The first notification always goes out straight away.
-- =====================================================================

alter table public.app_settings
  add column message_repeat_from          time     not null default '07:00',
  add column message_repeat_to            time     not null default '17:00',
  add column message_repeat_weekdays_only boolean  not null default false,
  add column message_repeat_days          smallint not null default 3 check (message_repeat_days between 1 and 14),
  add constraint app_settings_message_window check (message_repeat_from < message_repeat_to);

alter table public.announcements
  add column repeat_from          time     not null default '07:00',
  add column repeat_to            time     not null default '17:00',
  add column repeat_weekdays_only boolean  not null default false,
  add column repeat_days          smallint not null default 3 check (repeat_days between 1 and 14),
  add constraint announcements_repeat_window check (repeat_from < repeat_to);

-- Sending now also takes the window (null = the default from Admin → Settings).
drop function public.send_announcement(text, text, uuid[], smallint);
create or replace function public.send_announcement(
  p_title text, p_body text, p_user_ids uuid[], p_remind_every_hours smallint default 2,
  p_repeat_from time default null, p_repeat_to time default null,
  p_weekdays_only boolean default null, p_repeat_days smallint default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a_id uuid;
  r record;
  s public.app_settings%rowtype;
begin
  if not app.is_admin() then
    raise exception 'Only administrators can send important messages' using errcode = '42501';
  end if;
  select * into s from public.app_settings where id;
  insert into public.announcements (title, body, remind_every_hours, created_by, repeat_from, repeat_to, repeat_weekdays_only, repeat_days)
  values (
    trim(p_title), trim(p_body), p_remind_every_hours, auth.uid(),
    coalesce(p_repeat_from, s.message_repeat_from), coalesce(p_repeat_to, s.message_repeat_to),
    coalesce(p_weekdays_only, s.message_repeat_weekdays_only), coalesce(p_repeat_days, s.message_repeat_days)
  )
  returning id into a_id;

  for r in
    select pr.id from public.profiles pr
    where pr.id = any (p_user_ids) and pr.status = 'active'
  loop
    insert into public.announcement_recipients (announcement_id, user_id) values (a_id, r.id);
    insert into public.notifications (user_id, type, title, body, link, actor_id)
    values (r.id, 'announcement', left('Important: ' || trim(p_title), 200), left(trim(p_body), 1000), '/home?message=' || a_id, auth.uid());
  end loop;

  if not exists (select 1 from public.announcement_recipients where announcement_id = a_id) then
    raise exception 'Choose at least one active person' using errcode = '22023';
  end if;
  return a_id;
end;
$$;
revoke all on function public.send_announcement(text, text, uuid[], smallint, time, time, boolean, smallint) from public, anon;
grant execute on function public.send_announcement(text, text, uuid[], smallint, time, time, boolean, smallint) to authenticated, service_role;

-- Every 15 minutes (server only): send unread messages again inside each message's window.
create or replace function public.queue_announcement_reminders(p_now timestamptz default now())
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  local_ts timestamp := p_now at time zone 'Europe/Malta';
  n integer := 0;
  r record;
begin
  for r in
    select rc.announcement_id, rc.user_id, a.title, a.body
    from public.announcement_recipients rc
    join public.announcements a on a.id = rc.announcement_id
    join public.profiles pr on pr.id = rc.user_id and pr.status = 'active'
    where rc.read_at is null
      and a.remind_every_hours is not null
      and a.created_at > p_now - make_interval(days => a.repeat_days)
      and local_ts::time between a.repeat_from and a.repeat_to
      and not (a.repeat_weekdays_only and extract(isodow from local_ts) in (6, 7))
      and rc.times_sent < 30
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
revoke all on function public.queue_announcement_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.queue_announcement_reminders(timestamptz) to service_role;
