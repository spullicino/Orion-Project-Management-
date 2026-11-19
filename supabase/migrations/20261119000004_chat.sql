-- =====================================================================
-- Orion Projects — 0004 Chat: project, management and general channels
-- =====================================================================

create type public.channel_type as enum ('project', 'management', 'general');

create table public.channels (
  id          uuid primary key default gen_random_uuid(),
  type        public.channel_type not null,
  project_id  uuid unique references public.projects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  archived    boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((type = 'project') = (project_id is not null))
);

-- Per-user channel state: last read (for unread badges) and mute.
-- Access is NOT granted by this table; it is derived from the channel type.
create table public.channel_members (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  last_read_at timestamptz not null default now(),
  muted        boolean not null default false,
  primary key (channel_id, user_id)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  parent_id  uuid references public.messages (id) on delete cascade,   -- reply thread
  task_id    uuid references public.tasks (id) on delete set null,      -- task link chip
  body       text not null default '' check (char_length(body) <= 8000),
  mentions   uuid[] not null default '{}',
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index messages_parent_idx on public.messages (parent_id) where parent_id is not null;

create table public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  file_name    text not null check (char_length(file_name) <= 255),
  mime_type    text,
  size_bytes   bigint,
  width        integer,
  height       integer,
  created_at   timestamptz not null default now()
);
create index message_attachments_message_idx on public.message_attachments (message_id);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ---------------------------------------------------------------------
-- Channel permission helpers
-- ---------------------------------------------------------------------
create or replace function app.can_view_channel(p_channel uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case c.type
      when 'general'    then app.is_active()
      when 'management' then app.is_manager_or_above()
      when 'project'    then app.can_view_project(c.project_id)
    end
    from public.channels c where c.id = p_channel
  ), false)
$$;

create or replace function app.can_post_channel(p_channel uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case c.type
      when 'general'    then app.is_manager_or_above()       -- announcements
      when 'management' then app.is_manager_or_above()
      when 'project'    then app.can_edit_project(c.project_id)
        or (app.current_role() = 'basic'
            and app.is_project_member(c.project_id)
            and (select s.basic_can_post_chat from public.app_settings s where s.id))
    end
    from public.channels c where c.id = p_channel and not c.archived
  ), false)
$$;

create or replace function app.message_channel(p_message uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select channel_id from public.messages where id = p_message $$;

-- Every new project gets its own chat channel.
create or replace function app.create_project_channel()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not new.is_template then
    insert into public.channels (type, project_id, name, created_by)
    values ('project', new.id, new.name, auth.uid());
  end if;
  return new;
end;
$$;
create trigger projects_create_channel after insert on public.projects
  for each row execute function app.create_project_channel();

-- Keep project channel name in sync.
create or replace function app.rename_project_channel()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.channels set name = new.name where project_id = new.id;
  end if;
  return new;
end;
$$;
create trigger projects_rename_channel after update of name on public.projects
  for each row execute function app.rename_project_channel();

-- Default company-wide channels.
insert into public.channels (type, name, description) values
  ('general', 'General & Announcements', 'Company-wide news. Everyone can read; managers post.'),
  ('management', 'Management', 'Private channel for administrators and managers.');

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.channels            enable row level security;
alter table public.channel_members     enable row level security;
alter table public.messages            enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reactions   enable row level security;

create policy "channels: read if allowed" on public.channels
  for select to authenticated using (app.can_view_channel(id));
-- Managers+ create/edit management & general channels. Project channels are created by trigger.
create policy "channels: manager insert" on public.channels
  for insert to authenticated with check (app.is_manager_or_above() and type <> 'project');
create policy "channels: manager update" on public.channels
  for update to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());
create policy "channels: admin delete" on public.channels
  for delete to authenticated using (app.is_admin() and type <> 'project');

create policy "channel state: own" on public.channel_members
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app.can_view_channel(channel_id));

create policy "messages: read if channel visible" on public.messages
  for select to authenticated using (app.can_view_channel(channel_id));
create policy "messages: post if allowed" on public.messages
  for insert to authenticated with check (author_id = auth.uid() and app.can_post_channel(channel_id));
create policy "messages: author edits own" on public.messages
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid() and app.can_post_channel(channel_id));
create policy "messages: author or admin delete" on public.messages
  for delete to authenticated using (author_id = auth.uid() or app.is_admin());

create policy "msg attachments: read" on public.message_attachments
  for select to authenticated using (app.can_view_channel(app.message_channel(message_id)));
create policy "msg attachments: author insert" on public.message_attachments
  for insert to authenticated with check (
    exists (select 1 from public.messages m where m.id = message_id and m.author_id = auth.uid())
  );
create policy "msg attachments: author or admin delete" on public.message_attachments
  for delete to authenticated using (
    app.is_admin() or exists (select 1 from public.messages m where m.id = message_id and m.author_id = auth.uid())
  );

create policy "reactions: read" on public.message_reactions
  for select to authenticated using (app.can_view_channel(app.message_channel(message_id)));
create policy "reactions: add own if can post" on public.message_reactions
  for insert to authenticated with check (
    user_id = auth.uid() and app.can_post_channel(app.message_channel(message_id))
  );
create policy "reactions: remove own" on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Realtime (live chat). Guarded so the migration also runs on plain Postgres in tests.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.message_reactions;
  end if;
end $$;

grant execute on all functions in schema app to anon, authenticated, service_role;
