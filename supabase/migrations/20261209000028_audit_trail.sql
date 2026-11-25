-- =====================================================================
-- Orion Projects — 0028 Audit trail and recycle bin
--
-- 1. audit_log: who created / changed / deleted what, and when — tasks,
--    groups, projects, people on projects, general tasks, material
--    requests, daily updates, comments and people's levels. Only
--    administrators can read it (Admin → Audit log). Names are copied in,
--    so entries still read well after things are deleted.
-- 2. deleted_tasks: a full copy of every deleted task (checklist, people,
--    comments, files, links) for 30 days, so an administrator can restore it.
-- 3. Task history (activity_log) also records people being assigned or
--    removed, "internal" being switched, and restores.
-- =====================================================================

-- Keep a task's history when it is deleted, so it is still there if the task is restored.
alter table public.activity_log drop constraint if exists activity_log_task_id_fkey;

create table public.audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text not null default 'System',
  action       text not null,        -- created | updated | deleted | restored | added | removed | assigned | unassigned
  entity       text not null,        -- task | group | project | project_member | general_task | material_request | daily_update | comment | user
  entity_id    uuid,
  project_id   uuid,                 -- no foreign key: entries outlive the project
  project_name text,
  title        text,                 -- what it was called, e.g. the task title
  changes      jsonb not null default '{}'::jsonb   -- { field: [before, after] }, readable values
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_project_idx on public.audit_log (project_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;
create policy "audit: admins read" on public.audit_log for select to authenticated using (app.is_admin());
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create or replace function app.audit(p_action text, p_entity text, p_entity_id uuid, p_project uuid, p_title text, p_changes jsonb default '{}'::jsonb)
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, project_id, project_name, title, changes)
  values (
    auth.uid(),
    coalesce(app.person_name(auth.uid()), 'System'),
    p_action, p_entity, p_entity_id, p_project,
    (select name from public.projects where id = p_project),
    left(p_title, 300),
    coalesce(p_changes, '{}'::jsonb)
  )
$$;

-- jsonb diff helper: { field: [old, new] } for the listed fields that changed.
create or replace function app.diff(o jsonb, n jsonb, fields text[])
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f, jsonb_build_array(o -> f, n -> f)), '{}'::jsonb)
  from unnest(fields) f
  where (o -> f) is distinct from (n -> f)
$$;

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------
create or replace function app.audit_tasks()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o jsonb;
  n jsonb;
  d jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.audit(case when current_setting('app.restoring', true) = '1' then 'restored' else 'created' end,
      'task', new.id, new.project_id, new.title);
    return null;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.projects where id = old.project_id) then return null; end if; -- whole project deleted
    perform app.audit('deleted', 'task', old.id, old.project_id, old.title,
      case when not exists (select 1 from public.groups where id = old.group_id) then '{"reason": "its group was deleted"}'::jsonb else '{}'::jsonb end);
    return null;
  end if;

  o := to_jsonb(old);
  n := to_jsonb(new);
  d := app.diff(o, n, array['title', 'priority', 'start_date', 'due_date', 'progress', 'is_internal']);
  if o -> 'description' is distinct from n -> 'description' then d := d || '{"description": ["…", "edited"]}'; end if;
  if old.status_id is distinct from new.status_id then
    d := d || jsonb_build_object('status', jsonb_build_array(
      (select name from public.status_labels where id = old.status_id), (select name from public.status_labels where id = new.status_id)));
  end if;
  if old.group_id is distinct from new.group_id then
    d := d || jsonb_build_object('group', jsonb_build_array(
      (select name from public.groups where id = old.group_id), (select name from public.groups where id = new.group_id)));
  end if;
  if d <> '{}'::jsonb then
    perform app.audit('updated', 'task', new.id, new.project_id, new.title, d);
  end if;
  return null;
end;
$$;
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function app.audit_tasks();

