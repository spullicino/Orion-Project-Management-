-- =====================================================================
-- Orion Projects — 0011 Phase 5: chat reading functions & unread counts
--
-- Channel access rules already exist (0004): who can see/post is decided by
-- app.can_view_channel / app.can_post_channel. These functions run as the
-- caller (SECURITY INVOKER), so they only ever return what RLS allows.
-- Unread = messages from other people after the user's last_read_at
-- (or after they joined, if they never opened the channel).
-- =====================================================================

create index if not exists messages_channel_top_idx on public.messages (channel_id, created_at desc) where parent_id is null;

create or replace function app.my_last_read(p_channel uuid)
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select cm.last_read_at from public.channel_members cm where cm.channel_id = p_channel and cm.user_id = auth.uid()),
    (select coalesce(pr.approved_at, pr.created_at) from public.profiles pr where pr.id = auth.uid())
  )
$$;

-- Channels I can see, with last message preview, unread count and whether I may post.
create or replace function public.list_my_channels()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item order by (item->>'sort_key') desc), '[]')
  from (
    select jsonb_build_object(
      'id', c.id, 'type', c.type, 'name', c.name, 'description', c.description, 'project_id', c.project_id,
      'archived', c.archived,
      'project_color', (select p.color from public.projects p where p.id = c.project_id),
      'can_post', app.can_post_channel(c.id),
      'muted', coalesce((select cm.muted from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()), false),
      'unread', (select count(*) from public.messages m
                 where m.channel_id = c.id and m.author_id <> auth.uid() and m.deleted_at is null
                   and m.created_at > app.my_last_read(c.id)),
      'last', (select jsonb_build_object('body', left(m.body, 140), 'created_at', m.created_at, 'deleted', m.deleted_at is not null,
                                         'has_attachments', exists (select 1 from public.message_attachments a where a.message_id = m.id),
                                         'author', trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')))
               from public.messages m left join public.profiles pr on pr.id = m.author_id
               where m.channel_id = c.id order by m.created_at desc limit 1),
      'sort_key', coalesce((select max(m.created_at) from public.messages m where m.channel_id = c.id), c.created_at)
    ) as item
    from public.channels c
    where not c.archived
  ) x
$$;

-- Total unread for the badge on the Chats tab (muted channels don't count).
create or replace function public.get_unread_total()
returns integer
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(sum((
    select count(*) from public.messages m
    where m.channel_id = c.id and m.author_id <> auth.uid() and m.deleted_at is null
      and m.created_at > app.my_last_read(c.id)
  )), 0)::integer
  from public.channels c
  where not c.archived
    and not coalesce((select cm.muted from public.channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid()), false)
$$;

-- One message as the app shows it (author, attachments, reactions, reply count, linked task).
create or replace function app.message_json(m public.messages)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'channel_id', m.channel_id, 'author_id', m.author_id, 'parent_id', m.parent_id,
    'body', case when m.deleted_at is null then m.body else '' end,
    'mentions', m.mentions, 'created_at', m.created_at, 'edited_at', m.edited_at, 'deleted', m.deleted_at is not null,
    'author', (select jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url)
               from public.profiles pr where pr.id = m.author_id),
    'attachments', case when m.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path, 'file_name', a.file_name, 'mime_type', a.mime_type,
                                          'size_bytes', a.size_bytes, 'width', a.width, 'height', a.height) order by a.created_at)
      from public.message_attachments a where a.message_id = m.id), '[]') end,
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine, 'names', r.names) order by r.first_at)
      from (
        select mr.emoji, count(*) as n, bool_or(mr.user_id = auth.uid()) as mine, min(mr.created_at) as first_at,
               jsonb_agg(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))) as names
        from public.message_reactions mr left join public.profiles pr on pr.id = mr.user_id
        where mr.message_id = m.id group by mr.emoji
      ) r), '[]'),
    'reply_count', (select count(*) from public.messages rp where rp.parent_id = m.id and rp.deleted_at is null),
    'last_reply_at', (select max(rp.created_at) from public.messages rp where rp.parent_id = m.id),
    'task', (select jsonb_build_object('id', t.id, 'title', t.title, 'project_id', t.project_id, 'completed', t.completed_at is not null)
             from public.tasks t where t.id = m.task_id)
  )
$$;

