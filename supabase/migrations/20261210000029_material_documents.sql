-- =====================================================================
-- Orion Projects — 0029 Delivery documents and "received on site"
--
-- 1. Anyone on the project can attach the delivery note, invoice or another
--    document (photo or file) to a material request. Managers are told.
-- 2. The person receiving on site (technicians too) can mark a request as
--    received, with the quantities that came — Delivered, or Partly
--    delivered if something is short. Managers are told and can correct it.
-- Files live in project-files/<project_id>/materials/<request_id>/docs/…
-- =====================================================================

create table public.material_request_documents (
  id           uuid primary key,
  request_id   uuid not null references public.material_requests (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  kind         text not null default 'delivery_note' check (kind in ('delivery_note', 'invoice', 'other')),
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index material_documents_request_idx on public.material_request_documents (request_id, created_at);

alter table public.material_request_documents enable row level security;
create policy "material documents: read" on public.material_request_documents
  for select to authenticated using (app.can_view_project(project_id));
create policy "material documents: add" on public.material_request_documents
  for insert to authenticated with check (
    uploaded_by = auth.uid() and project_id = app.material_project(request_id) and app.can_edit_project(project_id)
  );
create policy "material documents: uploader or manager delete" on public.material_request_documents
  for delete to authenticated using (uploaded_by = auth.uid() or app.can_manage_project(project_id));
revoke all on public.material_request_documents from public, anon;
grant select, insert, delete on public.material_request_documents to authenticated;
grant all on public.material_request_documents to service_role;

alter table public.material_requests
  add column received_by uuid references public.profiles (id) on delete set null,
  add column received_at timestamptz;

-- The project's managers (or, if it has none, the administrators).
create or replace function app.material_handlers(p_project uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.user_id from public.project_members m join public.profiles pr on pr.id = m.user_id
  where m.project_id = p_project and pr.role in ('admin', 'manager') and pr.status = 'active'
  union
  select pr.id from public.profiles pr
  where pr.role = 'admin' and pr.status = 'active'
    and not exists (select 1 from public.project_members m join public.profiles x on x.id = m.user_id
                    where m.project_id = p_project and x.role in ('admin', 'manager'))
$$;

-- A document was added: note it in the request's history and tell the managers.
create or replace function app.material_document_added()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.material_requests%rowtype;
  label text := case new.kind when 'delivery_note' then 'a delivery note' when 'invoice' then 'an invoice' else 'a document' end;
  u uuid;
begin
  select * into r from public.material_requests where id = new.request_id;
  insert into public.material_request_events (request_id, actor_id, kind, detail) values (r.id, new.uploaded_by, 'document', label);
  for u in select app.material_handlers(r.project_id) union select r.requested_by loop
    perform app.notify(u, 'material.status',
      app.person_name(new.uploaded_by) || ' added ' || label || ' to material request #' || r.number || ' · ' || (select name from public.projects where id = r.project_id),
      new.file_name, '/projects/' || r.project_id || '/materials?request=' || r.id, r.project_id, null, new.uploaded_by);
  end loop;
  return null;
end;
$$;
create trigger material_documents_added after insert on public.material_request_documents
  for each row execute function app.material_document_added();

-- Received on site: anyone who can work on the project. p_deliveries = [{ item_id, delivered_qty }]
-- (items not listed keep what was already recorded). Delivered if everything has come.
create or replace function public.receive_material_request(p_id uuid, p_deliveries jsonb, p_note text default null)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.material_requests%rowtype;
  d record;
  all_in boolean;
  next_status text;
  u uuid;
begin
  select * into r from public.material_requests where id = p_id for update;
  if not found or not app.can_edit_project(r.project_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status not in ('requested', 'ordered', 'partly_delivered') then
    raise exception 'This request is already closed' using errcode = '22023';
  end if;
  if jsonb_typeof(p_deliveries) <> 'array' then
    raise exception 'Say how much arrived' using errcode = '22023';
  end if;

  for d in
    select (x ->> 'item_id')::uuid as item_id, greatest(0, (x ->> 'delivered_qty')::numeric) as qty
    from jsonb_array_elements(p_deliveries) x
  loop
    update public.material_request_items set delivered_qty = d.qty where id = d.item_id and request_id = p_id;
  end loop;

  select bool_and(delivered_qty >= quantity) into all_in from public.material_request_items where request_id = p_id;
  next_status := case when coalesce(all_in, false) then 'delivered' else 'partly_delivered' end;
  update public.material_requests
     set status = next_status, received_by = auth.uid(), received_at = now()
   where id = p_id;

  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into public.material_request_comments (request_id, author_id, body) values (p_id, auth.uid(), left(trim(p_note), 4000));
  end if;

  -- Managers hear it arrived (the requester is told by the usual status message).
  for u in select app.material_handlers(r.project_id) loop
    perform app.notify(u, 'material.status',
      'Received on site: material request #' || r.number || ' · ' || (select name from public.projects where id = r.project_id),
      app.person_name(auth.uid()) || case when next_status = 'delivered' then ' received everything.' else ' received part of it — some items are short.' end,
      '/projects/' || r.project_id || '/materials?request=' || r.id, r.project_id, null, auth.uid());
  end loop;
  return next_status;
end;
$$;
revoke all on function public.receive_material_request(uuid, jsonb, text) from public, anon;
grant execute on function public.receive_material_request(uuid, jsonb, text) to authenticated, service_role;