-- People assigned / removed (audit + the task's own history).
create or replace function app.audit_task_assignees()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.tasks%rowtype;
  r public.task_assignees%rowtype := case when tg_op = 'INSERT' then new else old end;
  who text := app.person_name(r.user_id);
begin
  select * into t from public.tasks where id = r.task_id;
  if not found then return null; end if; -- the task itself is being deleted
  perform app.audit(case when tg_op = 'INSERT' then 'assigned' else 'unassigned' end, 'task', t.id, t.project_id, t.title,
    jsonb_build_object('person', who));
  insert into public.activity_log (project_id, task_id, actor_id, action, changes)
  values (t.project_id, t.id, auth.uid(), case when tg_op = 'INSERT' then 'task.assigned' else 'task.unassigned' end, jsonb_build_object('person', who));
  return null;
end;
$$;
create trigger task_assignees_audit after insert or delete on public.task_assignees
  for each row execute function app.audit_task_assignees();

-- Comments deleted.
create or replace function app.audit_comment_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = old.task_id;
  if not found then return null; end if;
  perform app.audit('deleted', 'comment', old.id, t.project_id, t.title,
    jsonb_build_object('comment', left(old.body, 300), 'written_by', app.person_name(old.author_id)));
  return null;
end;
$$;
create trigger comments_audit after delete on public.comments
  for each row execute function app.audit_comment_deleted();

-- ---------------------------------------------------------------------
-- Groups, projects, people on projects
-- ---------------------------------------------------------------------
create or replace function app.audit_groups()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'group', new.id, new.project_id, new.name);
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.projects where id = old.project_id) then
      perform app.audit('deleted', 'group', old.id, old.project_id, old.name,
        jsonb_build_object('tasks_deleted', (select count(*) from public.tasks where group_id = old.id)));
    end if;
  elsif old.name is distinct from new.name then
    perform app.audit('updated', 'group', new.id, new.project_id, new.name, jsonb_build_object('name', jsonb_build_array(old.name, new.name)));
  end if;
  return null;
end;
$$;
create trigger groups_audit after insert or update or delete on public.groups
  for each row execute function app.audit_groups();

create or replace function app.audit_projects()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'project', new.id, new.id, new.name);
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, project_id, project_name, title)
    values (auth.uid(), coalesce(app.person_name(auth.uid()), 'System'), 'deleted', 'project', old.id, old.id, old.name, old.name);
  else
    d := app.diff(to_jsonb(old), to_jsonb(new), array['name', 'status', 'start_date', 'end_date']);
    if d <> '{}'::jsonb then perform app.audit('updated', 'project', new.id, new.id, new.name, d); end if;
  end if;
  return null;
end;
$$;
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function app.audit_projects();

create or replace function app.audit_project_members()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.project_members%rowtype := case when tg_op = 'INSERT' then new else old end;
begin
  if not exists (select 1 from public.projects where id = r.project_id) then return null; end if;
  perform app.audit(case when tg_op = 'INSERT' then 'added' else 'removed' end, 'project_member', r.user_id, r.project_id, app.person_name(r.user_id));
  return null;
end;
$$;
create trigger project_members_audit after insert or delete on public.project_members
  for each row execute function app.audit_project_members();

-- ---------------------------------------------------------------------
-- General tasks, material requests, daily updates, people's levels
-- ---------------------------------------------------------------------
create or replace function app.audit_general_tasks()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'general_task', new.id, null, new.title);
  elsif tg_op = 'DELETE' then
    perform app.audit('deleted', 'general_task', old.id, null, old.title);
  else
    d := app.diff(to_jsonb(old), to_jsonb(new), array['title', 'status', 'priority', 'due_date']);
    if d <> '{}'::jsonb then perform app.audit('updated', 'general_task', new.id, null, new.title, d); end if;
  end if;
  return null;
end;
$$;
create trigger general_tasks_audit after insert or update or delete on public.general_tasks
  for each row execute function app.audit_general_tasks();

create or replace function app.audit_material_requests()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'material_request', new.id, new.project_id, 'Material request #' || new.number);
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.projects where id = old.project_id) then
      perform app.audit('deleted', 'material_request', old.id, old.project_id, 'Material request #' || old.number);
    end if;
  elsif old.status is distinct from new.status then
    perform app.audit('updated', 'material_request', new.id, new.project_id, 'Material request #' || new.number,
      jsonb_build_object('status', jsonb_build_array(old.status, new.status)));
  end if;
  return null;
