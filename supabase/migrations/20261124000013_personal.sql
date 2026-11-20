-- =====================================================================
-- Orion Projects — 0013 Personal notes and to-dos
--
-- Strictly private: each row is visible ONLY to the person who owns it.
-- Not even administrators can read someone else's personal notes or to-dos.
-- =====================================================================

create table public.personal_todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title      text not null check (char_length(title) between 1 and 300),
  due_date   date,
  done_at    timestamptz,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_todos_user_idx on public.personal_todos (user_id, done_at, due_date);
create trigger personal_todos_touch before update on public.personal_todos
  for each row execute function app.touch_updated_at();

create table public.personal_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title      text not null default '' check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 20000),
  color      text not null default '#ffffff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_notes_user_idx on public.personal_notes (user_id, pinned desc, updated_at desc);
create trigger personal_notes_touch before update on public.personal_notes
  for each row execute function app.touch_updated_at();

alter table public.personal_todos enable row level security;
alter table public.personal_notes enable row level security;

-- Owner only (and only while their account is active). No admin exception, on purpose.
create policy "personal todos: owner only" on public.personal_todos
  for all to authenticated
  using (user_id = auth.uid() and app.is_active())
  with check (user_id = auth.uid() and app.is_active());

create policy "personal notes: owner only" on public.personal_notes
  for all to authenticated
  using (user_id = auth.uid() and app.is_active())
  with check (user_id = auth.uid() and app.is_active());

grant select, insert, update, delete on public.personal_todos, public.personal_notes to authenticated;
grant all on public.personal_todos, public.personal_notes to service_role;

-- The daily job now also reminds people about their own to-dos due today/tomorrow.
create or replace function public.create_due_notifications()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := public.malta_today();
  r record;
  n integer := 0;
  kind text;
  v_title text;
begin
  for r in
    select t.id, t.title, t.project_id, t.due_date, a.user_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
    join public.projects p on p.id = t.project_id
    where t.completed_at is null and p.status = 'active' and not p.is_template
      and t.due_date is not null and t.due_date <= today + 1
      and t.due_date >= today - 1
  loop
    kind := case when r.due_date < today then 'task.overdue' else 'task.due_soon' end;
    v_title := case when r.due_date < today then 'Overdue: ' when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.task_id = r.id and x.type = kind and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, kind, v_title, null, '/projects/' || r.project_id || '/board?task=' || r.id, r.project_id, r.id, null);
      n := n + 1;
    end if;
  end loop;

  -- Personal to-dos (the notification text is only ever sent to the owner).
  for r in
    select pt.id, pt.title, pt.due_date, pt.user_id
    from public.personal_todos pt
    where pt.done_at is null and pt.due_date is not null and pt.due_date between today and today + 1
  loop
    v_title := case when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.type = 'personal.due' and x.title = left(v_title, 200) and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, 'personal.due', v_title, 'Personal to-do', '/personal', null, null, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.create_due_notifications() from public, anon, authenticated;
grant execute on function public.create_due_notifications() to service_role;
