-- =====================================================================
-- Orion Projects — 0036 Aftersales response targets (stage 3)
--
-- Each ticket gets a "first reply by" and a "fixed by" time from its
-- priority, counted in working hours (Mon–Fri 08:00–17:00 Malta time,
-- without public holidays). The clock stops while the ticket waits for the
-- customer (or is resolved) and starts again when it comes back.
-- Every 15 minutes (the reminders job) people are told at 75% of the time
-- and again when a target is missed; resolved tickets with no word from the
-- customer for 7 days are closed.
-- =====================================================================

create table public.as_sla_settings (
  id              boolean primary key default true check (id),
  work_start      time not null default '08:00',
  work_end        time not null default '17:00',
  work_days       smallint[] not null default '{1,2,3,4,5}', -- ISO: 1 = Monday … 7 = Sunday
  -- Working minutes per priority: { "urgent": { "first": 60, "resolve": 540 }, … }
  targets         jsonb not null default '{
    "urgent": { "first": 60,   "resolve": 540 },
    "high":   { "first": 240,  "resolve": 1620 },
    "normal": { "first": 480,  "resolve": 2700 },
    "low":    { "first": 1080, "resolve": 5400 }
  }'::jsonb,
  auto_close_days smallint not null default 7 check (auto_close_days between 0 and 60), -- 0 = never
  updated_at      timestamptz not null default now(),
  check (work_end > work_start),
  check (work_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(work_days) between 1 and 7)
);
insert into public.as_sla_settings (id) values (true) on conflict do nothing;

create table public.as_holidays (
  day  date primary key,
  name text not null check (char_length(trim(name)) between 1 and 80)
);
-- Malta public holidays 2026–2027.
insert into public.as_holidays (day, name) values
  ('2026-01-01', 'New Year''s Day'), ('2026-02-10', 'St Paul''s Shipwreck'), ('2026-03-19', 'St Joseph'),
  ('2026-03-31', 'Freedom Day'), ('2026-04-03', 'Good Friday'), ('2026-05-01', 'Workers'' Day'),
  ('2026-06-07', 'Sette Giugno'), ('2026-06-29', 'St Peter and St Paul (L-Imnarja)'), ('2026-08-15', 'Assumption'),
  ('2026-09-08', 'Victory Day'), ('2026-09-21', 'Independence Day'), ('2026-12-08', 'Immaculate Conception'),
  ('2026-12-13', 'Republic Day'), ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'), ('2027-02-10', 'St Paul''s Shipwreck'), ('2027-03-19', 'St Joseph'),
  ('2027-03-26', 'Good Friday'), ('2027-03-31', 'Freedom Day'), ('2027-05-01', 'Workers'' Day'),
  ('2027-06-07', 'Sette Giugno'), ('2027-06-29', 'St Peter and St Paul (L-Imnarja)'), ('2027-08-15', 'Assumption'),
  ('2027-09-08', 'Victory Day'), ('2027-09-21', 'Independence Day'), ('2027-12-08', 'Immaculate Conception'),
  ('2027-12-13', 'Republic Day'), ('2027-12-25', 'Christmas Day')
on conflict do nothing;

alter table public.as_sla_settings enable row level security;
alter table public.as_holidays enable row level security;
create policy "as sla: module read" on public.as_sla_settings for select to authenticated using (app.has_module('aftersales'));
create policy "as sla: manager edit" on public.as_sla_settings for update to authenticated
  using (app.is_module_manager('aftersales')) with check (app.is_module_manager('aftersales'));
create policy "as holidays: module read" on public.as_holidays for select to authenticated using (app.has_module('aftersales'));
create policy "as holidays: manager add" on public.as_holidays for insert to authenticated with check (app.is_module_manager('aftersales'));
create policy "as holidays: manager remove" on public.as_holidays for delete to authenticated using (app.is_module_manager('aftersales'));
revoke all on public.as_sla_settings, public.as_holidays from public, anon;
grant select, update on public.as_sla_settings to authenticated;
grant select, insert, delete on public.as_holidays to authenticated;
grant all on public.as_sla_settings, public.as_holidays to service_role;

-- ---------------------------------------------------------------------
-- Working time (Malta)
-- ---------------------------------------------------------------------

-- p_start plus p_minutes of working time.
create or replace function app.as_add_work_minutes(p_start timestamptz, p_minutes integer)
returns timestamptz
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s public.as_sla_settings%rowtype;
  t timestamp := p_start at time zone 'Europe/Malta';
  d date := (p_start at time zone 'Europe/Malta')::date;
  left_min numeric := greatest(coalesce(p_minutes, 0), 0);
  day_start timestamp;
  day_end timestamp;
  avail numeric;
  i integer := 0;
