-- =====================================================================
-- Orion Projects — 0012 Phase 6: notifications, delay warnings (health)
--
-- Notifications are created by triggers when something happens (assigned,
-- mentioned, status changed, comment, new daily update) and by the daily job
-- (due soon / overdue). The app then sends a phone push for new rows
-- (pushed_at is null) and an optional daily email summary.
--
-- The delay rules below are mirrored exactly in src/lib/health.ts (and both
-- are tested). Keep them in sync.
-- =====================================================================

alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_queue_idx on public.notifications (created_at) where pushed_at is null;

-- ---------------------------------------------------------------------
-- Delay / health rules
--   red   : overdue, or waiting for a task that is itself overdue
--   amber : due within 2 days with < 50 % progress
--           OR behind schedule (progress < time elapsed % − 30)
--           OR waiting for an unfinished task and due to start within 3 days
-- ---------------------------------------------------------------------
create or replace function app.task_risk(t public.tasks, p_today date)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  late_blocker text;
  open_blocker text;
  elapsed numeric;
begin
  if t.completed_at is not null then
    return null;
  end if;
  if t.due_date is not null and t.due_date < p_today then
    return jsonb_build_object('level', 'red', 'reason', 'Overdue');
  end if;
  select b.title into late_blocker
  from public.task_dependencies d join public.tasks b on b.id = d.depends_on_task_id
  where d.task_id = t.id and b.completed_at is null and b.due_date is not null and b.due_date < p_today
  limit 1;
  if late_blocker is not null then
    return jsonb_build_object('level', 'red', 'reason', 'Waiting for a late task: ' || late_blocker);
  end if;
  if t.due_date is not null and t.due_date <= p_today + 2 and t.progress < 50 then
    return jsonb_build_object('level', 'amber', 'reason', 'Due soon with little progress');
  end if;
  if t.start_date is not null and t.due_date is not null and t.due_date > t.start_date and p_today > t.start_date then
    elapsed := least(100, (p_today - t.start_date)::numeric * 100 / (t.due_date - t.start_date));
    if t.progress < elapsed - 30 then
      return jsonb_build_object('level', 'amber', 'reason', 'Behind schedule');
    end if;
  end if;
  select b.title into open_blocker
  from public.task_dependencies d join public.tasks b on b.id = d.depends_on_task_id
  where d.task_id = t.id and b.completed_at is null
  limit 1;
  if open_blocker is not null and coalesce(t.start_date, t.due_date) is not null and coalesce(t.start_date, t.due_date) <= p_today + 3 then
    return jsonb_build_object('level', 'amber', 'reason', 'Waiting for: ' || open_blocker);
  end if;
  return null;
end;
$$;

-- Project health from its tasks:
--   red   : any red high/critical task, or ≥ 2 red tasks and ≥ 20 % of open tasks red,
--           or the planned end date has passed with work still open
--   amber : any red or amber task
--   green : otherwise
create or replace function app.project_health(p_project uuid, p_today date)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with risks as (
    select t.priority, app.task_risk(t, p_today) as r
    from public.tasks t where t.project_id = p_project and t.completed_at is null
  ), c as (
    select count(*) as open_count,
           count(*) filter (where r->>'level' = 'red') as red,
           count(*) filter (where r->>'level' = 'red' and priority in ('high', 'critical')) as red_important,
           count(*) filter (where r->>'level' = 'amber') as amber
    from risks
  )
  select jsonb_build_object(
    'level', case
      when c.red_important > 0 or (c.red >= 2 and c.red * 5 >= c.open_count)
        or (p.end_date is not null and p.end_date < p_today and c.open_count > 0) then 'red'
      when c.red > 0 or c.amber > 0 then 'amber'
      else 'green' end,
    'red', c.red, 'amber', c.amber, 'open', c.open_count,
    'past_end', p.end_date is not null and p.end_date < p_today and c.open_count > 0
  )
  from c, public.projects p where p.id = p_project
$$;

create or replace function public.malta_today()
returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Malta')::date $$;

