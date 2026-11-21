-- =====================================================================
-- Orion Projects — 0015 Repeating tasks
--
-- A task can repeat (every day, weekday, week, 2 weeks, month, 3 months or
-- year), optionally until a date. When it's marked Done, the next one is
-- created automatically: same group, details, owners and checklist (unticked),
-- with the next dates. Dependencies are not copied.
-- =====================================================================

alter table public.tasks
  add column repeat_rule text check (repeat_rule in ('daily', 'weekdays', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  add column repeat_until date,
  add column repeated_from uuid references public.tasks (id) on delete set null;
create index tasks_repeated_from_idx on public.tasks (repeated_from) where repeated_from is not null;

-- The next date for a rule (31 Jan + 1 month = 28/29 Feb).
create or replace function app.next_repeat_date(d date, rule text)
returns date
language sql immutable
set search_path = ''
as $$
  select case rule
    when 'daily' then d + 1
    when 'weekdays' then d + case extract(isodow from d)::int when 5 then 3 when 6 then 2 else 1 end
    when 'weekly' then d + 7
    when 'fortnightly' then d + 14
    when 'monthly' then (d + interval '1 month')::date
    when 'quarterly' then (d + interval '3 months')::date
    when 'yearly' then (d + interval '1 year')::date
  end
$$;

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
                            position, custom_values, internal_notes, created_by, repeat_rule, repeat_until, repeated_from)
  values (new.project_id, new.group_id, new.title, new.description, first_status, new.priority,
          -- Only a start date: the start moves. Otherwise the due date moves (start keeps its distance).
          case when new.due_date is null and new.start_date is not null then next_due else next_start end,
          case when new.due_date is null and new.start_date is not null then null else next_due end,
          new.position + 0.001, new.custom_values, new.internal_notes, coalesce(auth.uid(), new.created_by),
          new.repeat_rule, new.repeat_until, new.id)
  returning id into new_id;

  insert into public.task_checklist_items (task_id, title, is_done, position)
  select new_id, c.title, false, c.position from public.task_checklist_items c where c.task_id = new.id;

  -- Owners: assigned_by stays empty, which makes the notification say "Repeating task".
  insert into public.task_assignees (task_id, user_id, assigned_by)
  select new_id, a.user_id, null from public.task_assignees a where a.task_id = new.id;
  return null;
end;
$$;
drop trigger if exists tasks_repeat on public.tasks;
-- (Not "update of completed_at": that column is filled in by another trigger, which wouldn't count.)
create trigger tasks_repeat after update on public.tasks
  for each row when (old.completed_at is null and new.completed_at is not null and new.repeat_rule is not null)
  execute function app.repeat_task();

-- Assignment notifications: repeat copies say so, instead of "X assigned you a task".
create or replace function app.on_task_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = new.task_id;
  -- Copied automatically together with the repeated task (same transaction, same moment).
  if t.repeated_from is not null and new.assigned_by is null and new.assigned_at = t.created_at then
    perform app.notify(new.user_id, 'task.assigned',
      '🔁 Repeating task: ' || t.title,
      case when t.due_date is not null then 'Due ' || to_char(t.due_date, 'FMDD Mon') else null end,
      '/projects/' || t.project_id || '/board?task=' || t.id, t.project_id, t.id, null);
    return new;
  end if;
  perform app.notify(new.user_id, 'task.assigned',
    app.person_name(coalesce(new.assigned_by, auth.uid())) || ' assigned you a task',
    t.title, '/projects/' || t.project_id || '/board?task=' || t.id, t.project_id, t.id, coalesce(auth.uid(), new.assigned_by));
  return new;
end;
$$;

-- Copying a project / using a template keeps repeat settings.
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
                              start_date, due_date, progress, position, custom_values, repeat_rule, repeat_until)
    values (new_id, (group_map->>r.group_id::text)::uuid, r.title, r.description,
            -- New copies start at the first ("not started") label, not the source's progress.
            (select s.id from public.status_labels s where s.project_id = new_id order by s.position limit 1),
            r.priority, r.start_date + shift, r.due_date + shift, 0, r.position, r.custom_values,
            r.repeat_rule, r.repeat_until + shift)
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

revoke all on function app.repeat_task() from public, anon;
grant execute on function app.next_repeat_date(date, text) to authenticated, service_role;
