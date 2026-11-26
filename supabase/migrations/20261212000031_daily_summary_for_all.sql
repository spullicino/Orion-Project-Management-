-- =====================================================================
-- Orion Projects — 0031 Daily email summary on for everyone
--
-- The morning email (tasks due soon + what happened since yesterday) was
-- opt-in. It's now on for everyone, including people who join later.
-- Anyone can still switch it off in Profile → Notifications.
-- =====================================================================

alter table public.notification_preferences alter column email_digest set default true;
update public.notification_preferences set email_digest = true where not email_digest;

-- Everyone active gets it unless they switched it off (no saved settings = on).
create or replace function public.get_digest_recipients()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', pr.id, 'email', pr.email, 'first_name', pr.first_name,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'link', n.link, 'created_at', n.created_at) order by n.created_at desc)
      from (select * from public.notifications n where n.user_id = pr.id and n.read_at is null and n.created_at > now() - interval '24 hours'
            order by n.created_at desc limit 30) n
    ), '[]'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'due_date', t.due_date, 'project', p.name,
                                          'link', '/projects/' || t.project_id || '/board?task=' || t.id) order by t.due_date)
      from public.tasks t join public.task_assignees a on a.task_id = t.id and a.user_id = pr.id
      join public.projects p on p.id = t.project_id
      where t.completed_at is null and p.status = 'active' and t.due_date <= public.malta_today() + 1
    ), '[]')
  )), '[]')
  from public.profiles pr
  left join public.notification_preferences np on np.user_id = pr.id
  where pr.status = 'active' and pr.email is not null and coalesce(np.email_digest, true)
$$;
revoke all on function public.get_digest_recipients() from public, anon, authenticated;
grant execute on function public.get_digest_recipients() to service_role;
