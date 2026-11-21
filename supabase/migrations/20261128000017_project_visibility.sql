-- =====================================================================
-- Orion Projects — 0017 People only see projects they're on
--
-- Before: managers saw and could change every project.
-- Now: managers, technicians and basic users only see projects they've been
-- added to (plus, for managers, projects they created and templates).
-- Administrators still see everything. Whoever creates a project is added to
-- its team automatically.
-- =====================================================================

-- Managers: projects they're on, projects they created, and templates.
create or replace function app.manager_has_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_project_member(p_project)
      or exists (select 1 from public.projects p where p.id = p_project and (p.is_template or p.created_by = auth.uid()))
$$;

create or replace function app.can_view_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then app.manager_has_project(p_project)
    when 'technician' then app.is_project_member(p_project)
    when 'basic' then app.is_project_member(p_project)
    else false
  end
$$;

create or replace function app.can_edit_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then app.manager_has_project(p_project)
    when 'technician' then app.is_project_member(p_project)
    else false
  end
$$;

-- Manager-level changes on a project (settings, people, planning, deleting, client links).
create or replace function app.can_manage_project(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'admin' then true
    when 'manager' then app.manager_has_project(p_project)
    else false
  end
$$;

-- Whoever creates a project is recorded and added to its team.
create or replace function app.project_set_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;
drop trigger if exists projects_set_creator on public.projects;
create trigger projects_set_creator before insert on public.projects
  for each row execute function app.project_set_creator();

create or replace function app.project_add_creator()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.created_by is not null and not new.is_template then
    insert into public.project_members (project_id, user_id, added_by)
    values (new.id, new.created_by, new.created_by)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists projects_add_creator on public.projects;
create trigger projects_add_creator after insert on public.projects
  for each row execute function app.project_add_creator();

-- ---------------------------------------------------------------- policies
-- Read: also check "created by me" on the row itself, so a manager can see the project
-- they're creating in the same statement (before the helper functions can see it).
drop policy "projects: read if visible" on public.projects;
create policy "projects: read if visible" on public.projects
  for select to authenticated
  using (app.can_view_project(id) or (created_by = auth.uid() and app.is_manager_or_above()));

drop policy "projects: manager update" on public.projects;
create policy "projects: manager update" on public.projects
  for update to authenticated using (app.can_manage_project(id)) with check (app.can_manage_project(id));

drop policy "members: manager insert" on public.project_members;
drop policy "members: manager delete" on public.project_members;
create policy "members: manager insert" on public.project_members
  for insert to authenticated with check (app.can_manage_project(project_id));
create policy "members: manager delete" on public.project_members
  for delete to authenticated using (app.can_manage_project(project_id));

-- These were "for all" for every manager (which also allowed reading every project's settings).
drop policy "labels: manager write" on public.status_labels;
create policy "labels: manager write" on public.status_labels
  for all to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
drop policy "columns: manager write" on public.project_columns;
create policy "columns: manager write" on public.project_columns
  for all to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
drop policy "groups: manager write" on public.groups;
create policy "groups: manager write" on public.groups
  for all to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));
drop policy "milestones: manager write" on public.milestones;
create policy "milestones: manager write" on public.milestones
  for all to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));

drop policy "tasks: manager delete" on public.tasks;
create policy "tasks: manager delete" on public.tasks
  for delete to authenticated using (app.can_manage_project(project_id));

drop policy "assignees: manager insert" on public.task_assignees;
drop policy "assignees: manager delete" on public.task_assignees;
create policy "assignees: manager insert" on public.task_assignees
  for insert to authenticated with check (
    app.can_manage_project(app.task_project(task_id))
    or (user_id = auth.uid() and app.can_edit_project(app.task_project(task_id)))
  );
create policy "assignees: manager delete" on public.task_assignees
  for delete to authenticated using (
    app.can_manage_project(app.task_project(task_id))
    or (user_id = auth.uid() and app.can_edit_project(app.task_project(task_id)))
  );

drop policy "deps: manager write" on public.task_dependencies;
create policy "deps: manager write" on public.task_dependencies
  for all to authenticated
  using (app.can_manage_project(app.task_project(task_id)))
  with check (app.can_manage_project(app.task_project(task_id)));

drop policy "attachments: uploader or manager delete" on public.attachments;
create policy "attachments: uploader or manager delete" on public.attachments
  for delete to authenticated using (
    app.can_view_project(app.task_project(task_id))
    and (uploaded_by = auth.uid() or app.can_manage_project(app.task_project(task_id)))
  );