-- Top-level messages of a channel, newest page first (returned oldest → newest).
create or replace function public.get_channel_messages(p_channel uuid, p_before timestamptz default null, p_limit integer default 40)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.message_json(m) order by m.created_at), '[]')
  from (
    select * from public.messages
    where channel_id = p_channel and parent_id is null
      and (p_before is null or created_at < p_before)
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) m
$$;

-- Messages newer than a moment (live updates catch-up), including replies.
create or replace function public.get_channel_messages_since(p_channel uuid, p_since timestamptz)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.message_json(m) order by m.created_at), '[]')
  from public.messages m
  where m.channel_id = p_channel and m.created_at > p_since
  limit 200
$$;

-- A single message (after an edit, delete or reaction).
create or replace function public.get_message(p_message uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select app.message_json(m) from public.messages m where m.id = p_message
$$;

-- A thread: the parent message and all its replies.
create or replace function public.get_thread(p_parent uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'parent', (select app.message_json(m) from public.messages m where m.id = p_parent),
    'replies', coalesce((select jsonb_agg(app.message_json(m) order by m.created_at) from public.messages m where m.parent_id = p_parent), '[]')
  )
  where exists (select 1 from public.messages m where m.id = p_parent)
$$;

-- People who can read a channel (for @mentions).
create or replace function public.get_channel_people(p_channel uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare c public.channels%rowtype;
begin
  select * into c from public.channels where id = p_channel;
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email, 'avatar_url', pr.avatar_url)
                     order by pr.first_name, pr.last_name)
    from public.profiles pr
    where pr.status = 'active'
      and case c.type
            when 'general' then true
            when 'management' then pr.role in ('admin', 'manager')
            when 'project' then pr.role in ('admin', 'manager')
                             or exists (select 1 from public.project_members m where m.project_id = c.project_id and m.user_id = pr.id)
          end
  ), '[]');
end;
$$;

-- Sends a message and its attachments in ONE transaction (others never see a
-- photo message without its photos). Runs as the caller: RLS checks that they
-- may post in the channel and that the attachments belong to their message.
create or replace function public.send_chat_message(
  p_id uuid,
  p_channel uuid,
  p_body text,
  p_parent uuid default null,
  p_task uuid default null,
  p_mentions uuid[] default '{}',
  p_attachments jsonb default '[]'
)
returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  m public.messages%rowtype;
  bad integer;
begin
  if coalesce(trim(p_body), '') = '' and jsonb_array_length(coalesce(p_attachments, '[]')) = 0 then
    raise exception 'Write a message or add a file';
  end if;
  if p_parent is not null and not exists (select 1 from public.messages x where x.id = p_parent and x.channel_id = p_channel and x.parent_id is null) then
    raise exception 'You can only reply to a message in the same chat';
  end if;
  select count(*) into bad from jsonb_array_elements(coalesce(p_attachments, '[]')) a
  where (a->>'storage_path') not like p_channel::text || '/' || p_id::text || '/%';
  if bad > 0 then
    raise exception 'Invalid attachment';
  end if;

  insert into public.messages (id, channel_id, author_id, parent_id, task_id, body, mentions)
  values (p_id, p_channel, auth.uid(), p_parent, p_task, coalesce(trim(p_body), ''), coalesce(p_mentions, '{}'))
  returning * into m;

  insert into public.message_attachments (id, message_id, storage_path, file_name, mime_type, size_bytes, width, height)
  select x.id, m.id, x.storage_path, left(x.file_name, 255), x.mime_type, x.size_bytes, x.width, x.height
  from jsonb_to_recordset(coalesce(p_attachments, '[]'))
    as x(id uuid, storage_path text, file_name text, mime_type text, size_bytes bigint, width integer, height integer);

  return app.message_json(m);
end;
$$;

-- Mark a channel as read now.
create or replace function public.mark_channel_read(p_channel uuid)
returns void
language sql volatile security invoker
set search_path = ''
as $$
  insert into public.channel_members (channel_id, user_id, last_read_at)
  values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'list_my_channels()', 'get_unread_total()', 'get_channel_messages(uuid, timestamptz, integer)',
    'get_channel_messages_since(uuid, timestamptz)', 'get_message(uuid)', 'get_thread(uuid)',
    'get_channel_people(uuid)', 'mark_channel_read(uuid)',
    'send_chat_message(uuid, uuid, text, uuid, uuid, uuid[], jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- Live updates for edits and attachments too (messages & reactions were added in 0004).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'message_reactions', 'message_attachments'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
