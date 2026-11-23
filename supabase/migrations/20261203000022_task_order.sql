-- =====================================================================
-- Orion Projects — 0022 Task order: insert a task between others, and move tasks
--
-- move_task: puts a task in a group, just before another task (or at the end).
-- insert_task_at: adds a new task right above or below an existing one. If they
-- are linked ("waiting for"), the chain is rewired A → new → B. Later tasks'
-- dates are NOT moved (the Gantt shows a warning if they now clash).
-- Both run as the caller, so the usual permissions apply.
-- =====================================================================

create or replace function public.move_task(p_task uuid, p_group uuid, p_before uuid default null)
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  t public.tasks%rowtype;
  g public.groups%rowtype;
  ids uuid[];
  idx integer;
  i integer;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'Task not found'; end if;
  select * into g from public.groups where id = p_group;
  if not found or g.project_id <> t.project_id then raise exception 'That group is in another project'; end if;
  if p_before is not null and not exists (select 1 from public.tasks where id = p_before and group_id = p_group) then
    raise exception 'The task to place it before is not in that group';
  end if;

  -- The group's tasks in their current order, without the one being moved…
  select coalesce(array_agg(x.id order by x.position, x.created_at), '{}') into ids
  from public.tasks x where x.group_id = p_group and x.id <> p_task;
  -- …then slot it in.
  idx := case when p_before is null then coalesce(array_length(ids, 1), 0) + 1 else array_position(ids, p_before) end;
  ids := ids[1:idx - 1] || p_task || ids[idx:];

  -- Number them 1, 2, 3… (only rows whose place actually changes are written).
  for i in 1 .. array_length(ids, 1) loop
    update public.tasks set position = i, group_id = p_group
    where id = ids[i] and (position is distinct from i or group_id is distinct from p_group);
  end loop;
  -- Row-level security silently skips rows the caller can't change: check it really moved.
  if not exists (select 1 from public.tasks where id = p_task and group_id = p_group and position = idx) then
    raise exception 'You can''t move tasks on this project' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.insert_task_at(
  p_anchor uuid, p_where text, p_title text, p_start date default null, p_due date default null, p_rewire boolean default true
)
returns uuid
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  a public.tasks%rowtype;
  new_id uuid;
  first_status uuid;
  next_id uuid;
  rewired boolean := false;
begin
  if p_where not in ('above', 'below') then raise exception 'Choose above or below'; end if;
  select * into a from public.tasks where id = p_anchor;
  if not found then raise exception 'Task not found'; end if;

  select s.id into first_status from public.status_labels s
  where s.project_id = a.project_id and not s.is_done order by s.position limit 1;

  insert into public.tasks (project_id, group_id, title, status_id, start_date, due_date, position, created_by)
  values (a.project_id, a.group_id, trim(p_title), first_status, p_start, p_due, a.position, auth.uid())
  returning id into new_id;

  -- Place it: above = just before the anchor; below = just before the task after the anchor.
  if p_where = 'above' then
    perform public.move_task(new_id, a.group_id, a.id);
  else
    select x.id into next_id from public.tasks x
    where x.group_id = a.group_id and x.id not in (a.id, new_id)
      and (x.position, x.created_at) > (a.position, a.created_at)
    order by x.position, x.created_at limit 1;
    perform public.move_task(new_id, a.group_id, next_id);
  end if;

  -- Keep the chain of links in order (managers plan links; others just get the task).
  if p_rewire and app.can_manage_project(a.project_id) then
    if p_where = 'below' and exists (select 1 from public.task_dependencies d where d.depends_on_task_id = a.id) then
      -- A → B becomes A → new → B
      update public.task_dependencies set depends_on_task_id = new_id where depends_on_task_id = a.id;
      insert into public.task_dependencies (task_id, depends_on_task_id) values (new_id, a.id);
      rewired := true;
    elsif p_where = 'above' and exists (select 1 from public.task_dependencies d where d.task_id = a.id) then
      -- X → A becomes X → new → A
      insert into public.task_dependencies (task_id, depends_on_task_id)
      select new_id, d.depends_on_task_id from public.task_dependencies d where d.task_id = a.id;
      delete from public.task_dependencies where task_id = a.id;
      insert into public.task_dependencies (task_id, depends_on_task_id) values (a.id, new_id);
      rewired := true;
    end if;
  end if;
  return new_id;
end;
$$;

revoke all on function public.move_task(uuid, uuid, uuid) from public, anon;
revoke all on function public.insert_task_at(uuid, text, text, date, date, boolean) from public, anon;
grant execute on function public.move_task(uuid, uuid, uuid) to authenticated;
grant execute on function public.insert_task_at(uuid, text, text, date, date, boolean) to authenticated;
