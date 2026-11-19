-- =====================================================================
-- Orion Projects — 0001 Foundation
-- Profiles, user levels, approval workflow, invites, app settings,
-- rate limiting and the permission helper functions every RLS policy uses.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Private schema for helper functions (NOT exposed through the REST API).
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'technician', 'basic');
create type public.user_status as enum ('pending', 'active', 'deactivated');

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '' check (char_length(first_name) <= 80),
  last_name   text not null default '' check (char_length(last_name) <= 80),
  email       extensions.citext not null unique,
  phone       text check (phone is null or char_length(phone) <= 40),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 1000),
  role        public.app_role not null default 'basic',
  status      public.user_status not null default 'pending',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column public.profiles.avatar_url is
  'Either a storage path inside the private "avatars" bucket, or an https URL (e.g. Google profile photo).';

create index profiles_status_idx on public.profiles (status);

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Permission helpers. SECURITY DEFINER so they can read profiles without
-- recursing into profiles' own RLS. All return false for pending or
-- deactivated users, so those users can read nothing but their own profile.
-- ---------------------------------------------------------------------
create or replace function app.current_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function app.is_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function app.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(app.current_role() = 'admin', false)
$$;

create or replace function app.is_manager_or_above()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(app.current_role() in ('admin', 'manager'), false)
$$;

-- Service-role (server code using the secret key) bypasses RLS anyway; this
-- helper lets triggers recognise it too.
create or replace function app.is_service_role()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false)
      or current_user in ('postgres', 'supabase_admin', 'service_role')
$$;

-- Users may edit their own name/phone/avatar, but never their own level or status.
create or replace function app.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_service_role() or app.is_admin() then
    -- An admin can't demote or deactivate themselves (prevents lock-out).
    if not app.is_service_role() and new.id = auth.uid()
       and (new.role <> 'admin' or new.status <> 'active') then
      raise exception 'You cannot remove your own administrator access'
        using errcode = '42501';
    end if;
    if new.status = 'active' and old.status <> 'active' then
      new.approved_at := now();
      new.approved_by := coalesce(auth.uid(), new.approved_by);
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.email is distinct from old.email
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then
    raise exception 'Only an administrator can change level, status or email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_update();

-- ---------------------------------------------------------------------
-- Invites: admin invites an email at a chosen level → auto-approved on sign-up
-- ---------------------------------------------------------------------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext not null,
  role        public.app_role not null default 'technician',
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at  timestamptz
);
create unique index invites_one_open_per_email
  on public.invites (email) where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------
-- New auth user → profile. Invited emails are activated at the invited level.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv  public.invites%rowtype;
  first_n text;
  last_n  text;
begin
  first_n := coalesce(nullif(meta->>'first_name', ''), nullif(meta->>'given_name', ''),
                      split_part(coalesce(meta->>'full_name', meta->>'name', ''), ' ', 1), '');
  last_n  := coalesce(nullif(meta->>'last_name', ''), nullif(meta->>'family_name', ''),
                      nullif(regexp_replace(coalesce(meta->>'full_name', meta->>'name', ''), '^\S+\s*', ''), ''), '');

  select * into inv from public.invites i
   where lower(i.email::text) = lower(new.email)
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc limit 1;

  insert into public.profiles (id, email, first_name, last_name, avatar_url, role, status, approved_by, approved_at)
  values (
    new.id,
    new.email,
    left(first_n, 80),
    left(last_n, 80),
    coalesce(meta->>'avatar_url', meta->>'picture'),
    coalesce(inv.role, 'basic'),
    case when inv.id is not null then 'active'::public.user_status else 'pending'::public.user_status end,
    inv.invited_by,
    case when inv.id is not null then now() end
  );

  if inv.id is not null then
    update public.invites set accepted_at = now() where id = inv.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep profiles.email in sync if a user changes email in Auth.
create or replace function app.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app.handle_user_email_change();

-- ---------------------------------------------------------------------
-- App settings (single row)
-- ---------------------------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  company_name          text not null default 'Orion Group',
  basic_can_post_chat   boolean not null default false,
  daily_update_weekdays smallint[] not null default '{1,2,3,4,5}',  -- ISO: 1 = Monday
  timezone              text not null default 'Europe/Malta',
  updated_at            timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create trigger app_settings_touch before update on public.app_settings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Rate limiting (fixed window). Only callable by the server (service role).
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;

  -- Opportunistic clean-up of old windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.invites      enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits  enable row level security;  -- no policies: service role only

-- Profiles: you always see yourself; active users see other active users
-- (needed for avatars, assignment pickers, chat); admins see everyone.
create policy "profiles: read self" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: active users read active profiles" on public.profiles
  for select to authenticated using (app.is_active() and status = 'active');
create policy "profiles: admin reads all" on public.profiles
  for select to authenticated using (app.is_admin());

-- Updates: self (guard trigger blocks level/status changes) or admin.
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin updates all" on public.profiles
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
-- No insert policy (created by trigger). No delete policy (deleting the auth user cascades).

-- Invites: admins only.
create policy "invites: admin all" on public.invites
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- Settings: every active user can read; only admins change.
create policy "settings: active read" on public.app_settings
  for select to authenticated using (app.is_active());
create policy "settings: admin update" on public.app_settings
  for update to authenticated using (app.is_admin()) with check (app.is_admin());

grant execute on all functions in schema app to anon, authenticated, service_role;
