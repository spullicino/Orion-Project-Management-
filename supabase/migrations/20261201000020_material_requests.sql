-- =====================================================================
-- Orion Projects — 0020 Material requests
--
-- Workers request materials for a project (items, quantities, needed-by date,
-- photos). The project's managers mark them Ordered (supplier, PO number,
-- expected date), Delivered or Partly delivered, or Rejected. Everyone involved
-- is notified along the way. Visible only to people on the project.
-- =====================================================================

create table public.material_requests (
  id            uuid primary key,                     -- chosen by the phone, so offline retries never duplicate
  project_id    uuid not null references public.projects (id) on delete cascade,
  number        integer not null,
  requested_by  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status        text not null default 'requested'
                check (status in ('requested', 'ordered', 'partly_delivered', 'delivered', 'rejected', 'cancelled')),
  needed_by     date,
  urgent        boolean not null default false,
  delivery_note text check (char_length(delivery_note) <= 1000),
  supplier      text check (char_length(supplier) <= 200),
  po_number     text check (char_length(po_number) <= 100),
  expected_date date,
  reject_reason text check (char_length(reject_reason) <= 500),
  copied_from   uuid references public.material_requests (id) on delete set null,
  ordered_at    timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, number)
);
create index material_requests_project_idx on public.material_requests (project_id, created_at desc);
create index material_requests_open_idx on public.material_requests (status, needed_by) where status in ('requested', 'ordered', 'partly_delivered');
create trigger material_requests_touch before update on public.material_requests
  for each row execute function app.touch_updated_at();

create table public.material_request_items (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.material_requests (id) on delete cascade,
  position      integer not null default 0,
  name          text not null check (char_length(name) between 1 and 200),
  quantity      numeric(12, 2) not null check (quantity > 0),
  unit          text not null default 'pcs' check (char_length(unit) between 1 and 20),
  note          text check (char_length(note) <= 300),
  delivered_qty numeric(12, 2) not null default 0 check (delivered_qty >= 0)
);
create index material_items_request_idx on public.material_request_items (request_id, position);

