-- =====================================================================
-- Orion Projects — 0008 Phase 2: boards, My Tasks, task details, templates
--
-- Read functions are SECURITY INVOKER: they run with the caller's rights,
-- so Row Level Security decides what comes back (a Technician asking for a
-- project they are not on simply gets NULL).
-- =====================================================================

-- Built-in board columns a manager has hidden for a project
-- (status, owners, priority, start_date, due_date, progress, dependencies).
alter table public.projects add column if not exists hidden_columns text[] not null default '{}';

-- ---------------------------------------------------------------------
-- Whole board in one round trip
-- ---------------------------------------------------------------------
create or replace function public.get_project_board(p_project uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'project', to_jsonb(p) || jsonb_build_object(
      'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = p.client_id)
    ),
    'labels', coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.status_labels s where s.project_id = p.id), '[]'),
    'columns', coalesce((select jsonb_agg(to_jsonb(pc) order by pc.position) from public.project_columns pc where pc.project_id = p.id), '[]'),
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.position, g.created_at) from public.groups g where g.project_id = p.id), '[]'),
    'tasks', coalesce((
      select jsonb_agg(
        to_jsonb(t) - 'internal_notes' - 'description' || jsonb_build_object(
          'has_description', t.description is not null and t.description <> '',
          'assignees', coalesce((select jsonb_agg(a.user_id order by a.assigned_at) from public.task_assignees a where a.task_id = t.id), '[]'),
          'blocked_by', coalesce((select jsonb_agg(d.depends_on_task_id) from public.task_dependencies d where d.task_id = t.id), '[]'),
          'checklist_total', (select count(*) from public.task_checklist_items ci where ci.task_id = t.id),
          'checklist_done', (select count(*) from public.task_checklist_items ci where ci.task_id = t.id and ci.is_done),
          'comment_count', (select count(*) from public.comments cm where cm.task_id = t.id),
          'attachment_count', (select count(*) from public.attachments at where at.task_id = t.id)
        ) order by t.position, t.created_at)
      from public.tasks t where t.project_id = p.id
    ), '[]'),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'first_name', pr.first_name, 'last_name', pr.last_name,
        'email', pr.email, 'avatar_url', pr.avatar_url, 'role', pr.role
      ) order by pr.first_name, pr.last_name)
      from public.project_members m join public.profiles pr on pr.id = m.user_id
      where m.project_id = p.id
    ), '[]'),
    'milestones', coalesce((select jsonb_agg(to_jsonb(ms) order by ms.date) from public.milestones ms where ms.project_id = p.id), '[]')
  )
  from public.projects p
  where p.id = p_project
$$;

-- ---------------------------------------------------------------------
-- Projects list with progress numbers
-- ---------------------------------------------------------------------
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
                          and t.due_date < (now() at time zone 'Europe/Malta')::date),
      'avg_progress', (select coalesce(round(avg(t.progress)), 0) from public.tasks t where t.project_id = p.id),
      'member_ids', coalesce((select jsonb_agg(m.user_id) from public.project_members m where m.project_id = p.id), '[]')
    ) as item
    from public.projects p
    where p.is_template = p_templates
      and (p_include_archived or p.status <> 'archived')
  ) x
$$;

-- ---------------------------------------------------------------------
-- My Tasks: everything assigned to me across projects
-- (open tasks + anything finished in the last 7 days)
-- ---------------------------------------------------------------------
create or replace function public.get_my_tasks()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'title', t.title, 'project_id', t.project_id, 'group_id', t.group_id,
      'status_id', t.status_id, 'priority', t.priority, 'start_date', t.start_date,
      'due_date', t.due_date, 'progress', t.progress, 'completed_at', t.completed_at,
      'project', jsonb_build_object('name', p.name, 'color', p.color),
      'status', case when s.id is null then null else jsonb_build_object('name', s.name, 'color', s.color, 'is_done', s.is_done) end,
      'group', jsonb_build_object('name', g.name)
    ) order by t.due_date nulls last, t.position
  ), '[]')
  from public.tasks t
  join public.task_assignees a on a.task_id = t.id and a.user_id = auth.uid()
  join public.projects p on p.id = t.project_id
  join public.groups g on g.id = t.group_id
  left join public.status_labels s on s.id = t.status_id
  where p.is_template = false
    and p.status <> 'archived'
    and (t.completed_at is null or t.completed_at > now() - interval '7 days')
$$;