-- list_projects now includes the health badge.
create or replace function public.list_projects(p_include_archived boolean default false, p_templates boolean default false)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'name')), '[]')
  from (
    select to_jsonb(p) || jsonb_build_object(
      'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = p.client_id),
      'task_count', (select count(*) from public.tasks t where t.project_id = p.id),
      'done_count', (select count(*) from public.tasks t where t.project_id = p.id and t.completed_at is not null),
      'overdue_count', (select count(*) from public.tasks t where t.project_id = p.id and t.completed_at is null
                          and t.due_date < public.malta_today()),
      'avg_progress', (select coalesce(round(avg(t.progress)), 0) from public.tasks t where t.project_id = p.id),
      'member_ids', coalesce((select jsonb_agg(m.user_id) from public.project_members m where m.project_id = p.id), '[]'),
      'health', case when p.is_template or p.status <> 'active' then null else app.project_health(p.id, public.malta_today()) end
    ) as item
    from public.projects p
    where p.is_template = p_templates
      and (p_include_archived or p.status <> 'archived')
  ) x
$$;

-- ---------------------------------------------------------------------
-- Creating notifications
-- ---------------------------------------------------------------------
-- Respects each person's settings: a type switched off (types->>type = 'false') is skipped.
create or replace function app.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_link text,
  p_project uuid default null, p_task uuid default null, p_actor uuid default auth.uid()
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user is not distinct from p_actor then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    return;
  end if;
  if exists (select 1 from public.notification_preferences np where np.user_id = p_user and (np.types ->> p_type) = 'false') then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link, project_id, task_id, actor_id)
  values (p_user, p_type, left(p_title, 200), left(p_body, 1000), left(p_link, 500), p_project, p_task, p_actor);
end;
$$;

create or replace function app.person_name(p_user uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), email::text, 'Someone') from public.profiles where id = p_user
$$;

-- Assigned to a task
create or replace function app.on_task_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = new.task_id;
  perform app.notify(new.user_id, 'task.assigned',
    app.person_name(coalesce(new.assigned_by, auth.uid())) || ' assigned you a task',
    t.title, '/projects/' || t.project_id || '/board?task=' || t.id, t.project_id, t.id, coalesce(auth.uid(), new.assigned_by));
  return new;
end;
$$;
drop trigger if exists task_assignees_notify on public.task_assignees;
create trigger task_assignees_notify after insert on public.task_assignees
  for each row execute function app.on_task_assigned();

-- Status changed → everyone assigned (except whoever changed it)
create or replace function app.on_task_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  label text;
  a record;