create table public.material_request_photos (
  id           uuid primary key,
  request_id   uuid not null references public.material_requests (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  width        integer,
  height       integer,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index material_photos_request_idx on public.material_request_photos (request_id);

create table public.material_request_comments (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index material_comments_request_idx on public.material_request_comments (request_id, created_at);

-- History (written by triggers only).
create table public.material_request_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index material_events_request_idx on public.material_request_events (request_id, created_at);

-- ---------------------------------------------------------------- helpers
create or replace function app.material_project(p_request uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select project_id from public.material_requests where id = p_request $$;

-- Who may change a request's items: the project's managers, or the requester while it's still "requested".
create or replace function app.can_edit_material_items(p_request uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.material_requests r
    where r.id = p_request
      and (app.can_manage_project(r.project_id)
           or (r.requested_by = auth.uid() and r.status = 'requested' and app.can_edit_project(r.project_id)))
  )
$$;

-- Per-project numbers (#1, #2 …) and the rules for who may change what.
-- Runs as the caller (not "security definer"), so app.is_service_role() tells the server apart from people.
create or replace function app.material_request_before()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(max(number), 0) + 1 into new.number from public.material_requests where project_id = new.project_id;
    new.status := 'requested';
    new.supplier := null; new.po_number := null; new.expected_date := null; new.reject_reason := null;
    new.ordered_at := null; new.delivered_at := null;
    return new;
  end if;

  new.id := old.id; new.project_id := old.project_id; new.number := old.number;
  new.requested_by := old.requested_by; new.created_at := old.created_at; new.copied_from := old.copied_from;
  if not app.is_service_role() and not app.can_manage_project(old.project_id) then
    -- The requester (not a manager): only while it's still "requested", and only their own details or cancelling.
    if old.status <> 'requested' then
      raise exception 'This request is already being handled — ask a manager to change it.' using errcode = '42501';
    end if;
    if new.status not in ('requested', 'cancelled') then
      raise exception 'Only managers can mark requests ordered, delivered or rejected.' using errcode = '42501';
    end if;
    new.supplier := old.supplier; new.po_number := old.po_number; new.expected_date := old.expected_date;
    new.reject_reason := old.reject_reason;
  end if;
  if new.status = 'ordered' and old.status <> 'ordered' then new.ordered_at := coalesce(new.ordered_at, now()); end if;
  if new.status = 'delivered' and old.status <> 'delivered' then new.delivered_at := now(); end if;
  if new.status <> 'rejected' then new.reject_reason := null; end if;
  return new;
end;
$$;
create trigger material_requests_before before insert or update on public.material_requests
  for each row execute function app.material_request_before();

-- Only managers record how much was delivered.
-- Runs as the caller (not "security definer"), so app.is_service_role() tells the server apart from people.
create or replace function app.material_item_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not app.is_service_role() and not app.can_manage_project(app.material_project(new.request_id)) then
    new.delivered_qty := case when tg_op = 'UPDATE' then old.delivered_qty else 0 end;
  end if;
  if tg_op = 'UPDATE' then new.request_id := old.request_id; end if;
  return new;
end;
$$;
create trigger material_items_guard before insert or update on public.material_request_items
  for each row execute function app.material_item_guard();

-- ---------------------------------------------------------------- RLS
alter table public.material_requests          enable row level security;
alter table public.material_request_items     enable row level security;
alter table public.material_request_photos    enable row level security;
alter table public.material_request_comments  enable row level security;
alter table public.material_request_events    enable row level security;

create policy "materials: read if project visible" on public.material_requests
  for select to authenticated using (app.can_view_project(project_id));
create policy "materials: editors request as themselves" on public.material_requests
  for insert to authenticated with check (requested_by = auth.uid() and app.can_edit_project(project_id));
create policy "materials: managers or requester update" on public.material_requests
  for update to authenticated
  using (app.can_manage_project(project_id) or (requested_by = auth.uid() and app.can_edit_project(project_id)))
  with check (app.can_manage_project(project_id) or (requested_by = auth.uid() and app.can_edit_project(project_id)));
create policy "materials: managers delete" on public.material_requests
  for delete to authenticated using (app.can_manage_project(project_id));

create policy "material items: read" on public.material_request_items
  for select to authenticated using (app.can_view_project(app.material_project(request_id)));
create policy "material items: write" on public.material_request_items
  for all to authenticated using (app.can_edit_material_items(request_id)) with check (app.can_edit_material_items(request_id));

create policy "material photos: read" on public.material_request_photos
  for select to authenticated using (app.can_view_project(project_id));
create policy "material photos: add" on public.material_request_photos
  for insert to authenticated with check (
    uploaded_by = auth.uid() and project_id = app.material_project(request_id) and app.can_edit_project(project_id)
  );
create policy "material photos: uploader or manager delete" on public.material_request_photos
  for delete to authenticated using (uploaded_by = auth.uid() or app.can_manage_project(project_id));

create policy "material comments: read" on public.material_request_comments
  for select to authenticated using (app.can_view_project(app.material_project(request_id)));
create policy "material comments: post" on public.material_request_comments
  for insert to authenticated with check (author_id = auth.uid() and app.can_edit_project(app.material_project(request_id)));
create policy "material comments: author or admin delete" on public.material_request_comments
  for delete to authenticated using (author_id = auth.uid() or app.is_admin());

create policy "material events: read" on public.material_request_events
  for select to authenticated using (app.can_view_project(app.material_project(request_id)));

grant select, insert, update, delete on public.material_requests, public.material_request_items,
  public.material_request_photos, public.material_request_comments to authenticated;
grant select on public.material_request_events to authenticated;
grant all on public.material_requests, public.material_request_items, public.material_request_photos,
  public.material_request_comments, public.material_request_events to service_role;

-- ---------------------------------------------------------------- notifications & history
create or replace function app.material_summary(p_request uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(i.name || ' ×' || trim(to_char(i.quantity, 'FM999999990.##')) || ' ' || i.unit, ', ' order by i.position)
           filter (where i.rn <= 3), '')
         || case when count(*) > 3 then ' (+' || (count(*) - 3) || ' more)' else '' end
  from (select it.*, row_number() over (order by it.position) as rn from public.material_request_items it where it.request_id = p_request) i
$$;

-- New request (at the end of the transaction, once its items exist) → the project's managers.
create or replace function app.on_material_request_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p public.projects%rowtype;
  who text := app.person_name(new.requested_by);
  link text := '/projects/' || new.project_id || '/materials?request=' || new.id;
  u uuid;
  title text;
begin
  select * into p from public.projects where id = new.project_id;
  title := case when new.urgent then '🚨 Urgent material request' else 'Material request' end
           || ' #' || new.number || ' from ' || who || ' · ' || p.name;
  insert into public.material_request_events (request_id, actor_id, kind) values (new.id, new.requested_by, 'created');
  for u in
    select m.user_id from public.project_members m join public.profiles pr on pr.id = m.user_id
    where m.project_id = new.project_id and pr.role in ('admin', 'manager')
    union
    -- Nobody to handle it on the project? Tell the administrators.
    select pr.id from public.profiles pr
    where pr.role = 'admin' and pr.status = 'active'
      and not exists (select 1 from public.project_members m join public.profiles x on x.id = m.user_id
                      where m.project_id = new.project_id and x.role in ('admin', 'manager'))
  loop
    perform app.notify(u, 'material.new', title,
      app.material_summary(new.id) || case when new.needed_by is not null then ' · needed by ' || to_char(new.needed_by, 'FMDD Mon') else '' end,
      link, new.project_id, null, new.requested_by);
  end loop;
  return null;
end;
$$;
create constraint trigger material_requests_created after insert on public.material_requests
  deferrable initially deferred
  for each row execute function app.on_material_request_created();

-- Status changes → history + the requester.
create or replace function app.on_material_request_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  link text := '/projects/' || new.project_id || '/materials?request=' || new.id;
  label text;
  body text;
begin
  if new.status = old.status then
    return null;
  end if;
  label := case new.status
    when 'ordered' then 'was ordered'
    when 'partly_delivered' then 'was partly delivered'
    when 'delivered' then 'was delivered'
    when 'rejected' then 'was rejected'
    when 'cancelled' then 'was cancelled'
    else 'was reopened' end;
  body := case new.status
    when 'ordered' then concat_ws(' · ', nullif(new.supplier, ''), case when new.expected_date is not null then 'expected ' || to_char(new.expected_date, 'FMDD Mon') end, case when new.po_number is not null then 'PO ' || new.po_number end)
    when 'rejected' then new.reject_reason
    else null end;
  insert into public.material_request_events (request_id, actor_id, kind, detail) values (new.id, auth.uid(), new.status, nullif(body, ''));
  perform app.notify(new.requested_by, 'material.status', 'Your material request #' || new.number || ' ' || label,
    coalesce(nullif(body, ''), app.material_summary(new.id)), link, new.project_id, null, auth.uid());
  return null;
end;
$$;
create trigger material_requests_status after update of status on public.material_requests
  for each row execute function app.on_material_request_status();

-- Comments → the requester and the project's managers (not the writer).
create or replace function app.on_material_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r public.material_requests%rowtype;
  u uuid;
begin
  select * into r from public.material_requests where id = new.request_id;
  for u in
    select r.requested_by
    union
    select m.user_id from public.project_members m join public.profiles pr on pr.id = m.user_id
    where m.project_id = r.project_id and pr.role in ('admin', 'manager')
  loop
    perform app.notify(u, 'material.comment', app.person_name(new.author_id) || ' commented on material request #' || r.number,
      left(new.body, 200), '/projects/' || r.project_id || '/materials?request=' || r.id, r.project_id, null, new.author_id);
  end loop;
  return null;
end;
$$;
create trigger material_comments_notify after insert on public.material_request_comments
  for each row execute function app.on_material_comment();

-- ---------------------------------------------------------------- functions for the app
-- Creates a request with its items in one go. Safe to repeat (the phone retries offline requests).
create or replace function public.create_material_request(
  p_id uuid, p_project uuid, p_needed_by date, p_urgent boolean, p_note text, p_items jsonb, p_copied_from uuid default null
)
returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  existing public.material_requests%rowtype;
  r public.material_requests%rowtype;
begin
  select * into existing from public.material_requests where id = p_id;
  if found then
    if existing.requested_by <> auth.uid() then
      raise exception 'This request could not be saved. Please try again.';
    end if;
    return jsonb_build_object('id', existing.id, 'number', existing.number, 'project_id', existing.project_id);
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A request can have up to 100 items';
  end if;

  insert into public.material_requests (id, project_id, requested_by, needed_by, urgent, delivery_note, copied_from)
  values (p_id, p_project, auth.uid(), p_needed_by, coalesce(p_urgent, false), nullif(trim(p_note), ''), p_copied_from)
  returning * into r;

  insert into public.material_request_items (request_id, position, name, quantity, unit, note)
  select r.id, x.ord::integer, trim(x.v->>'name'), (x.v->>'quantity')::numeric, coalesce(nullif(trim(x.v->>'unit'), ''), 'pcs'), nullif(trim(x.v->>'note'), '')
  from jsonb_array_elements(p_items) with ordinality as x(v, ord);

  return jsonb_build_object('id', r.id, 'number', r.number, 'project_id', r.project_id);
end;
$$;

-- List of requests: one project, or every project you can see.
create or replace function public.get_material_requests(p_project uuid default null, p_open_only boolean default false)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by (x->>'sort_group')::int, x->>'sort_date', (x->>'number')::int desc), '[]')
  from (
    select jsonb_build_object(
      'id', r.id, 'number', r.number, 'status', r.status, 'needed_by', r.needed_by, 'urgent', r.urgent,
      'supplier', r.supplier, 'po_number', r.po_number, 'expected_date', r.expected_date,
      'created_at', r.created_at, 'updated_at', r.updated_at, 'delivered_at', r.delivered_at,
      'project', jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color),
      'requested_by', jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name),
      'item_count', (select count(*) from public.material_request_items i where i.request_id = r.id),
      'summary', app.material_summary(r.id),
      'photo_count', (select count(*) from public.material_request_photos f where f.request_id = r.id),
      'comment_count', (select count(*) from public.material_request_comments c where c.request_id = r.id),
      'late', r.status in ('requested', 'ordered', 'partly_delivered') and r.needed_by is not null and r.needed_by < public.malta_today(),
      'sort_group', case when r.status in ('requested', 'ordered', 'partly_delivered') then 0 else 1 end,
      'sort_date', case when r.status in ('requested', 'ordered', 'partly_delivered') then coalesce(r.needed_by::text, '9999') else to_char(9999999999 - extract(epoch from r.updated_at), 'FM0000000000') end
    ) as x
    from public.material_requests r
    join public.projects p on p.id = r.project_id
    left join public.profiles pr on pr.id = r.requested_by
    where (p_project is null or r.project_id = p_project)
      and (not p_open_only or r.status in ('requested', 'ordered', 'partly_delivered'))
    order by r.created_at desc
    limit 500
  ) s
$$;

-- One request with everything: items, photos, comments and history.
create or replace function public.get_material_request(p_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select to_jsonb(r) || jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color, 'code', p.code,
                 'client', (select c.name from public.clients c where c.id = p.client_id)),
    'requester', (select jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name, 'phone', pr.phone, 'email', pr.email) from public.profiles pr where pr.id = r.requested_by),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.material_request_items i where i.request_id = r.id), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'width', f.width, 'height', f.height) order by f.created_at) from public.material_request_photos f where f.request_id = r.id), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'author_id', c.author_id,
                   'author', (select jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name) from public.profiles a where a.id = c.author_id)) order by c.created_at)
                 from public.material_request_comments c where c.request_id = r.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'detail', e.detail, 'created_at', e.created_at,
                   'actor', (select jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name) from public.profiles a where a.id = e.actor_id)) order by e.created_at)
                 from public.material_request_events e where e.request_id = r.id), '[]')
  )
  from public.material_requests r
  join public.projects p on p.id = r.project_id
  where r.id = p_id