end;
$$;
create trigger material_requests_audit after insert or update or delete on public.material_requests
  for each row execute function app.audit_material_requests();

create or replace function app.audit_daily_updates()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  label text := 'Daily update by ' || app.person_name(coalesce(new.author_id, old.author_id)) || ' for ' || to_char(coalesce(new.work_date, old.work_date), 'DD/MM/YYYY');
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.projects where id = old.project_id) then
      perform app.audit('deleted', 'daily_update', old.id, old.project_id, label, jsonb_build_object('text', left(old.work_done, 300)));
    end if;
  elsif old.work_done is distinct from new.work_done or old.hours is distinct from new.hours or old.issues is distinct from new.issues then
    perform app.audit('updated', 'daily_update', new.id, new.project_id, label, app.diff(to_jsonb(old), to_jsonb(new), array['work_done', 'hours', 'issues']));
  end if;
  return null;
end;
$$;
create trigger daily_updates_audit after update or delete on public.daily_updates
  for each row execute function app.audit_daily_updates();

create or replace function app.audit_profiles()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  d jsonb := app.diff(to_jsonb(old), to_jsonb(new), array['role', 'status', 'first_name', 'last_name']);
begin
  if d <> '{}'::jsonb then
    perform app.audit('updated', 'user', new.id, null, coalesce(nullif(trim(new.first_name || ' ' || new.last_name), ''), new.email::text), d);
  end if;
  return null;
end;
$$;
create trigger profiles_audit after update on public.profiles
  for each row execute function app.audit_profiles();

-- ---------------------------------------------------------------------
-- Recycle bin for deleted tasks (30 days)
-- ---------------------------------------------------------------------
create table public.deleted_tasks (
  task_id         uuid primary key,
  project_id      uuid not null,
  project_name    text,
  title           text not null,
  deleted_at      timestamptz not null default now(),
  deleted_by      uuid references public.profiles (id) on delete set null,
  deleted_by_name text,
  snapshot        jsonb not null,
  restored_at     timestamptz,
  restored_by     uuid references public.profiles (id) on delete set null
);
create index deleted_tasks_deleted_idx on public.deleted_tasks (deleted_at desc);
alter table public.deleted_tasks enable row level security;
create policy "recycle bin: admins read" on public.deleted_tasks for select to authenticated using (app.is_admin());
revoke all on public.deleted_tasks from public, anon, authenticated;
grant select on public.deleted_tasks to authenticated;
grant all on public.deleted_tasks to service_role;

-- Before a task goes, keep a full copy — also when its group is deleted (restoring then puts
-- it in the first group). Not when the whole project is deleted.
create or replace function app.keep_deleted_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
  insert into public.deleted_tasks (task_id, project_id, project_name, title, deleted_by, deleted_by_name, snapshot)
  values (
    old.id, old.project_id, (select name from public.projects where id = old.project_id), old.title,
    auth.uid(), coalesce(app.person_name(auth.uid()), 'System'),
    jsonb_build_object(
      'task', to_jsonb(old),
      'group_name', (select name from public.groups where id = old.group_id),
      'assignees', coalesce((select jsonb_agg(to_jsonb(a)) from public.task_assignees a where a.task_id = old.id), '[]'),
      'checklist', coalesce((select jsonb_agg(to_jsonb(c)) from public.task_checklist_items c where c.task_id = old.id), '[]'),
      'comments', coalesce((select jsonb_agg(to_jsonb(c)) from public.comments c where c.task_id = old.id), '[]'),
      'attachments', coalesce((select jsonb_agg(to_jsonb(f)) from public.attachments f where f.task_id = old.id), '[]'),
      'blocked_by', coalesce((select jsonb_agg(d.depends_on_task_id) from public.task_dependencies d where d.task_id = old.id), '[]'),
      'blocking', coalesce((select jsonb_agg(d.task_id) from public.task_dependencies d where d.depends_on_task_id = old.id), '[]')
    )
  )
  on conflict (task_id) do update set
    deleted_at = now(), deleted_by = excluded.deleted_by, deleted_by_name = excluded.deleted_by_name,
    snapshot = excluded.snapshot, title = excluded.title, restored_at = null, restored_by = null;
  return old;
