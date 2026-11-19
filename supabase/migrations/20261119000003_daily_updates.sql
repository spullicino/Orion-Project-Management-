-- =====================================================================
-- Orion Projects — 0003 Daily work updates (site diary) and photos
-- =====================================================================

create table public.daily_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  work_date  date not null default (now() at time zone 'Europe/Malta')::date,
  work_done  text not null check (char_length(work_done) between 1 and 8000),
  hours      numeric(4, 1) check (hours is null or (hours >= 0 and hours <= 24)),
  issues     text check (char_length(issues) <= 4000),
  -- Client-generated id so offline-queued updates are idempotent when re-sent.
  client_ref uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index daily_updates_project_date_idx on public.daily_updates (project_id, work_date desc, created_at desc);
create index daily_updates_author_date_idx on public.daily_updates (author_id, work_date desc);
create trigger daily_updates_touch before update on public.daily_updates
  for each row execute function app.touch_updated_at();

create table public.daily_update_photos (
  id              uuid primary key default gen_random_uuid(),
  daily_update_id uuid not null references public.daily_updates (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete cascade,
  storage_path    text not null unique,
  width           integer,
  height          integer,
  size_bytes      bigint,
  caption         text check (char_length(caption) <= 500),
  uploaded_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index daily_photos_update_idx on public.daily_update_photos (daily_update_id);
create index daily_photos_project_idx on public.daily_update_photos (project_id, created_at desc);

create or replace function app.photo_project_consistency()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.daily_updates d
                 where d.id = new.daily_update_id and d.project_id = new.project_id) then
    raise exception 'Photo project must match its daily update';
  end if;
  return new;
end;
$$;
create trigger daily_photos_consistency before insert or update on public.daily_update_photos
  for each row execute function app.photo_project_consistency();

-- Author may edit/delete their own update for 24 hours after posting.
create or replace function app.can_modify_daily_update(p_update uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_updates d
    where d.id = p_update
      and (
        app.is_manager_or_above()
        or (d.author_id = auth.uid()
            and d.created_at > now() - interval '24 hours'
            and app.can_edit_project(d.project_id))
      )
  )
$$;

alter table public.daily_updates       enable row level security;
alter table public.daily_update_photos enable row level security;

create policy "daily: read" on public.daily_updates
  for select to authenticated using (app.can_view_project(project_id));
create policy "daily: editor insert own" on public.daily_updates
  for insert to authenticated with check (author_id = auth.uid() and app.can_edit_project(project_id));
create policy "daily: author (24h) or manager update" on public.daily_updates
  for update to authenticated using (app.can_modify_daily_update(id))
  with check (app.can_edit_project(project_id));
create policy "daily: author (24h) or manager delete" on public.daily_updates
  for delete to authenticated using (app.can_modify_daily_update(id));

create policy "photos: read" on public.daily_update_photos
  for select to authenticated using (app.can_view_project(project_id));
create policy "photos: insert on modifiable update" on public.daily_update_photos
  for insert to authenticated with check (
    uploaded_by = auth.uid() and app.can_modify_daily_update(daily_update_id)
  );
create policy "photos: delete on modifiable update" on public.daily_update_photos
  for delete to authenticated using (app.can_modify_daily_update(daily_update_id));

grant execute on all functions in schema app to anon, authenticated, service_role;
