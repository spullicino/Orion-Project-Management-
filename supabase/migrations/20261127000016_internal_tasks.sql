-- =====================================================================
-- Orion Projects — 0016 Internal tasks
--
-- Tasks the team needs but the client shouldn't see on the programme of works
-- (e.g. "Issue monthly invoice"). Internal tasks:
--   * never appear on client share links (or exports — the app leaves them out)
--   * don't count towards % complete or project health
--   * still show on the Board, My Tasks, Calendar and in reminders.
-- =====================================================================

alter table public.tasks add column is_internal boolean not null default false;

-- Client share links: works only.
create or replace function public.get_shared_project(p_token text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  link public.share_links%rowtype;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    return null;
  end if;

  select * into link from public.share_links
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return null;
  end if;

  update public.share_links set last_viewed_at = now() where id = link.id;

  select jsonb_build_object(
    'link', jsonb_build_object('label', link.label, 'expires_at', link.expires_at, 'hide_owners', link.hide_owners),
    'project', jsonb_build_object(
      'id', p.id, 'name', p.name, 'code', p.code, 'color', p.color,
      'start_date', p.start_date, 'end_date', p.end_date, 'status', p.status,
      'client', (select jsonb_build_object('name', c.name, 'logo_path', c.logo_path) from public.clients c where c.id = p.client_id)
    ),
    'labels', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color, 'is_done', s.is_done) order by s.position)
                        from public.status_labels s where s.project_id = p.id), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'color', g.color) order by g.position, g.created_at)
                        from public.groups g where g.project_id = p.id), '[]'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'group_id', t.group_id, 'title', t.title, 'status_id', t.status_id,
        'start_date', t.start_date, 'due_date', t.due_date, 'progress', t.progress,
        'completed_at', t.completed_at,
        'blocked_by', coalesce((select jsonb_agg(d.depends_on_task_id) from public.task_dependencies d
                                join public.tasks b on b.id = d.depends_on_task_id
                                where d.task_id = t.id and not b.is_internal), '[]'),
        'owners', case when link.hide_owners then '[]'::jsonb else coalesce((
          select jsonb_agg(trim(pr.first_name || ' ' || pr.last_name))
          from public.task_assignees a join public.profiles pr on pr.id = a.user_id
          where a.task_id = t.id), '[]') end
      ) order by t.position, t.created_at)
      from public.tasks t where t.project_id = p.id and not t.is_internal -- internal tasks never reach clients
    ), '[]'),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'date', m.date, 'color', m.color) order by m.date)
                            from public.milestones m where m.project_id = p.id), '[]'),
    'generated_at', now()
  )
  into result
  from public.projects p
  where p.id = link.project_id;

  return result;
end;
$$;

-- Health: works only.
create or replace function app.project_health(p_project uuid, p_today date)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with risks as (
    select t.priority, app.task_risk(t, p_today) as r
    from public.tasks t where t.project_id = p_project and t.completed_at is null and not t.is_internal
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

-- Project list counts: works only.
create or replace function public.list_projects(p_include_archived boolean default false, p_templates boolean default false)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'name')), '[]')
  from (
    select to_jsonb(p) || jsonb_build_object(
      'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clients c where c.id = p.client_id),
      'task_count', (select count(*) from public.tasks t where t.project_id = p.id and not t.is_internal),
      'done_count', (select count(*) from public.tasks t where t.project_id = p.id and not t.is_internal and t.completed_at is not null),
      'overdue_count', (select count(*) from public.tasks t where t.project_id = p.id and t.completed_at is null
                          and not t.is_internal and t.due_date < public.malta_today()),
      'avg_progress', (select coalesce(round(avg(t.progress)), 0) from public.tasks t where t.project_id = p.id and not t.is_internal),
      'member_ids', coalesce((select jsonb_agg(m.user_id) from public.project_members m where m.project_id = p.id), '[]'),
      'health', case when p.is_template or p.status <> 'active' then null else app.project_health(p.id, public.malta_today()) end
    ) as item
    from public.projects p
    where p.is_template = p_templates
      and (p_include_archived or p.status <> 'archived')
  ) x
$$;

