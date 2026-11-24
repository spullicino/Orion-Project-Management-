-- =====================================================================
-- Orion Projects — 0024 Who is using the app (Admin → Activity)
--
-- The app notes when each person last opened it ("last active"), at most
-- once every 5 minutes. Only the time is kept — not what they looked at.
-- Only administrators can see it, through get_user_activity().
-- =====================================================================

create table public.user_activity (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- No policies: nobody reads or writes it directly. The functions below do.
revoke all on public.user_activity from public, anon, authenticated;
grant all on public.user_activity to service_role;

-- Called by the app when someone opens it or comes back to it.
create or replace function public.touch_last_seen()
returns void
language sql volatile security definer
set search_path = ''
as $$
  insert into public.user_activity (user_id, last_seen_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  where public.user_activity.last_seen_at < now() - interval '5 minutes';
$$;

-- Administrators: everyone (except people still waiting for approval) with
-- last active time, last daily update and whether phone notifications are on.
create or replace function public.get_user_activity()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Only administrators can see activity' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'first_name', pr.first_name,
      'last_name', pr.last_name,
      'email', pr.email,
      'avatar_url', pr.avatar_url,
      'role', pr.role,
      'status', pr.status,
      'joined_at', pr.created_at,
      'last_seen_at', ua.last_seen_at,
      'last_update', (select max(du.work_date) from public.daily_updates du where du.author_id = pr.id),
      'push_on', exists (select 1 from public.push_subscriptions ps where ps.user_id = pr.id)
                 and not exists (select 1 from public.notification_preferences np where np.user_id = pr.id and not np.push_enabled),
      'projects', coalesce((
        select jsonb_agg(p.name order by p.name)
        from public.project_members pm join public.projects p on p.id = pm.project_id
        where pm.user_id = pr.id and p.status = 'active' and not p.is_template
      ), '[]'::jsonb)
    ) order by ua.last_seen_at asc nulls first, pr.first_name)
    from public.profiles pr
    left join public.user_activity ua on ua.user_id = pr.id
    where pr.status <> 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated, service_role;
revoke all on function public.get_user_activity() from public, anon;
grant execute on function public.get_user_activity() to authenticated, service_role;
