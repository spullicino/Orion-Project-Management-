-- =====================================================================
-- Orion Projects — 0014 Phone notifications for every chat message
--
-- Like WhatsApp: when someone writes in a chat, everyone who can read it gets a
-- phone notification. These don't go into the 🔔 list (chats have their own
-- unread badges). Not sent to: the writer, people who muted that chat, people
-- who switched off "New chat messages", or people @mentioned (they already get
-- a "mentioned you" notification).
-- =====================================================================

-- Waiting phone notifications. Internal: only the server (secret key) reads it.
create table public.push_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text not null,
  tag        text not null,          -- notifications with the same tag are grouped (one per chat)
  sender     text,
  created_at timestamptz not null default now(),
  pushed_at  timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where pushed_at is null;

alter table public.push_outbox enable row level security;
-- No policies: signed-in users can't read or write it. The server uses the secret key.
revoke all on public.push_outbox from public, anon, authenticated;
grant all on public.push_outbox to service_role;

create or replace function app.on_message_chat_push()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.channels%rowtype;
  who text;
  preview text;
  att record;
begin
  select * into c from public.channels where id = new.channel_id;
  if not found or c.archived or new.deleted_at is not null then
    return null;
  end if;

  who := app.person_name(new.author_id);
  preview := left(regexp_replace(new.body, '\s+', ' ', 'g'), 180);
  if preview = '' then
    -- Photo or file only. (This trigger runs at the end of the transaction, so attachments exist.)
    select a.mime_type, a.file_name into att from public.message_attachments a where a.message_id = new.id order by a.created_at limit 1;
    preview := case when att.mime_type like 'image/%' then '📷 Photo' when att.file_name is not null then '📎 ' || att.file_name else 'Sent a file' end;
  end if;

  insert into public.push_outbox (user_id, title, body, link, tag, sender)
  select pr.id,
         c.name,
         preview,
         '/chats/' || c.id,
         'chat-' || c.id,
         case when new.parent_id is not null then who || ' (reply)' else who end
  from public.profiles pr
  where pr.status = 'active'
    and pr.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not (pr.id = any (coalesce(new.mentions, '{}')))
    and case c.type
          when 'general' then true
          when 'management' then pr.role in ('admin', 'manager')
          when 'project' then pr.role in ('admin', 'manager')
                           or exists (select 1 from public.project_members m where m.project_id = c.project_id and m.user_id = pr.id)
        end
    and not exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = pr.id and cm.muted)
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = pr.id and (not np.push_enabled or (np.types ->> 'chat.message') = 'false')
    )
    and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id);
  return null;
end;
$$;

-- Deferred: runs when the message is committed, after its photos/files were saved.
drop trigger if exists messages_chat_push on public.messages;
create constraint trigger messages_chat_push after insert on public.messages
  deferrable initially deferred
  for each row execute function app.on_message_chat_push();

-- The server takes waiting notifications in batches (safe with several servers at once).
create or replace function public.claim_chat_push_batch(p_limit integer default 300)
returns setof public.push_outbox
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  delete from public.push_outbox where created_at < now() - interval '2 days';
  return query
  update public.push_outbox set pushed_at = now()
  where id in (
    select id from public.push_outbox
    where pushed_at is null and created_at > now() - interval '1 hour'
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning *;
end;
$$;
revoke all on function public.claim_chat_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_chat_push_batch(integer) to service_role;
revoke all on function app.on_message_chat_push() from public, anon;
