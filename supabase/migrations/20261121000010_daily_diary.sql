-- =====================================================================
-- Orion Projects — 0010 Phase 4: daily site diary feed, photo gallery and
-- the managers' "who has posted today" overview.
--
-- All functions are SECURITY INVOKER: Row Level Security decides which
-- projects' updates and photos each person can see.
-- Photos are stored twice: <id>.jpg (≈1600px) and <id>_thumb.jpg (≈480px).
-- =====================================================================

create index if not exists daily_updates_feed_idx on public.daily_updates (work_date desc, created_at desc);

-- Feed of daily updates, newest day first. Keyset pagination with
-- (p_before_date, p_before_created) taken from the last item of the previous page.
create or replace function public.get_daily_feed(
  p_project uuid default null,
  p_from date default null,
  p_to date default null,
  p_author uuid default null,
  p_before_date date default null,
  p_before_created timestamptz default null,
  p_limit integer default 20
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'work_date') desc, (item->>'created_at') desc), '[]')
  from (
    select jsonb_build_object(
      'id', d.id, 'project_id', d.project_id, 'author_id', d.author_id, 'work_date', d.work_date,
      'work_done', d.work_done, 'hours', d.hours, 'issues', d.issues,
      'created_at', d.created_at, 'updated_at', d.updated_at,
      'project', jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color),
      'author', jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url),
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object('id', ph.id, 'storage_path', ph.storage_path, 'width', ph.width, 'height', ph.height, 'caption', ph.caption)
                         order by ph.created_at)
        from public.daily_update_photos ph where ph.daily_update_id = d.id
      ), '[]')
    ) as item
    from public.daily_updates d
    join public.projects p on p.id = d.project_id
    left join public.profiles pr on pr.id = d.author_id
    where (p_project is null or d.project_id = p_project)
      and (p_author is null or d.author_id = p_author)
      and (p_from is null or d.work_date >= p_from)
      and (p_to is null or d.work_date <= p_to)
      and (p_before_date is null or (d.work_date, d.created_at) < (p_before_date, p_before_created))
    order by d.work_date desc, d.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 500)
  ) x
$$;

-- Photo gallery for one project, newest first, optional date range.
create or replace function public.get_project_photos(
  p_project uuid,
  p_from date default null,
  p_to date default null,
  p_before_created timestamptz default null,
  p_limit integer default 60
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'created_at') desc), '[]')
  from (
    select jsonb_build_object(
      'id', ph.id, 'storage_path', ph.storage_path, 'width', ph.width, 'height', ph.height, 'caption', ph.caption,
      'created_at', ph.created_at, 'work_date', d.work_date, 'daily_update_id', d.id,
      'author', jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email)
    ) as item
    from public.daily_update_photos ph
    join public.daily_updates d on d.id = ph.daily_update_id
    left join public.profiles pr on pr.id = d.author_id
    where ph.project_id = p_project
      and (p_from is null or d.work_date >= p_from)
      and (p_to is null or d.work_date <= p_to)
      and (p_before_created is null or ph.created_at < p_before_created)
    order by ph.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) x
$$;

-- Managers: for each active project, which technicians on it have posted on a given day.
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
    where p.status = 'active' and not p.is_template
  ), '[]');
end;
$$;

-- Projects the current user can post a daily update for (Daily Update form).
create or replace function public.get_postable_projects()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) order by p.name), '[]')
  from public.projects p
  where p.status = 'active' and not p.is_template and app.can_edit_project(p.id)
    and (app.is_manager_or_above() or app.is_project_member(p.id))
$$;

revoke all on function public.get_daily_feed(uuid, date, date, uuid, date, timestamptz, integer) from public, anon;
revoke all on function public.get_project_photos(uuid, date, date, timestamptz, integer) from public, anon;
revoke all on function public.get_daily_status(date) from public, anon;
revoke all on function public.get_postable_projects() from public, anon;
grant execute on function public.get_daily_feed(uuid, date, date, uuid, date, timestamptz, integer) to authenticated;
grant execute on function public.get_project_photos(uuid, date, date, timestamptz, integer) to authenticated;
grant execute on function public.get_daily_status(date) to authenticated;
grant execute on function public.get_postable_projects() to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['daily_updates', 'daily_update_photos'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
