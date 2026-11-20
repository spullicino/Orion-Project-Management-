-- =====================================================================
-- Orion Projects — 0009 Phase 3: read-only client share links
--
-- Clients open /share/<token> without logging in. They never touch the
-- tables directly: this SECURITY DEFINER function checks the token
-- (exists, not revoked, not expired) and returns ONLY what a client should
-- see — no internal notes, no comments, no files, and owners only if the
-- link allows it.
-- =====================================================================

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
        'blocked_by', coalesce((select jsonb_agg(d.depends_on_task_id) from public.task_dependencies d where d.task_id = t.id), '[]'),
        'owners', case when link.hide_owners then '[]'::jsonb else coalesce((
          select jsonb_agg(trim(pr.first_name || ' ' || pr.last_name))
          from public.task_assignees a join public.profiles pr on pr.id = a.user_id
          where a.task_id = t.id), '[]') end
      ) order by t.position, t.created_at)
      from public.tasks t where t.project_id = p.id
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

revoke all on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated, service_role;

-- Milestones and share links show up live on open boards too.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['milestones'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
