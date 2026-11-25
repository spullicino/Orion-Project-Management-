-- =====================================================================
-- Orion Projects — 0026 General tasks (not linked to a project)
--
-- E.g. "Chase ABC Ltd for the tender update". Managers and administrators
-- create them and assign colleagues; they can be linked to a client.
-- Visible only to the creator, the people assigned, and administrators.
-- Assignees can change the status, tick the checklist and comment; the
-- creator (or an administrator) can change everything else.
-- =====================================================================

create table public.general_tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(trim(title)) between 1 and 300),
  description      text check (char_length(description) <= 8000),
  client_id        uuid references public.clients (id) on delete set null,
  status           text not null default 'not_started' check (status in ('not_started', 'working', 'waiting', 'done')),
  priority         public.task_priority not null default 'medium',
  due_date         date,
  checklist        jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 100),
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index general_tasks_created_by_idx on public.general_tasks (created_by);

create table public.general_task_assignees (
  task_id uuid not null references public.general_tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index general_task_assignees_user_idx on public.general_task_assignees (user_id);

create table public.general_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.general_tasks (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index general_task_comments_task_idx on public.general_task_comments (task_id, created_at);

-- Who may see / manage a general task (definer: no policy recursion).
create or replace function app.can_see_general_task(p_task uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_active() and (
    app.is_admin()
    or exists (select 1 from public.general_tasks t where t.id = p_task and t.created_by = auth.uid())
    or exists (select 1 from public.general_task_assignees a where a.task_id = p_task and a.user_id = auth.uid())
  )
$$;

create or replace function app.can_manage_general_task(p_task uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_active() and (
    app.is_admin()
    or exists (select 1 from public.general_tasks t where t.id = p_task and t.created_by = auth.uid() and app.is_manager_or_above())
  )
$$;

alter table public.general_tasks enable row level security;
alter table public.general_task_assignees enable row level security;
alter table public.general_task_comments enable row level security;

create policy "general tasks: involved read" on public.general_tasks
  for select to authenticated using (app.can_see_general_task(id) or (created_by = auth.uid() and app.is_manager_or_above()));
create policy "general tasks: managers create" on public.general_tasks
  for insert to authenticated with check (app.is_manager_or_above() and created_by = auth.uid());
create policy "general tasks: involved update" on public.general_tasks
  for update to authenticated using (app.can_see_general_task(id)) with check (app.can_see_general_task(id));
create policy "general tasks: creator or admin delete" on public.general_tasks
  for delete to authenticated using (app.can_manage_general_task(id));

create policy "general task people: involved read" on public.general_task_assignees
  for select to authenticated using (app.can_see_general_task(task_id));
create policy "general task people: creator or admin add" on public.general_task_assignees
  for insert to authenticated with check (app.can_manage_general_task(task_id));
create policy "general task people: creator or admin remove" on public.general_task_assignees
  for delete to authenticated using (app.can_manage_general_task(task_id));

create policy "general task comments: involved read" on public.general_task_comments
  for select to authenticated using (app.can_see_general_task(task_id));
create policy "general task comments: involved write" on public.general_task_comments
  for insert to authenticated with check (app.can_see_general_task(task_id) and author_id = auth.uid());
create policy "general task comments: own delete" on public.general_task_comments
  for delete to authenticated using (author_id = auth.uid() or app.is_admin());

revoke all on public.general_tasks, public.general_task_assignees, public.general_task_comments from public, anon;
grant select, insert, update, delete on public.general_tasks to authenticated;
grant select, insert, delete on public.general_task_assignees, public.general_task_comments to authenticated;
grant all on public.general_tasks, public.general_task_assignees, public.general_task_comments to service_role;

-- Assignees may only change status and checklist; done ⇄ completed_at; tell the creator.
create or replace function app.general_task_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.is_service_role() and not app.can_manage_general_task(old.id) then
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.client_id is distinct from old.client_id or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date or new.created_by is distinct from old.created_by then
      raise exception 'Only the person who created this task can change that' using errcode = '42501';
    end if;
  end if;
  if new.status = 'done' and old.status <> 'done' then new.completed_at := now();
  elsif new.status <> 'done' then new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger general_tasks_before_update before update on public.general_tasks
  for each row execute function app.general_task_before_update();

create or replace function app.general_task_after_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  label text := case new.status when 'done' then 'Done' when 'working' then 'Working on it' when 'waiting' then 'Waiting' else 'Not started' end;
begin
  if new.status is distinct from old.status and new.created_by is not null then
    perform app.notify(new.created_by, 'task.status',
      app.person_name(auth.uid()) || case when new.status = 'done' then ' finished: ' else ' → ' || label || ': ' end || new.title,
      'General task', '/my-tasks?general=' || new.id, null, null, auth.uid());
  end if;
  return null;
end;
$$;
create trigger general_tasks_after_update after update of status on public.general_tasks
  for each row execute function app.general_task_after_update();

-- Someone is given the task → notification.
create or replace function app.general_task_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.general_tasks%rowtype;
begin
  select * into t from public.general_tasks where id = new.task_id;
  perform app.notify(new.user_id, 'task.assigned',
    app.person_name(auth.uid()) || ' gave you a task: ' || t.title,
    coalesce((select 'Client: ' || c.name from public.clients c where c.id = t.client_id), 'General task'),
    '/my-tasks?general=' || t.id, null, null, auth.uid());
  return null;
end;
$$;
create trigger general_task_assignees_notify after insert on public.general_task_assignees
  for each row execute function app.general_task_assigned();

-- New comment → creator and assignees (not the writer).
create or replace function app.general_task_commented()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.general_tasks%rowtype;
  r record;
begin
  select * into t from public.general_tasks where id = new.task_id;
  for r in
    select t.created_by as user_id where t.created_by is not null
    union
    select a.user_id from public.general_task_assignees a where a.task_id = t.id
  loop
    perform app.notify(r.user_id, 'task.comment', app.person_name(new.author_id) || ' commented on ' || t.title,
      left(new.body, 300), '/my-tasks?general=' || t.id, null, null, new.author_id);
  end loop;
  return null;
end;
$$;
create trigger general_task_comments_notify after insert on public.general_task_comments
  for each row execute function app.general_task_commented();

-- My general tasks: assigned to me, created by me, or (p_all) every one for administrators.
create or replace function public.get_general_tasks(p_all boolean default false)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'status', t.status, 'priority', t.priority,
    'due_date', t.due_date, 'checklist', t.checklist, 'completed_at', t.completed_at, 'created_at', t.created_at,
    'created_by', t.created_by, 'creator_name', app.person_name(t.created_by),
    'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = t.client_id),
    'assignees', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'avatar_url', p.avatar_url) order by p.first_name)
                           from public.general_task_assignees a join public.profiles p on p.id = a.user_id where a.task_id = t.id), '[]'::jsonb),
    'comment_count', (select count(*) from public.general_task_comments x where x.task_id = t.id)
  ) order by t.completed_at nulls first, t.due_date nulls last, t.created_at desc), '[]'::jsonb)
  from public.general_tasks t
  where app.is_active()
    and (
      t.created_by = auth.uid()
      or exists (select 1 from public.general_task_assignees a where a.task_id = t.id and a.user_id = auth.uid())
      or (p_all and app.is_admin())
    )
    and (t.completed_at is null or t.completed_at > now() - interval '30 days')
$$;
revoke all on function public.get_general_tasks(boolean) from public, anon;
grant execute on function public.get_general_tasks(boolean) to authenticated;

-- Daily job (server only): due tomorrow / today / overdue (once, the day after) for assignees.
create or replace function public.create_general_task_due_notifications()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := public.malta_today();
  r record;
  n integer := 0;
  kind text;
  v_title text;
begin
  for r in
    select t.id, t.title, t.due_date, a.user_id
    from public.general_tasks t
    join public.general_task_assignees a on a.task_id = t.id
    where t.completed_at is null and t.due_date between today - 1 and today + 1
  loop
    kind := case when r.due_date < today then 'task.overdue' else 'task.due_soon' end;
    v_title := case when r.due_date < today then 'Overdue: ' when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.type = kind and x.link = '/my-tasks?general=' || r.id and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, kind, v_title, 'General task', '/my-tasks?general=' || r.id, null, null, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.create_general_task_due_notifications() from public, anon, authenticated;
grant execute on function public.create_general_task_due_notifications() to service_role;