$$;

-- Everything delivered to a project so far, added up per material.
create or replace function public.get_project_materials(p_project uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]')
  from (
    select jsonb_build_object(
      'name', min(i.name), 'unit', i.unit,
      'delivered', sum(i.delivered_qty),
      'requested', sum(i.quantity),
      'last_delivered', max(coalesce(r.delivered_at, r.updated_at)),
      'requests', jsonb_agg(distinct r.number)
    ) as x
    from public.material_request_items i
    join public.material_requests r on r.id = i.request_id
    where r.project_id = p_project and i.delivered_qty > 0
    group by lower(trim(i.name)), i.unit
  ) s
$$;

revoke all on function public.create_material_request(uuid, uuid, date, boolean, text, jsonb, uuid) from public, anon;
revoke all on function public.get_material_requests(uuid, boolean) from public, anon;
revoke all on function public.get_material_request(uuid) from public, anon;
revoke all on function public.get_project_materials(uuid) from public, anon;
grant execute on function public.create_material_request(uuid, uuid, date, boolean, text, jsonb, uuid) to authenticated;
grant execute on function public.get_material_requests(uuid, boolean) to authenticated;
grant execute on function public.get_material_request(uuid) to authenticated;
grant execute on function public.get_project_materials(uuid) to authenticated;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------- daily reminder
create or replace function public.create_due_notifications()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := public.malta_today();
  r record;
  n integer := 0;
  kind text;
  v_title text;