drop policy "share links: manager all" on public.share_links;
create policy "share links: manager all" on public.share_links
  for all to authenticated using (app.can_manage_project(project_id)) with check (app.can_manage_project(project_id));

drop policy "project files: uploader or manager delete" on storage.objects;
create policy "project files: uploader or manager delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files'
         and app.can_view_project(app.try_uuid(app.path_folder(name, 1)))
         and (owner_id = auth.uid()::text or app.can_manage_project(app.try_uuid(app.path_folder(name, 1)))));

-- Chats: managers rename/archive a project's chat only if it's their project.
drop policy "channels: manager update" on public.channels;
create policy "channels: manager update" on public.channels
  for update to authenticated
  using (app.is_manager_or_above() and (project_id is null or app.can_manage_project(project_id)))
  with check (app.is_manager_or_above() and (project_id is null or app.can_manage_project(project_id)));

-- Daily updates: managers change updates only on their own projects.
create or replace function app.can_modify_daily_update(p_update uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_updates d
    where d.id = p_update
      and (
        app.can_manage_project(d.project_id)
        or (d.author_id = auth.uid()
            and d.created_at > now() - interval '24 hours'
            and app.can_edit_project(d.project_id))
      )
  )
$$;

-- ---------------------------------------------------------------- functions
-- Team overview (who has posted today): only the manager's own projects.
create or replace function public.get_daily_status(p_date date)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if not app.is_manager_or_above() then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'project', jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color),
      'update_count', (select count(*) from public.daily_updates d where d.project_id = p.id and d.work_date = p_date),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url,
          'posted', exists (select 1 from public.daily_updates d where d.project_id = p.id and d.author_id = pr.id and d.work_date = p_date)
        ) order by pr.first_name, pr.last_name)
        from public.project_members m
        join public.profiles pr on pr.id = m.user_id
        where m.project_id = p.id and pr.role = 'technician' and pr.status = 'active'
      ), '[]')
    ) order by p.name)
    from public.projects p
    where p.status = 'active' and not p.is_template and app.can_view_project(p.id)
  ), '[]');
end;
$$;

-- Daily Update form: only projects you're on (admins: any).
create or replace function public.get_postable_projects()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) order by p.name), '[]')
  from public.projects p
  where p.status = 'active' and not p.is_template and app.can_edit_project(p.id)
    and (app.is_admin() or app.is_project_member(p.id))
$$;

-- @mention lists in project chats: the project's people (and administrators).
create or replace function public.get_channel_people(p_channel uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare c public.channels%rowtype;
begin
  select * into c from public.channels where id = p_channel;
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url)
                     order by pr.first_name, pr.last_name)
    from public.profiles pr
    where pr.status = 'active'
      and case c.type
            when 'general' then true
            when 'management' then pr.role in ('admin', 'manager')
            when 'project' then pr.role = 'admin'
                             or exists (select 1 from public.project_members m where m.project_id = c.project_id and m.user_id = pr.id)
          end
  ), '[]');
end;
$$;

-- Chat notifications follow the same rule.
create or replace function app.on_message_chat_push()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.channels%rowtype;
  who text;
  preview text;
  att record;
begin
  select * into c from public.channels where id = new.channel_id;
  if not found or c.archived or new.deleted_at is not null then
    return null;
  end if;

  who := app.person_name(new.author_id);
  preview := left(regexp_replace(new.body, '\s+', ' ', 'g'), 180);
  if preview = '' then
    -- Photo or file only. (This trigger runs at the end of the transaction, so attachments exist.)
    select a.mime_type, a.file_name into att from public.message_attachments a where a.message_id = new.id order by a.created_at limit 1;
    preview := case when att.mime_type like 'image/%' then '📷 Photo' when att.file_name is not null then '📎 ' || att.file_name else 'Sent a file' end;
  end if;

  insert into public.push_outbox (user_id, title, body, link, tag, sender)
  select pr.id,
         c.name,
         preview,
         '/chats/' || c.id,
         'chat-' || c.id,
         case when new.parent_id is not null then who || ' (reply)' else who end
  from public.profiles pr
  where pr.status = 'active'
    and pr.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not (pr.id = any (coalesce(new.mentions, '{}')))
    and case c.type
          when 'general' then true
          when 'management' then pr.role in ('admin', 'manager')
          when 'project' then pr.role = 'admin'
                           or exists (select 1 from public.project_members m where m.project_id = c.project_id and m.user_id = pr.id)
        end
    and not exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = pr.id and cm.muted)
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = pr.id and (not np.push_enabled or (np.types ->> 'chat.message') = 'false')
    )
    and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id);
  return null;
end;
$$;

grant execute on all functions in schema app to authenticated, service_role;