begin
  select * into s from public.as_sla_settings where id;
  loop
    i := i + 1;
    if i > 1000 then return p_start + make_interval(mins => p_minutes); end if; -- safety
    if extract(isodow from d)::smallint = any (s.work_days) and not exists (select 1 from public.as_holidays h where h.day = d) then
      day_start := d + s.work_start;
      day_end := d + s.work_end;
      if t < day_start then t := day_start; end if;
      if t < day_end then
        avail := extract(epoch from (day_end - t)) / 60;
        if left_min <= avail then
          return (t + make_interval(secs => left_min * 60)) at time zone 'Europe/Malta';
        end if;
        left_min := left_min - avail;
      end if;
    end if;
    d := d + 1;
    t := d::timestamp;
  end loop;
end;
$$;

-- Working minutes between two moments.
create or replace function app.as_work_minutes_between(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s public.as_sla_settings%rowtype;
  a timestamp := p_from at time zone 'Europe/Malta';
  b timestamp := p_to at time zone 'Europe/Malta';
  d date := (p_from at time zone 'Europe/Malta')::date;
  total numeric := 0;
  lo timestamp;
  hi timestamp;
begin
  if p_from is null or p_to is null or p_to <= p_from then return 0; end if;
  select * into s from public.as_sla_settings where id;
  while d <= b::date and d - a::date < 1000 loop
    if extract(isodow from d)::smallint = any (s.work_days) and not exists (select 1 from public.as_holidays h where h.day = d) then
      lo := greatest(a, d + s.work_start);
      hi := least(b, d + s.work_end);
      if hi > lo then total := total + extract(epoch from (hi - lo)) / 60; end if;
    end if;
    d := d + 1;
  end loop;
  return round(total)::integer;
end;
$$;

-- ---------------------------------------------------------------------
-- Due times on each ticket
-- ---------------------------------------------------------------------
alter table public.as_tickets
  add column first_response_due      timestamptz,
  add column resolve_due             timestamptz,
  add column paused_minutes          integer not null default 0, -- working minutes spent waiting / resolved
  add column paused_since            timestamptz,
  add column sla_first_warned_at     timestamptz,
  add column sla_first_breached_at   timestamptz,
  add column sla_resolve_warned_at   timestamptz,
  add column sla_resolve_breached_at timestamptz;
create index as_tickets_due_idx on public.as_tickets (resolve_due) where status in ('new', 'assigned', 'in_progress');

create or replace function app.as_ticket_sla()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  tg jsonb;
  paused_now boolean := new.status in ('waiting', 'resolved', 'closed');
  recalc boolean := false;
begin
  if tg_op = 'INSERT' then
    new.paused_minutes := 0;
    new.paused_since := case when paused_now then now() end;
    recalc := true;
  else
    -- The clock stops while waiting for the customer (or resolved), and goes on when it comes back.
    if paused_now and old.paused_since is null then new.paused_since := now(); end if;
    if not paused_now and old.paused_since is not null then
      new.paused_minutes := old.paused_minutes + app.as_work_minutes_between(old.paused_since, now());
      new.paused_since := null;
      recalc := true;
    end if;
    if new.priority is distinct from old.priority then recalc := true; end if;
  end if;
  if recalc then
    select s.targets -> new.priority into tg from public.as_sla_settings s where s.id;
    new.first_response_due := app.as_add_work_minutes(new.created_at, coalesce((tg ->> 'first')::integer, 480) + new.paused_minutes);
    new.resolve_due := app.as_add_work_minutes(new.created_at, coalesce((tg ->> 'resolve')::integer, 2700) + new.paused_minutes);
    -- A later deadline can be warned about again.
    if tg_op = 'UPDATE' then
      if new.first_response_due > now() then new.sla_first_warned_at := null; new.sla_first_breached_at := null; end if;
      if new.resolve_due > now() then new.sla_resolve_warned_at := null; new.sla_resolve_breached_at := null; end if;
    end if;
  end if;
  return new;
end;
$$;
-- Runs after as_tickets_before (alphabetical), which settles the status first.
create trigger as_tickets_sla before insert or update on public.as_tickets
  for each row execute function app.as_ticket_sla();

-- Tickets that already exist get their due times now.
update public.as_tickets t
   set first_response_due = app.as_add_work_minutes(t.created_at, coalesce((s.targets -> t.priority ->> 'first')::integer, 480)),
       resolve_due        = app.as_add_work_minutes(t.created_at, coalesce((s.targets -> t.priority ->> 'resolve')::integer, 2700)),
       paused_since       = case when t.status in ('waiting', 'resolved', 'closed') then now() end
  from public.as_sla_settings s
 where s.id and t.first_response_due is null;

-- ---------------------------------------------------------------------
-- Alerts and auto-close (every 15 minutes, from /api/cron/reminders)
-- ---------------------------------------------------------------------
create or replace function public.queue_ticket_sla_alerts()
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  t record;
  u uuid;
  sent integer := 0;
  ref text;
  link text;
  by_when text;
  days smallint;
begin
  for t in
    select * from public.as_tickets
    where status in ('new', 'assigned', 'in_progress') and paused_since is null
      and ((first_response_at is null and (sla_first_breached_at is null)) or sla_resolve_breached_at is null)
  loop
    ref := app.ticket_ref(t.number);
    link := '/aftersales/tickets/' || t.number;

    -- First reply
    if t.first_response_at is null and t.first_response_due is not null then
      by_when := to_char(t.first_response_due at time zone 'Europe/Malta', 'HH24:MI DD/MM');
      if now() >= t.first_response_due and t.sla_first_breached_at is null then
        for u in select x from (select t.assigned_to as x union select app.module_people('aftersales', true)) q where x is not null loop
          perform app.notify(u, 'ticket.sla', ref || ': first reply is overdue', 'Was due by ' || by_when || ' · ' || t.subject, link, null, null, null);
          sent := sent + 1;
        end loop;
        update public.as_tickets set sla_first_breached_at = now(), sla_first_warned_at = coalesce(sla_first_warned_at, now()) where id = t.id;
      elsif t.sla_first_warned_at is null and now() >= t.created_at + (t.first_response_due - t.created_at) * 0.75 and now() < t.first_response_due then
        -- Warning: whoever has it, or the managers if nobody does.
        for u in select t.assigned_to where t.assigned_to is not null
                 union select x from app.module_people('aftersales', true) x where t.assigned_to is null loop
          perform app.notify(u, 'ticket.sla', ref || ': reply due soon', 'First reply due by ' || by_when || ' · ' || t.subject, link, null, null, null);
          sent := sent + 1;
        end loop;
        update public.as_tickets set sla_first_warned_at = now() where id = t.id;
      end if;
    end if;

    -- Fixed by
    if t.resolve_due is not null then
      by_when := to_char(t.resolve_due at time zone 'Europe/Malta', 'HH24:MI DD/MM');
      if now() >= t.resolve_due and t.sla_resolve_breached_at is null then
        for u in select x from (select t.assigned_to as x union select app.module_people('aftersales', true)) q where x is not null loop
          perform app.notify(u, 'ticket.sla', ref || ': overdue — not fixed in time', 'Was due by ' || by_when || ' · ' || t.subject, link, null, null, null);
          sent := sent + 1;
        end loop;
        update public.as_tickets set sla_resolve_breached_at = now(), sla_resolve_warned_at = coalesce(sla_resolve_warned_at, now()) where id = t.id;
      elsif t.sla_resolve_warned_at is null and now() >= t.created_at + (t.resolve_due - t.created_at) * 0.75 and now() < t.resolve_due then
        -- Warning: whoever has it, or the managers if nobody does.
        for u in select t.assigned_to where t.assigned_to is not null
                 union select x from app.module_people('aftersales', true) x where t.assigned_to is null loop
          perform app.notify(u, 'ticket.sla', ref || ': due soon', 'Should be fixed by ' || by_when || ' · ' || t.subject, link, null, null, null);
          sent := sent + 1;
        end loop;
        update public.as_tickets set sla_resolve_warned_at = now() where id = t.id;
      end if;
    end if;
  end loop;

  -- Resolved and the customer hasn't written back: close it.
  select auto_close_days into days from public.as_sla_settings where id;
  if coalesce(days, 0) > 0 then
    update public.as_tickets
       set status = 'closed'
     where status = 'resolved' and resolved_at < now() - make_interval(days => days)
       and (last_customer_at is null or last_customer_at < resolved_at);
  end if;
  return sent;
end;
$$;
revoke all on function public.queue_ticket_sla_alerts() from public, anon, authenticated;
grant execute on function public.queue_ticket_sla_alerts() to service_role;
