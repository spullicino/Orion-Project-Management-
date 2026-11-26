-- =====================================================================
-- Orion Projects — 0032 Banner across the top of the app
--
-- Administrators post short announcements or reminders that show in a
-- strip at the top of every screen, one after another (every 7 seconds).
-- Each has a tone (Info / Reminder / Urgent), an optional link, who sees
-- it (everyone, some levels, people on some projects, or chosen people)
-- and how long it shows (from … until …, or until removed). It can be
-- paused. People can't close it (for now).
-- =====================================================================

create table public.banner_messages (
  id                uuid primary key default gen_random_uuid(),
  body              text not null check (char_length(trim(body)) between 1 and 200),
  link              text check (link is null or (char_length(link) <= 500 and (link like '/%' or link ~* '^https?://'))),
  tone              text not null default 'info' check (tone in ('info', 'reminder', 'urgent')),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  paused            boolean not null default false,
  audience_type     text not null default 'everyone' check (audience_type in ('everyone', 'levels', 'projects', 'people')),
  audience_roles    public.app_role[] not null default '{}',
  audience_projects uuid[] not null default '{}',
  audience_people   uuid[] not null default '{}',
  position          integer not null default 0,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index banner_messages_live_idx on public.banner_messages (position) where not paused;
create trigger banner_messages_touch before update on public.banner_messages
  for each row execute function app.touch_updated_at();

-- Is this banner meant for the signed-in person right now?
create or replace function app.banner_for_me(b public.banner_messages)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_active()
     and not b.paused and b.starts_at <= now() and (b.ends_at is null or b.ends_at > now())
     and case b.audience_type
           when 'everyone' then true
           when 'levels'   then app.current_role() = any (b.audience_roles)
           when 'projects' then exists (select 1 from public.project_members m where m.user_id = auth.uid() and m.project_id = any (b.audience_projects))
           when 'people'   then auth.uid() = any (b.audience_people)
           else false
         end
$$;

alter table public.banner_messages enable row level security;
create policy "banner: admins read all" on public.banner_messages
  for select to authenticated using (app.is_admin());
create policy "banner: people read what's meant for them" on public.banner_messages
  for select to authenticated using (app.banner_for_me(banner_messages));
create policy "banner: admins add" on public.banner_messages
  for insert to authenticated with check (app.is_admin() and created_by = auth.uid());
create policy "banner: admins edit" on public.banner_messages
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy "banner: admins delete" on public.banner_messages
  for delete to authenticated using (app.is_admin());
revoke all on public.banner_messages from public, anon;
grant select, insert, update, delete on public.banner_messages to authenticated;
grant all on public.banner_messages to service_role;

-- Audit log: who added, changed or removed a banner message.
create or replace function app.audit_banner_messages()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'banner', new.id, null, new.body);
  elsif tg_op = 'DELETE' then
    perform app.audit('deleted', 'banner', old.id, null, old.body);
  else
    d := app.diff(to_jsonb(old), to_jsonb(new), array['body', 'tone', 'link', 'starts_at', 'ends_at', 'paused', 'audience_type']);
    if d <> '{}'::jsonb then perform app.audit('updated', 'banner', new.id, null, new.body, d); end if;
  end if;
  return null;
end;
$$;
create trigger banner_messages_audit after insert or update or delete on public.banner_messages
  for each row execute function app.audit_banner_messages();

-- The banner messages showing for me now, in order (administrators too only see their own).
create or replace function public.my_banner_messages()
returns setof public.banner_messages
language sql stable security invoker
set search_path = ''
as $$
  select b.* from public.banner_messages b where app.banner_for_me(b) order by b.position, b.created_at
$$;
revoke all on function public.my_banner_messages() from public, anon;
grant execute on function public.my_banner_messages() to authenticated;
