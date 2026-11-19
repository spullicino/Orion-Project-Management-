-- =====================================================================
-- Orion Projects — 0002 Clients, projects, boards, tasks, Gantt data
-- =====================================================================

create type public.project_status as enum ('active', 'on_hold', 'completed', 'archived');
create type public.task_priority  as enum ('low', 'medium', 'high', 'critical');
create type public.column_kind    as enum ('text', 'number', 'file');

-- ---------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 160),
  contact_name  text check (char_length(contact_name) <= 160),
  contact_email text check (char_length(contact_email) <= 254),
  contact_phone text check (char_length(contact_phone) <= 40),
  logo_path     text,
  notes         text check (char_length(notes) <= 4000),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger clients_touch before update on public.clients
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  code        text check (char_length(code) <= 40),
  description text check (char_length(description) <= 8000),
  client_id   uuid references public.clients (id) on delete set null,
  status      public.project_status not null default 'active',
  start_date  date,
  end_date    date,
  color       text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_template boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index projects_client_idx on public.projects (client_id);
create trigger projects_touch before update on public.projects
  for each row execute function app.touch_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------
-- Project-level permission helpers
-- ---------------------------------------------------------------------
create or replace function app.is_project_member(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
  )
$$;

-- Read: managers/admins see all projects; technicians and basic users only
-- the projects they are members of.
create or replace function app.can_view_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then true
    when 'technician' then app.is_project_member(p_project)
    when 'basic' then app.is_project_member(p_project)
    else false
  end
$$;

-- Write (tasks, updates, comments): managers/admins anywhere; technicians on
-- assigned projects; basic users never.
create or replace function app.can_edit_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then true
    when 'technician' then app.is_project_member(p_project)
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- Status labels (editable per project), configurable extra columns
-- ---------------------------------------------------------------------
create table public.status_labels (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  position   integer not null default 0,
  is_done    boolean not null default false
);
create index status_labels_project_idx on public.status_labels (project_id, position);

create table public.project_columns (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  kind       public.column_kind not null,
  position   integer not null default 0,
  -- Which built-in columns are visible is stored in projects' board settings (phase 2).
  created_at timestamptz not null default now()
);
create index project_columns_project_idx on public.project_columns (project_id, position);

-- ---------------------------------------------------------------------
-- Groups (phases) and tasks
-- ---------------------------------------------------------------------
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  color      text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position   double precision not null default 0,
  collapsed  boolean not null default false,
  created_at timestamptz not null default now()
);
create index groups_project_idx on public.groups (project_id, position);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  group_id      uuid not null references public.groups (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 300),
  description   text check (char_length(description) <= 20000),
  status_id     uuid references public.status_labels (id) on delete set null,
  priority      public.task_priority not null default 'medium',
  start_date    date,
  due_date      date,
  progress      smallint not null default 0 check (progress between 0 and 100),
  position      double precision not null default 0,
  custom_values jsonb not null default '{}'::jsonb,
  internal_notes text check (char_length(internal_notes) <= 8000),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_project_idx on public.tasks (project_id, group_id, position);
create index tasks_due_idx on public.tasks (due_date) where completed_at is null;
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();

-- Keep tasks.project_id consistent with the group's project.
create or replace function app.task_project_consistency()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare g_project uuid;
begin
  select project_id into g_project from public.groups where id = new.group_id;
  if g_project is null or g_project <> new.project_id then
    raise exception 'Task group must belong to the same project';
  end if;
  if new.status_id is not null and not exists (
    select 1 from public.status_labels s where s.id = new.status_id and s.project_id = new.project_id
  ) then
    raise exception 'Task status must belong to the same project';
  end if;
  return new;
end;
$$;
create trigger tasks_consistency before insert or update of group_id, project_id, status_id on public.tasks
  for each row execute function app.task_project_consistency();

create or replace function app.task_project(p_task uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select project_id from public.tasks where id = p_task $$;

create table public.task_assignees (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_dependencies (
  task_id            uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create or replace function app.dependency_same_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.task_project(new.task_id) is distinct from app.task_project(new.depends_on_task_id) then
    raise exception 'Dependencies must be between tasks of the same project';
  end if;
  return new;
end;
$$;
create trigger task_dependencies_same_project before insert or update on public.task_dependencies
  for each row execute function app.dependency_same_project();

create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 300),
  is_done    boolean not null default false,
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index checklist_task_idx on public.task_checklist_items (task_id, position);

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 4000),
  date        date not null,
  color       text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id, date);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index comments_task_idx on public.comments (task_id, created_at);

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null,
  file_name    text not null check (char_length(file_name) <= 255),
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index attachments_task_idx on public.attachments (task_id);

