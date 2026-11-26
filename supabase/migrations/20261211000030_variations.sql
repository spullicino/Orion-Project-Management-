-- =====================================================================
-- Orion Projects — 0030 Variations (VO-001, VO-002 …)
--
-- When the client changes work that's already done, the original task
-- stays Done and a new, linked task is created: "VO-001 · <title>" in the
-- project's "Variations" group, with what changed, who asked and when, and
-- the client's approval (Awaiting / Approved / Rejected). A variation can
-- also be created on its own (a brand-new extra). No amounts are kept here.
-- Managers create and edit variation details; everyone on the project can
-- work on the task as usual.
-- =====================================================================

alter table public.tasks
  add column variation_no           integer,
  add column variation_of           uuid references public.tasks (id) on delete set null,
  add column variation_reason       text check (char_length(variation_reason) <= 4000),
  add column variation_requested_by text check (char_length(variation_requested_by) <= 160),
  add column variation_requested_on date,
  add column variation_approval     text check (variation_approval in ('pending', 'approved', 'rejected'));
create unique index tasks_variation_no_idx on public.tasks (project_id, variation_no) where variation_no is not null;
create index tasks_variation_of_idx on public.tasks (variation_of) where variation_of is not null;

-- Only the project's managers (and administrators) change variation details.
-- Runs as the caller, so app.is_service_role() tells the server/functions apart from people.
create or replace function app.guard_variation_fields()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  if app.is_service_role() or app.can_manage_project(new.project_id) then return new; end if;
  if tg_op = 'INSERT' then
    if new.variation_no is not null or new.variation_of is not null or new.variation_reason is not null
       or new.variation_requested_by is not null or new.variation_requested_on is not null or new.variation_approval is not null then
      raise exception 'Only managers can create variations' using errcode = '42501';
    end if;
  elsif new.variation_no is distinct from old.variation_no or new.variation_of is distinct from old.variation_of
     or new.variation_reason is distinct from old.variation_reason or new.variation_requested_by is distinct from old.variation_requested_by
     or new.variation_requested_on is distinct from old.variation_requested_on or new.variation_approval is distinct from old.variation_approval then
    raise exception 'Only managers can change variation details' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_guard_variation before insert or update on public.tasks
  for each row execute function app.guard_variation_fields();

-- Managers: create VO-00n — from a task (usually a completed one) or on its own.
-- Returns the new task's id. The original task is not changed.
create or replace function public.create_variation(
  p_project uuid, p_source uuid, p_title text, p_reason text,
  p_requested_by text default null, p_requested_on date default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  src public.tasks%rowtype;
  grp uuid;
  no integer;
  first_status uuid;
  new_id uuid;
  base text;
begin
  if not app.can_manage_project(p_project) then
    raise exception 'Only managers can create variations' using errcode = '42501';
  end if;
  if p_source is not null then
    select * into src from public.tasks where id = p_source and project_id = p_project;
    if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  end if;
  base := nullif(trim(coalesce(p_title, '')), '');
  if base is null and p_source is not null then base := regexp_replace(src.title, '^VO-\d+ · ', ''); end if;
  if base is null then raise exception 'Give the variation a name' using errcode = '22023'; end if;

  -- The project's "Variations" group (made the first time, at the end of the board).
  select g.id into grp from public.groups g where g.project_id = p_project and lower(g.name) = 'variations' order by g.position limit 1;
  if grp is null then
    insert into public.groups (project_id, name, color, position)
    values (p_project, 'Variations', '#d97706', coalesce((select max(position) from public.groups where project_id = p_project), 0) + 1)
    returning id into grp;
  end if;

  perform pg_advisory_xact_lock(hashtext('variation:' || p_project));
  select coalesce(max(variation_no), 0) + 1 into no from public.tasks where project_id = p_project;
  select s.id into first_status from public.status_labels s where s.project_id = p_project and not s.is_done order by s.position limit 1;

  insert into public.tasks (project_id, group_id, title, description, status_id, priority, position, created_by,
                            variation_no, variation_of, variation_reason, variation_requested_by, variation_requested_on, variation_approval)
  values (p_project, grp, left('VO-' || lpad(no::text, 3, '0') || ' · ' || base, 300), nullif(trim(coalesce(p_reason, '')), ''),
          first_status, coalesce(src.priority, 'medium'),
          coalesce((select max(t.position) from public.tasks t where t.group_id = grp), 0) + 1, auth.uid(),
          no, p_source, nullif(trim(coalesce(p_reason, '')), ''), nullif(trim(coalesce(p_requested_by, '')), ''),
          coalesce(p_requested_on, public.malta_today()), 'pending')
  returning id into new_id;

  -- Same people as the original (if any).
  if p_source is not null then
    insert into public.task_assignees (task_id, user_id, assigned_by)
    select new_id, a.user_id, auth.uid() from public.task_assignees a where a.task_id = p_source;
    insert into public.activity_log (project_id, task_id, actor_id, action, changes)
    values (p_project, p_source, auth.uid(), 'task.variation', jsonb_build_object('variation', 'VO-' || lpad(no::text, 3, '0')));
  end if;
  return new_id;
end;
$$;
revoke all on function public.create_variation(uuid, uuid, text, text, text, date) from public, anon;
grant execute on function public.create_variation(uuid, uuid, text, text, text, date) to authenticated, service_role;
