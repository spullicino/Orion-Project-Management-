-- =====================================================================
-- Orion Projects — 0038 Comments on daily updates
--
-- Anyone who can see a daily update can comment on it (text). The update's
-- author and everyone who commented before are told about new comments, and
-- @mentioned people are told too. People edit or delete their own comments;
-- the project's managers and administrators can delete any. Deletions go to
-- the audit log.
-- =====================================================================

create table public.daily_update_comments (
  id         uuid primary key default gen_random_uuid(),
  update_id  uuid not null references public.daily_updates (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  mentions   uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index daily_update_comments_update_idx on public.daily_update_comments (update_id, created_at);

alter table public.daily_update_comments enable row level security;
create policy "daily comments: read" on public.daily_update_comments
  for select to authenticated using (app.can_view_project(project_id));
create policy "daily comments: add" on public.daily_update_comments
  for insert to authenticated with check (
    author_id = auth.uid() and app.can_view_project(project_id)
    and project_id = (select d.project_id from public.daily_updates d where d.id = update_id)
  );
create policy "daily comments: author edits" on public.daily_update_comments
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and app.can_view_project(project_id));
create policy "daily comments: author or manager deletes" on public.daily_update_comments
  for delete to authenticated using (author_id = auth.uid() or app.can_manage_project(project_id));
revoke all on public.daily_update_comments from public, anon;
grant select, insert, update, delete on public.daily_update_comments to authenticated;
grant all on public.daily_update_comments to service_role;

-- Only the text can change (and it's marked edited); the rest stays as it was.
create or replace function app.daily_comment_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.update_id := old.update_id;
  new.project_id := old.project_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;
create trigger daily_update_comments_before_update before update on public.daily_update_comments
  for each row execute function app.daily_comment_before_update();

-- People who can be @mentioned on a project's updates: its members and the administrators.
create or replace function app.project_people(p_project uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.user_id from public.project_members m join public.profiles pr on pr.id = m.user_id
  where m.project_id = p_project and pr.status = 'active'
  union
  select pr.id from public.profiles pr where pr.role = 'admin' and pr.status = 'active'
$$;

-- For the @mention list (only for people who can see the update).
create or replace function public.daily_comment_people(p_update uuid)
returns table (user_id uuid, first_name text, last_name text, email text)
language sql stable security definer
set search_path = ''
as $$
  select pr.id, pr.first_name, pr.last_name, pr.email::text
  from public.daily_updates d
  join lateral app.project_people(d.project_id) x on true
  join public.profiles pr on pr.id = x
  where d.id = p_update and app.can_view_project(d.project_id)
  order by pr.first_name, pr.last_name
$$;
revoke all on function public.daily_comment_people(uuid) from public, anon;
grant execute on function public.daily_comment_people(uuid) to authenticated;

-- A new comment: tell the update's author, earlier commenters and @mentioned people.
create or replace function app.daily_comment_added()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  d public.daily_updates%rowtype;
  p public.projects%rowtype;
  who text := app.person_name(new.author_id);
  link text;
  u uuid;
  told uuid[] := array[new.author_id];
begin
  select * into d from public.daily_updates where id = new.update_id;
  select * into p from public.projects where id = new.project_id;
  link := '/projects/' || p.id || '/diary?comments=' || d.id || '#update-' || d.id;

  -- @mentions first (only people on the project).
  for u in select distinct m from unnest(new.mentions) m where m in (select app.project_people(p.id)) loop
    if not u = any (told) then
      perform app.notify(u, 'mention', who || ' mentioned you on a daily update · ' || p.name, left(new.body, 200), link, p.id, null, new.author_id);
      told := told || u;
    end if;
  end loop;
  -- The update's author.
  if d.author_id is not null and not d.author_id = any (told) then
    perform app.notify(d.author_id, 'daily.comment', who || ' commented on your daily update · ' || p.name, left(new.body, 200), link, p.id, null, new.author_id);
    told := told || d.author_id;
  end if;
  -- Everyone who commented before (and can still see the project).
  for u in
    select distinct c.author_id from public.daily_update_comments c
    where c.update_id = d.id and c.id <> new.id and c.author_id is not null
      and c.author_id in (select app.project_people(p.id))
  loop
    if not u = any (told) then
      perform app.notify(u, 'daily.comment', who || ' also commented on a daily update · ' || p.name, left(new.body, 200), link, p.id, null, new.author_id);
      told := told || u;
    end if;
  end loop;
  return null;
end;
$$;
create trigger daily_update_comments_added after insert on public.daily_update_comments
  for each row execute function app.daily_comment_added();

-- Deleted comments are kept in the audit log.
create or replace function app.daily_comment_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.audit('deleted', 'daily_comment', old.id, old.project_id,
    'Comment on ' || coalesce(app.person_name((select author_id from public.daily_updates where id = old.update_id)), 'someone') || '''s daily update',
    jsonb_build_object('written_by', app.person_name(old.author_id), 'comment', left(old.body, 500)));
  return null;
end;
$$;
create trigger daily_update_comments_deleted after delete on public.daily_update_comments
  for each row execute function app.daily_comment_deleted();