-- ---------------------------------------------------------------------
-- Activity log (written by triggers only)
-- ---------------------------------------------------------------------
create table public.activity_log (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete set null,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,            -- e.g. task.created, task.updated, task.deleted
  changes    jsonb not null default '{}'::jsonb,  -- { field: [old, new] }
  created_at timestamptz not null default now()
);
create index activity_project_idx on public.activity_log (project_id, created_at desc);
create index activity_task_idx on public.activity_log (task_id, created_at desc);

create or replace function app.log_task_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  diff jsonb := '{}'::jsonb;
  col  text;
  o    jsonb;
  n    jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (project_id, task_id, actor_id, action, changes)
    values (new.project_id, new.id, auth.uid(), 'task.created', jsonb_build_object('title', jsonb_build_array(null, new.title)));
    return new;
  elsif tg_op = 'DELETE' then
    -- Skip when the whole project is being deleted (cascade).
    if not exists (select 1 from public.projects where id = old.project_id) then
      return old;
    end if;
    insert into public.activity_log (project_id, task_id, actor_id, action, changes)
    values (old.project_id, null, auth.uid(), 'task.deleted', jsonb_build_object('title', jsonb_build_array(old.title, null)));
    return old;
  end if;

  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach col in array array['title','description','status_id','priority','start_date','due_date','progress','group_id','custom_values'] loop
    if o->col is distinct from n->col then
      diff := diff || jsonb_build_object(col, jsonb_build_array(o->col, n->col));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.activity_log (project_id, task_id, actor_id, action, changes)
    values (new.project_id, new.id, auth.uid(), 'task.updated', diff);
  end if;
  return new;
end;
$$;
create trigger tasks_activity after insert or update or delete on public.tasks
  for each row execute function app.log_task_activity();

-- Mark completed_at when the status becomes a "done" label.
create or replace function app.task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare done boolean;
begin
  select s.is_done into done from public.status_labels s where s.id = new.status_id;
  if coalesce(done, false) then
    new.completed_at := coalesce(new.completed_at, now());
    new.progress := 100;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger tasks_completion before insert or update of status_id on public.tasks
  for each row execute function app.task_completion();

-- ---------------------------------------------------------------------
-- Client share links (read-only Gantt). Public access goes through a
-- SECURITY DEFINER function added in phase 3 — never through the tables.
-- ---------------------------------------------------------------------
create table public.share_links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  token          text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  label          text check (char_length(label) <= 120),
  hide_owners    boolean not null default true,
  hide_internal_notes boolean not null default true,
  expires_at     timestamptz default now() + interval '90 days',
  revoked_at     timestamptz,
  last_viewed_at timestamptz,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index share_links_project_idx on public.share_links (project_id);

-- ---------------------------------------------------------------------
-- New project → creator becomes member, default status labels
-- ---------------------------------------------------------------------
create or replace function app.handle_new_project()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, auth.uid(), auth.uid()) on conflict do nothing;
  end if;
  insert into public.status_labels (project_id, name, color, position, is_done) values
    (new.id, 'Not started',   '#94a3b8', 0, false),
    (new.id, 'Working on it', '#f59e0b', 1, false),
    (new.id, 'Stuck',         '#ef4444', 2, false),
    (new.id, 'Done',          '#22c55e', 3, true);
  return new;
end;
$$;
create trigger projects_after_insert after insert on public.projects
  for each row execute function app.handle_new_project();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.clients              enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.status_labels        enable row level security;
alter table public.project_columns      enable row level security;
alter table public.groups               enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_assignees       enable row level security;
alter table public.task_dependencies    enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.milestones           enable row level security;
alter table public.comments             enable row level security;
alter table public.attachments          enable row level security;
alter table public.activity_log         enable row level security;
alter table public.share_links          enable row level security;

-- Clients: any active user can read (name/logo shown on projects); managers+ write; admin deletes.
create policy "clients: active read" on public.clients
  for select to authenticated using (app.is_active());
create policy "clients: manager insert" on public.clients
  for insert to authenticated with check (app.is_manager_or_above());
create policy "clients: manager update" on public.clients
  for update to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());
create policy "clients: admin delete" on public.clients
  for delete to authenticated using (app.is_admin());

-- Projects
create policy "projects: read if visible" on public.projects
  for select to authenticated using (app.can_view_project(id));
