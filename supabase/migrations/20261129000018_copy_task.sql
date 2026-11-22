-- =====================================================================
-- Orion Projects — 0018 Copy a task to other projects
--
-- e.g. an internal, repeating "Monthly bill" set up once and copied to other
-- projects with a different date. Copies: name, description, priority,
-- internal + repeat settings, checklist (unticked) and extra-column values
-- (matched by column name). Not copied: status, progress, comments, files,
-- history, "waiting for" links. Owners are kept only if they're on the target
-- project (and, for technicians, only themselves).
-- =====================================================================

create or replace function public.copy_task_to_projects(p_task uuid, p_targets jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  src public.tasks%rowtype;
  tgt record;
  shift integer;
  new_id uuid;
  first_status uuid;
  grp uuid;
  vals jsonb;
  result jsonb := '[]';
begin
  select * into src from public.tasks where id = p_task;
  if not found or not app.can_view_project(src.project_id) then
    raise exception 'Task not found';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 or jsonb_array_length(p_targets) > 50 then
    raise exception 'Choose at least one project';
  end if;

  for tgt in
    select (x->>'project_id')::uuid as project_id, nullif(x->>'group_id', '')::uuid as group_id, nullif(x->>'due_date', '')::date as due_date
    from jsonb_array_elements(p_targets) x
  loop
    if not app.can_edit_project(tgt.project_id) then
      raise exception 'You can''t add tasks to one of the chosen projects' using errcode = '42501';
    end if;

    -- Group: the one chosen (must belong to that project), else same name, else the first.
    select g.id into grp from public.groups g where g.id = tgt.group_id and g.project_id = tgt.project_id;
    if grp is null then
      select g.id into grp from public.groups g
      where g.project_id = tgt.project_id
      order by (g.name = (select s.name from public.groups s where s.id = src.group_id)) desc, g.position, g.created_at
      limit 1;
    end if;
    if grp is null then
      if not app.can_manage_project(tgt.project_id) then
        raise exception 'One of the chosen projects has no groups yet — ask its manager to add one';
      end if;
      insert into public.groups (project_id, name, position) values (tgt.project_id, 'Tasks', 1) returning id into grp;
    end if;

    select s.id into first_status from public.status_labels s
    where s.project_id = tgt.project_id and not s.is_done order by s.position limit 1;

    -- Dates move together: the start keeps its distance from the due date.
    shift := case when tgt.due_date is not null and src.due_date is not null then tgt.due_date - src.due_date else 0 end;

    -- Extra columns: copy values into columns with the same name and type.
    select coalesce(jsonb_object_agg(tc.id::text, src.custom_values -> sc.id::text), '{}') into vals
    from public.project_columns sc
    join public.project_columns tc on tc.project_id = tgt.project_id and lower(tc.name) = lower(sc.name) and tc.kind = sc.kind
    where sc.project_id = src.project_id and src.custom_values ? sc.id::text and sc.kind <> 'file';

    insert into public.tasks (project_id, group_id, title, description, status_id, priority, start_date, due_date, position,
                              custom_values, internal_notes, created_by, repeat_rule, repeat_until, is_internal)
    values (tgt.project_id, grp, src.title, src.description, first_status, src.priority,
            case when src.due_date is null and tgt.due_date is not null then null else src.start_date + shift end,
            coalesce(tgt.due_date, src.due_date),
            coalesce((select max(t.position) from public.tasks t where t.group_id = grp), 0) + 1,
            vals, src.internal_notes, auth.uid(), src.repeat_rule, src.repeat_until + shift, src.is_internal)
    returning id into new_id;

    insert into public.task_checklist_items (task_id, title, is_done, position)
    select new_id, c.title, false, c.position from public.task_checklist_items c where c.task_id = src.id;

    -- Owners who are on the target project (technicians may only keep themselves).
    insert into public.task_assignees (task_id, user_id, assigned_by)
    select new_id, a.user_id, auth.uid()
    from public.task_assignees a
    join public.project_members m on m.project_id = tgt.project_id and m.user_id = a.user_id
    where a.task_id = src.id
      and (app.can_manage_project(tgt.project_id) or a.user_id = auth.uid());

    result := result || jsonb_build_object('project_id', tgt.project_id, 'task_id', new_id);
  end loop;
  return result;
end;
$$;
revoke all on function public.copy_task_to_projects(uuid, jsonb) from public, anon;
grant execute on function public.copy_task_to_projects(uuid, jsonb) to authenticated;
