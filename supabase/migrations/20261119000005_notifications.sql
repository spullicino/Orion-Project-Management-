-- =====================================================================
-- Orion Projects — 0005 Notifications, preferences, web push subscriptions
-- (Rows are created by triggers / server jobs in phase 6.)
-- =====================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,  -- task.assigned | mention | task.status | task.due_soon | daily.new | ...
  title      text not null check (char_length(title) <= 200),
  body       text check (char_length(body) <= 1000),
  link       text check (char_length(link) <= 500),
  project_id uuid references public.projects (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id          uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  push_enabled     boolean not null default true,
  email_digest     boolean not null default false,
  -- Per-type switches, e.g. {"task.assigned": true, "daily.new": false}. Missing = on.
  types            jsonb not null default '{}'::jsonb,
  quiet_hours_from time,
  quiet_hours_to   time,
  updated_at       timestamptz not null default now()
);
create trigger notification_prefs_touch before update on public.notification_preferences
  for each row execute function app.touch_updated_at();

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.notifications            enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions       enable row level security;

-- Users only ever see and manage their own notifications. No insert policy:
-- notifications are created by SECURITY DEFINER triggers / the server.
create policy "notifications: read own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create policy "prefs: own" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push: own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and app.is_active());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