end;
$$;
create trigger tasks_keep_deleted before delete on public.tasks
  for each row execute function app.keep_deleted_task();

-- Administrators: put a deleted task back where it was (or in the first group if that one is gone).
create or replace function public.restore_task(p_task uuid)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  d public.deleted_tasks%rowtype;
  t jsonb;
  g uuid;
begin
  if not app.is_admin() then
    raise exception 'Only administrators can restore deleted tasks' using errcode = '42501';
  end if;
  select * into d from public.deleted_tasks where task_id = p_task and restored_at is null for update;
  if not found then raise exception 'This task is not in the recycle bin' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.projects where id = d.project_id) then
    raise exception 'Its project has been deleted, so the task can''t be put back' using errcode = '22023';
  end if;
  if exists (select 1 from public.tasks where id = p_task) then
    raise exception 'This task already exists' using errcode = '23505';
  end if;

  t := d.snapshot -> 'task';
  g := (t ->> 'group_id')::uuid;
  if not exists (select 1 from public.groups where id = g) then
    select id into g from public.groups where project_id = d.project_id order by position limit 1;
    if g is null then raise exception 'The project has no groups to put it in' using errcode = '22023'; end if;
  end if;
  t := t || jsonb_build_object('group_id', g);
  if not exists (select 1 from public.status_labels where id = (t ->> 'status_id')::uuid) then
    t := t || '{"status_id": null}';
  end if;
  if (t ->> 'repeated_from') is not null and not exists (select 1 from public.tasks where id = (t ->> 'repeated_from')::uuid) then
    t := t || '{"repeated_from": null}';
  end if;

  perform set_config('app.restoring', '1', true);
  insert into public.tasks select * from jsonb_populate_record(null::public.tasks, t);
  insert into public.task_checklist_items select * from jsonb_populate_recordset(null::public.task_checklist_items, d.snapshot -> 'checklist');
  insert into public.attachments select * from jsonb_populate_recordset(null::public.attachments, d.snapshot -> 'attachments');
  insert into public.comments
    select * from jsonb_populate_recordset(null::public.comments, d.snapshot -> 'comments') c
    where exists (select 1 from public.profiles p where p.id = c.author_id);
  insert into public.task_assignees
    select * from jsonb_populate_recordset(null::public.task_assignees, d.snapshot -> 'assignees') a
    where exists (select 1 from public.profiles p where p.id = a.user_id and p.status = 'active');
  insert into public.task_dependencies (task_id, depends_on_task_id)
    select p_task, x::uuid from jsonb_array_elements_text(d.snapshot -> 'blocked_by') x
    where exists (select 1 from public.tasks o where o.id = x::uuid);
  insert into public.task_dependencies (task_id, depends_on_task_id)
    select x::uuid, p_task from jsonb_array_elements_text(d.snapshot -> 'blocking') x
    where exists (select 1 from public.tasks o where o.id = x::uuid)
    on conflict do nothing;
  perform set_config('app.restoring', '', true);

  insert into public.activity_log (project_id, task_id, actor_id, action, changes)
  values (d.project_id, p_task, auth.uid(), 'task.restored', '{}');
  update public.deleted_tasks set restored_at = now(), restored_by = auth.uid() where task_id = p_task;
  return p_task;
end;
$$;
revoke all on function public.restore_task(uuid) from public, anon;
grant execute on function public.restore_task(uuid) to authenticated, service_role;

-- Daily job: the recycle bin keeps 30 days; the audit log keeps 2 years.
create or replace function public.cleanup_audit()
returns void
language sql volatile security definer
set search_path = ''
as $$
  delete from public.deleted_tasks where deleted_at < now() - interval '30 days';
  delete from public.audit_log where created_at < now() - interval '2 years';
$$;
revoke all on function public.cleanup_audit() from public, anon, authenticated;
grant execute on function public.cleanup_audit() to service_role;