begin
  for r in
    select t.id, t.title, t.project_id, t.due_date, a.user_id
    from public.tasks t
    join public.task_assignees a on a.task_id = t.id
    join public.projects p on p.id = t.project_id
    where t.completed_at is null and p.status = 'active' and not p.is_template
      and t.due_date is not null and t.due_date <= today + 1
      and t.due_date >= today - 1
  loop
    kind := case when r.due_date < today then 'task.overdue' else 'task.due_soon' end;
    v_title := case when r.due_date < today then 'Overdue: ' when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.task_id = r.id and x.type = kind and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, kind, v_title, null, '/projects/' || r.project_id || '/board?task=' || r.id, r.project_id, r.id, null);
      n := n + 1;
    end if;
  end loop;

  -- Personal to-dos (the notification text is only ever sent to the owner).
  for r in
    select pt.id, pt.title, pt.due_date, pt.user_id
    from public.personal_todos pt
    where pt.done_at is null and pt.due_date is not null and pt.due_date between today and today + 1
  loop
    v_title := case when r.due_date = today then 'Due today: ' else 'Due tomorrow: ' end || r.title;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.type = 'personal.due' and x.title = left(v_title, 200) and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, 'personal.due', v_title, 'Personal to-do', '/personal', null, null, null);
      n := n + 1;
    end if;
  end loop;

  -- Materials needed today or tomorrow that nobody has ordered yet → the project's managers.
  for r in
    select mr.id, mr.number, mr.project_id, mr.needed_by, p.name as project_name, m.user_id
    from public.material_requests mr
    join public.projects p on p.id = mr.project_id
    join public.project_members m on m.project_id = mr.project_id
    join public.profiles pr on pr.id = m.user_id and pr.role in ('admin', 'manager')
    where mr.status = 'requested' and mr.needed_by between today and today + 1
  loop
    v_title := 'Material needed ' || case when r.needed_by = today then 'today' else 'tomorrow' end
               || ', not ordered yet: #' || r.number || ' · ' || r.project_name;
    if not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.type = 'material.status' and x.title = left(v_title, 200) and x.created_at > now() - interval '20 hours'
    ) then
      perform app.notify(r.user_id, 'material.status', v_title, null, '/projects/' || r.project_id || '/materials?request=' || r.id, r.project_id, null, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.create_due_notifications() from public, anon, authenticated;
grant execute on function public.create_due_notifications() to service_role;