begin
  if new.status_id is not distinct from old.status_id then
    return new;
  end if;
  select name into label from public.status_labels where id = new.status_id;
  for a in select user_id from public.task_assignees where task_id = new.id loop
    perform app.notify(a.user_id, 'task.status',
      app.person_name(auth.uid()) || ' changed the status to “' || coalesce(label, 'none') || '”',
      new.title, '/projects/' || new.project_id || '/board?task=' || new.id, new.project_id, new.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists tasks_status_notify on public.tasks;
create trigger tasks_status_notify after update of status_id on public.tasks
  for each row execute function app.on_task_status();

-- Comment on a task → assignees and earlier commenters
create or replace function app.on_task_comment()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.tasks%rowtype;
  u uuid;
begin
  select * into t from public.tasks where id = new.task_id;
  for u in
    select user_id from public.task_assignees where task_id = new.task_id
    union select author_id from public.comments where task_id = new.task_id and id <> new.id
  loop
    perform app.notify(u, 'task.comment', app.person_name(new.author_id) || ' commented on “' || t.title || '”',
      left(new.body, 200), '/projects/' || t.project_id || '/board?task=' || t.id, t.project_id, t.id, new.author_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function app.on_task_comment();

-- @mentions in chat (only people who can read that chat are stored as mentions)
create or replace function app.on_message_mentions()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.channels%rowtype;
  u uuid;
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 then
    return new;
  end if;
  select * into c from public.channels where id = new.channel_id;
  foreach u in array new.mentions loop
    perform app.notify(u, 'mention', app.person_name(new.author_id) || ' mentioned you in ' || c.name,
      left(new.body, 200), '/chats/' || c.id, c.project_id, null, new.author_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists messages_mentions_notify on public.messages;
create trigger messages_mentions_notify after insert on public.messages
  for each row execute function app.on_message_mentions();

-- New daily update → managers who are on that project
create or replace function app.on_daily_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p public.projects%rowtype;
  u uuid;
begin
  select * into p from public.projects where id = new.project_id;
  for u in
    select m.user_id from public.project_members m join public.profiles pr on pr.id = m.user_id
    where m.project_id = new.project_id and pr.role in ('admin', 'manager')
  loop
    perform app.notify(u, 'daily.new', app.person_name(new.author_id) || ' posted a daily update · ' || p.name,
      left(new.work_done, 200), '/projects/' || p.id || '/diary', p.id, null, new.author_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists daily_updates_notify on public.daily_updates;
create trigger daily_updates_notify after insert on public.daily_updates
  for each row execute function app.on_daily_update();

-- ---------------------------------------------------------------------
-- Daily job (called by the server's cron with the secret key)
-- ---------------------------------------------------------------------
-- "Due today", "due tomorrow" and "overdue" reminders for assignees — at most one
-- of each per task per person per day.
create or replace function public.create_due_notifications()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := public.malta_today();
  r record;
  n integer := 0;
  kind text;
  title text;
begin
  for r in
    select t.id, t.title, t.project_id, t.due_date, a.user_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
    join public.projects p on p.id = t.project_id
    where t.completed_at is null and p.status = 'active' and not p.is_template
      and t.due_date is not null and t.due_date <= today + 1
      and t.due_date >= today - 1   -- remind about "overdue" once, the day after it was due
  loop
    kind := case when r.due_date < today then 'task.overdue' else 'task.due_soon' end;
    title := case when r.due_date < today then 'Overdue: ' when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.task_id = r.id and x.type = kind and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, kind, title, null, '/projects/' || r.project_id || '/board?task=' || r.id, r.project_id, r.id, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Hands out notifications that still need a phone push, marking them so two
-- servers never send the same one twice.
create or replace function public.claim_push_batch(p_limit integer default 200)
returns setof public.notifications
language sql volatile security definer
set search_path = ''
as $$
  update public.notifications set pushed_at = now()
  where id in (
    select id from public.notifications
    where pushed_at is null and created_at > now() - interval '1 day'
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning *
$$;

-- People who want the daily email summary, with what to tell them.
create or replace function public.get_digest_recipients()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', pr.id, 'email', pr.email, 'first_name', pr.first_name,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'link', n.link, 'created_at', n.created_at) order by n.created_at desc)
      from (select * from public.notifications n where n.user_id = pr.id and n.read_at is null and n.created_at > now() - interval '24 hours'
            order by n.created_at desc limit 30) n
    ), '[]'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'due_date', t.due_date, 'project', p.name,
                                          'link', '/projects/' || t.project_id || '/board?task=' || t.id) order by t.due_date)
      from public.tasks t join public.task_assignees a on a.task_id = t.id and a.user_id = pr.id
      join public.projects p on p.id = t.project_id
      where t.completed_at is null and p.status = 'active' and t.due_date <= public.malta_today() + 1
    ), '[]')
  )), '[]')
  from public.profiles pr
  join public.notification_preferences np on np.user_id = pr.id and np.email_digest
  where pr.status = 'active'
$$;

-- Housekeeping: old read notifications and rate-limit counters.
create or replace function public.cleanup_old_data()
returns void
language sql volatile security definer
set search_path = ''
as $$
  delete from public.notifications where created_at < now() - interval '90 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$;

revoke all on function public.create_due_notifications() from public, anon, authenticated;
revoke all on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke all on function public.get_digest_recipients() from public, anon, authenticated;
revoke all on function public.cleanup_old_data() from public, anon, authenticated;
grant execute on function public.create_due_notifications() to service_role;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.get_digest_recipients() to service_role;
grant execute on function public.cleanup_old_data() to service_role;
grant execute on function public.malta_today() to authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;