create policy "projects: manager insert" on public.projects
  for insert to authenticated with check (app.is_manager_or_above());
create policy "projects: manager update" on public.projects
  for update to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());
create policy "projects: admin delete" on public.projects
  for delete to authenticated using (app.is_admin());

-- Project members: visible to anyone who can see the project; managers+ manage.
create policy "members: read if project visible" on public.project_members
  for select to authenticated using (app.can_view_project(project_id));
create policy "members: manager insert" on public.project_members
  for insert to authenticated with check (app.is_manager_or_above());
create policy "members: manager delete" on public.project_members
  for delete to authenticated using (app.is_manager_or_above());

-- Status labels, custom columns, groups, milestones: read if visible, managers+ write.
create policy "labels: read" on public.status_labels
  for select to authenticated using (app.can_view_project(project_id));
create policy "labels: manager write" on public.status_labels
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

create policy "columns: read" on public.project_columns
  for select to authenticated using (app.can_view_project(project_id));
create policy "columns: manager write" on public.project_columns
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

create policy "groups: read" on public.groups
  for select to authenticated using (app.can_view_project(project_id));
create policy "groups: manager write" on public.groups
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

create policy "milestones: read" on public.milestones
  for select to authenticated using (app.can_view_project(project_id));
create policy "milestones: manager write" on public.milestones
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

-- Tasks: read if visible; create/update if editor (technicians on assigned projects);
-- delete managers+ only.
create policy "tasks: read" on public.tasks
  for select to authenticated using (app.can_view_project(project_id));
create policy "tasks: editor insert" on public.tasks
  for insert to authenticated with check (app.can_edit_project(project_id));
create policy "tasks: editor update" on public.tasks
  for update to authenticated using (app.can_edit_project(project_id)) with check (app.can_edit_project(project_id));
create policy "tasks: manager delete" on public.tasks
  for delete to authenticated using (app.is_manager_or_above());

-- Assignees: managers+ assign anyone; technicians may (un)assign themselves on tasks they can edit.
create policy "assignees: read" on public.task_assignees
  for select to authenticated using (app.can_view_project(app.task_project(task_id)));
create policy "assignees: manager insert" on public.task_assignees
  for insert to authenticated with check (
    app.is_manager_or_above()
    or (user_id = auth.uid() and app.can_edit_project(app.task_project(task_id)))
  );
create policy "assignees: manager delete" on public.task_assignees
  for delete to authenticated using (
    app.is_manager_or_above()
    or (user_id = auth.uid() and app.can_edit_project(app.task_project(task_id)))
  );

-- Dependencies: Gantt planning is a manager job.
create policy "deps: read" on public.task_dependencies
  for select to authenticated using (app.can_view_project(app.task_project(task_id)));
create policy "deps: manager write" on public.task_dependencies
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

-- Checklist: editors.
create policy "checklist: read" on public.task_checklist_items
  for select to authenticated using (app.can_view_project(app.task_project(task_id)));
create policy "checklist: editor write" on public.task_checklist_items
  for all to authenticated
  using (app.can_edit_project(app.task_project(task_id)))
  with check (app.can_edit_project(app.task_project(task_id)));

-- Comments: editors post as themselves; authors edit/delete own; admins delete any.
create policy "comments: read" on public.comments
  for select to authenticated using (app.can_view_project(app.task_project(task_id)));
create policy "comments: editor insert" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid() and app.can_edit_project(app.task_project(task_id))
  );
create policy "comments: author update" on public.comments
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid() and app.can_edit_project(app.task_project(task_id)));
create policy "comments: author or admin delete" on public.comments
  for delete to authenticated using (author_id = auth.uid() or app.is_admin());

-- Attachments: editors upload; uploader or managers+ delete.
create policy "attachments: read" on public.attachments
  for select to authenticated using (app.can_view_project(app.task_project(task_id)));
create policy "attachments: editor insert" on public.attachments
  for insert to authenticated with check (
    uploaded_by = auth.uid() and app.can_edit_project(app.task_project(task_id))
  );
create policy "attachments: uploader or manager delete" on public.attachments
  for delete to authenticated using (uploaded_by = auth.uid() or app.is_manager_or_above());

-- Activity log: read-only for viewers (rows are inserted by triggers).
create policy "activity: read" on public.activity_log
  for select to authenticated using (app.can_view_project(project_id));

-- Share links: managers+ only. Clients use the token via a function, not this table.
create policy "share links: manager all" on public.share_links
  for all to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());

grant execute on all functions in schema app to anon, authenticated, service_role;