-- Repeating internal tasks stay internal.
create or replace function app.repeat_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := public.malta_today();
  base date;
  next_due date;
  next_start date;
  first_status uuid;
  new_id uuid;
  is_template boolean;
begin
  -- Only when it has just been completed, repeats, and hasn't already produced the next one.
  if new.repeat_rule is null or new.completed_at is null or old.completed_at is not null then
    return null;
  end if;
  if exists (select 1 from public.tasks x where x.repeated_from = new.id) then
    return null;
  end if;
  select p.is_template into is_template from public.projects p where p.id = new.project_id;
  if coalesce(is_template, false) then
    return null;
  end if;

  base := coalesce(new.due_date, new.start_date, today);
  next_due := app.next_repeat_date(base, new.repeat_rule);
  -- Finished late? Skip ahead so the next one isn't already overdue.
  while next_due < today loop
    next_due := app.next_repeat_date(next_due, new.repeat_rule);
  end loop;
  if new.repeat_until is not null and next_due > new.repeat_until then
    return null; -- the series has ended
  end if;
  -- Keep the same length (start → due) as before.
  next_start := case when new.start_date is not null then next_due - (coalesce(new.due_date, new.start_date) - new.start_date) end;

  select s.id into first_status from public.status_labels s
  where s.project_id = new.project_id and not s.is_done order by s.position limit 1;

  insert into public.tasks (project_id, group_id, title, description, status_id, priority, start_date, due_date,
                            position, custom_values, internal_notes, created_by, repeat_rule, repeat_until, repeated_from, is_internal)
  values (new.project_id, new.group_id, new.title, new.description, first_status, new.priority,
          -- Only a start date: the start moves. Otherwise the due date moves (start keeps its distance).
          case when new.due_date is null and new.start_date is not null then next_due else next_start end,
          case when new.due_date is null and new.start_date is not null then null else next_due end,
          new.position + 0.001, new.custom_values, new.internal_notes, coalesce(auth.uid(), new.created_by),
          new.repeat_rule, new.repeat_until, new.id, new.is_internal)
  returning id into new_id;

  insert into public.task_checklist_items (task_id, title, is_done, position)
  select new_id, c.title, false, c.position from public.task_checklist_items c where c.task_id = new.id;

  -- Owners: assigned_by stays empty, which makes the notification say "Repeating task".
  insert into public.task_assignees (task_id, user_id, assigned_by)
  select new_id, a.user_id, null from public.task_assignees a where a.task_id = new.id;
  return null;
end;
$$;

-- Copies keep the internal flag.
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

  -- Repeating tasks: copy only the latest one of each series.
  for r in select * from public.tasks t where t.project_id = p_source
             and not exists (select 1 from public.tasks x where x.repeated_from = t.id)
           order by position loop
    insert into public.tasks (project_id, group_id, title, description, status_id, priority,
                              start_date, due_date, progress, position, custom_values, repeat_rule, repeat_until, is_internal)
    values (new_id, (group_map->>r.group_id::text)::uuid, r.title, r.description,
            -- New copies start at the first ("not started") label, not the source's progress.
            (select s.id from public.status_labels s where s.project_id = new_id order by s.position limit 1),
            r.priority, r.start_date + shift, r.due_date + shift, 0, r.position, r.custom_values,
            r.repeat_rule, r.repeat_until + shift, r.is_internal)
    returning id into nid;
    task_map := task_map || jsonb_build_object(r.id::text, nid);

    insert into public.task_checklist_items (task_id, title, is_done, position)
    select nid, title, false, position from public.task_checklist_items where task_id = r.id;
  end loop;

  insert into public.task_dependencies (task_id, depends_on_task_id)
  select (task_map->>d.task_id::text)::uuid, (task_map->>d.depends_on_task_id::text)::uuid
  from public.task_dependencies d
  join public.tasks t on t.id = d.task_id
  where t.project_id = p_source and task_map ? d.task_id::text and task_map ? d.depends_on_task_id::text;

  insert into public.milestones (project_id, title, description, date, color)
  select new_id, title, description, date + shift, color from public.milestones where project_id = p_source;

  return new_id;
end;
$$;
