-- =====================================================================
-- Orion Projects — 0019 Photos & files of a chat
--
-- Every photo or file shared in a chat, newest first (like WhatsApp's "Media
-- and docs"). Runs as the caller, so chat permissions apply: you only get
-- media from chats you can read. Deleted messages are left out.
-- =====================================================================

create or replace function public.get_channel_media(
  p_channel uuid,
  p_kind text default 'photos',      -- 'photos' or 'files'
  p_before timestamptz default null,
  p_limit integer default 60
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc, x->>'id' desc), '[]')
  from (
    select jsonb_build_object(
      'id', a.id, 'message_id', m.id, 'parent_id', m.parent_id,
      'storage_path', a.storage_path, 'file_name', a.file_name, 'mime_type', a.mime_type,
      'size_bytes', a.size_bytes, 'width', a.width, 'height', a.height,
      'created_at', m.created_at,
      'author', (select jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name) from public.profiles pr where pr.id = m.author_id)
    ) as x
    from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where m.channel_id = p_channel
      and m.deleted_at is null
      and (p_before is null or m.created_at < p_before)
      -- Same rule as the app: photos are the compressed JPEGs it creates (with a size); everything else is a file.
      and case when p_kind = 'files' then not (a.mime_type = 'image/jpeg' and a.width is not null)
               else (a.mime_type = 'image/jpeg' and a.width is not null) end
    order by m.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) s
$$;
revoke all on function public.get_channel_media(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.get_channel_media(uuid, text, timestamptz, integer) to authenticated;
