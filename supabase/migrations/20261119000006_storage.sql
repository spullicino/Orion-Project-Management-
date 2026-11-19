-- =====================================================================
-- Orion Projects — 0006 Storage buckets (all PRIVATE) and access policies
-- Files are served to the browser via short-lived signed URLs.
--
-- Path conventions (first folder decides access):
--   avatars/<user_id>/<file>
--   project-files/<project_id>/tasks/<task_id>/<file>
--   project-files/<project_id>/daily/<daily_update_id>/<file>
--   chat-files/<channel_id>/<message_id>/<file>
--   branding/clients/<client_id>/<file>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',       'avatars',       false, 5242880,  array['image/jpeg','image/png','image/webp']),
  ('project-files', 'project-files', false, 26214400, null),
  ('chat-files',    'chat-files',    false, 26214400, null),
  ('branding',      'branding',      false, 2097152,  array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create or replace function app.try_uuid(p text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function app.path_folder(p_name text, p_index integer)
returns text
language sql immutable
set search_path = ''
as $$ select (string_to_array(p_name, '/'))[p_index] $$;

-- Avatars: any active user can view (signed URL); you manage only your own folder.
create policy "avatars: active read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (app.is_active() or app.path_folder(name, 1) = auth.uid()::text));
create policy "avatars: own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and app.path_folder(name, 1) = auth.uid()::text);
create policy "avatars: own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and app.path_folder(name, 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and app.path_folder(name, 1) = auth.uid()::text);
create policy "avatars: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and app.path_folder(name, 1) = auth.uid()::text);

-- Project files: same rules as the project itself.
create policy "project files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-files' and app.can_view_project(app.try_uuid(app.path_folder(name, 1))));
create policy "project files: editor upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-files' and app.can_edit_project(app.try_uuid(app.path_folder(name, 1))));
create policy "project files: uploader or manager delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files'
         and app.can_view_project(app.try_uuid(app.path_folder(name, 1)))
         and (owner_id = auth.uid()::text or app.is_manager_or_above()));

-- Chat files: channel rules.
create policy "chat files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and app.can_view_channel(app.try_uuid(app.path_folder(name, 1))));
create policy "chat files: poster upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and app.can_post_channel(app.try_uuid(app.path_folder(name, 1))));
create policy "chat files: uploader or admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-files' and (owner_id = auth.uid()::text or app.is_admin()));

-- Branding (client logos): active users read, managers+ write.
create policy "branding: active read" on storage.objects
  for select to authenticated using (bucket_id = 'branding' and app.is_active());
create policy "branding: manager insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding' and app.is_manager_or_above());
create policy "branding: manager update" on storage.objects
  for update to authenticated using (bucket_id = 'branding' and app.is_manager_or_above())
  with check (bucket_id = 'branding' and app.is_manager_or_above());
create policy "branding: manager delete" on storage.objects
  for delete to authenticated using (bucket_id = 'branding' and app.is_manager_or_above());

grant execute on all functions in schema app to anon, authenticated, service_role;