-- ---------------------------------------------------------------------
-- Everything the task drawer shows
-- ---------------------------------------------------------------------
create or replace function public.get_task_detail(p_task uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'task', to_jsonb(t) || jsonb_build_object(
      'assignees', coalesce((select jsonb_agg(a.user_id) from public.task_assignees a where a.task_id = t.id), '[]')
    ),
    'checklist', coalesce((select jsonb_agg(to_jsonb(ci) order by ci.position, ci.created_at)
                            from public.task_checklist_items ci where ci.task_id = t.id), '[]'),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(cm) || jsonb_build_object(
        'author', jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url)
      ) order by cm.created_at)
      from public.comments cm left join public.profiles pr on pr.id = cm.author_id
      where cm.task_id = t.id
    ), '[]'),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(at) order by at.created_at desc) from public.attachments at where at.task_id = t.id
    ), '[]'),
    'blocked_by', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'due_date', o.due_date, 'completed_at', o.completed_at))
      from public.task_dependencies d join public.tasks o on o.id = d.depends_on_task_id
      where d.task_id = t.id
    ), '[]'),
    'blocking', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title))
      from public.task_dependencies d join public.tasks o on o.id = d.task_id
      where d.depends_on_task_id = t.id
    ), '[]'),
    'activity', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc) from (
        select to_jsonb(al) || jsonb_build_object(
          'actor', jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email)
        ) as x
        from public.activity_log al left join public.profiles pr on pr.id = al.actor_id
        where al.task_id = t.id
        order by al.created_at desc
        limit 50
      ) recent
    ), '[]')
  )
  from public.tasks t
  where t.id = p_task
$$;

-- ---------------------------------------------------------------------
-- Duplicate a project's structure (templates). Runs as the caller, so only
-- managers/admins succeed (RLS on every insert). Copies status labels,
-- custom columns, groups, tasks (dates shifted to the new start date),
-- checklists and dependencies. Not copied: people, comments, files, chat.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_project(
  p_source uuid,
  p_name text,
  p_as_template boolean default false,
  p_start_date date default null,
  p_client_id uuid default null
)
returns uuid
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  src public.projects%rowtype;
  new_id uuid;
  shift integer := 0;
  group_map jsonb := '{}';
  task_map jsonb := '{}';
  r record;
  nid uuid;
begin
  if not app.is_manager_or_above() then
    raise exception 'Only managers can create projects' using errcode = '42501';
  end if;
  select * into src from public.projects where id = p_source;
  if not found then
    raise exception 'Project not found';
  end if;
  if p_start_date is not null and src.start_date is not null then
    shift := p_start_date - src.start_date;
  end if;

  insert into public.projects (name, code, description, client_id, status, start_date, end_date, color, is_template, hidden_columns)
  values (p_name, null, src.description, coalesce(p_client_id, src.client_id), 'active',
          coalesce(p_start_date, src.start_date), src.end_date + shift, src.color, p_as_template, src.hidden_columns)
  returning id into new_id;

  -- Replace the default labels with the source project's labels.
  delete from public.status_labels where project_id = new_id;
  for r in select * from public.status_labels where project_id = p_source order by position loop
    insert into public.status_labels (project_id, name, color, position, is_done)
    values (new_id, r.name, r.color, r.position, r.is_done);
  end loop;

  insert into public.project_columns (project_id, name, kind, position)
  select new_id, name, kind, position from public.project_columns where project_id = p_source;

  for r in select * from public.groups where project_id = p_source order by position loop
    insert into public.groups (project_id, name, color, position)
    values (new_id, r.name, r.color, r.position) returning id into nid;
    group_map := group_map || jsonb_build_object(r.id::text, nid);
  end loop;

  for r in select * from public.tasks where project_id = p_source order by position loop
    insert into public.tasks (project_id, group_id, title, description, status_id, priority,
                              start_date, due_date, progress, position, custom_values)
    values (new_id, (group_map->>r.group_id::text)::uuid, r.title, r.description,
            -- New copies start at the first ("not started") label, not the source's progress.
            (select s.id from public.status_labels s where s.project_id = new_id order by s.position limit 1),
            r.priority, r.start_date + shift, r.due_date + shift, 0, r.position, r.custom_values)
    returning id into nid;
    task_map := task_map || jsonb_build_object(r.id::text, nid);

    insert into public.task_checklist_items (task_id, title, is_done, position)
    select nid, title, false, position from public.task_checklist_items where task_id = r.id;
  end loop;

  insert into public.task_dependencies (task_id, depends_on_task_id)
  select (task_map->>d.task_id::text)::uuid, (task_map->>d.depends_on_task_id::text)::uuid
  from public.task_dependencies d
  join public.tasks t on t.id = d.task_id
  where t.project_id = p_source;

  insert into public.milestones (project_id, title, description, date, color)
  select new_id, title, description, date + shift, color from public.milestones where project_id = p_source;

  return new_id;
end;
$$;

-- Function privileges: callable by signed-in users only (RLS applies inside).
revoke all on function public.get_project_board(uuid) from public, anon;
revoke all on function public.list_projects(boolean, boolean) from public, anon;
revoke all on function public.get_my_tasks() from public, anon;
revoke all on function public.get_task_detail(uuid) from public, anon;
revoke all on function public.duplicate_project(uuid, text, boolean, date, uuid) from public, anon;
grant execute on function public.get_project_board(uuid) to authenticated;
grant execute on function public.list_projects(boolean, boolean) to authenticated;
grant execute on function public.get_my_tasks() to authenticated;
grant execute on function public.get_task_detail(uuid) to authenticated;
grant execute on function public.duplicate_project(uuid, text, boolean, date, uuid) to authenticated;

-- Live board updates (Realtime respects RLS for each subscriber).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks', 'groups', 'task_assignees', 'status_labels', 'task_dependencies'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
