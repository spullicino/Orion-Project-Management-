-- =====================================================================
-- Orion Projects — 0033 Modules + Aftersales (stage 1)
--
-- 1. Modules: parts of the app that only chosen people can use. An
--    administrator gives each person "Agent" or "Manager" access per module
--    (administrators always have it). The first module is Aftersales.
-- 2. Aftersales: customers (with contacts and sites/installations, which
--    don't need to exist elsewhere in the app), tickets TKT-1001 …, the
--    conversation on each ticket (customer messages, replies, internal
--    notes and an automatic history), and files.
--    Emails from support@ (stage 2), response targets (stage 3) and the
--    client portal (stage 4) build on these tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------
create table public.module_access (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  module     text not null check (module in ('aftersales')),
  level      text not null check (level in ('agent', 'manager')),
  granted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (user_id, module)
);

-- 'manager', 'agent' or null (no access). Administrators are always managers.
create or replace function app.module_level(p_module text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when app.is_admin() then 'manager'
    when not app.is_active() then null
    else (select a.level from public.module_access a where a.user_id = auth.uid() and a.module = p_module)
  end
$$;
create or replace function app.has_module(p_module text)
returns boolean
language sql stable
set search_path = ''
as $$ select app.module_level(p_module) is not null $$;
create or replace function app.is_module_manager(p_module text)
returns boolean
language sql stable
set search_path = ''
as $$ select app.module_level(p_module) = 'manager' $$;

-- Everyone active who can use a module (optionally managers only).
create or replace function app.module_people(p_module text, p_managers_only boolean default false)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select pr.id from public.profiles pr where pr.status = 'active' and pr.role = 'admin'
  union
  select a.user_id from public.module_access a join public.profiles pr on pr.id = a.user_id
  where a.module = p_module and pr.status = 'active' and (not p_managers_only or a.level = 'manager')
$$;

-- People who use a module, for "assign to" lists (only for people who use it themselves).
create or replace function public.module_members(p_module text)
returns table (user_id uuid, first_name text, last_name text, email text, level text)
language sql stable security definer
set search_path = ''
as $$
  select pr.id, pr.first_name, pr.last_name, pr.email::text, case when pr.role = 'admin' then 'manager' else a.level end
  from public.profiles pr
  left join public.module_access a on a.user_id = pr.id and a.module = p_module
  where app.has_module(p_module) and pr.status = 'active' and (pr.role = 'admin' or a.level is not null)
  order by pr.first_name, pr.last_name
$$;
revoke all on function public.module_members(text) from public, anon;
grant execute on function public.module_members(text) to authenticated;

alter table public.module_access enable row level security;
create policy "module access: own or admins read" on public.module_access
  for select to authenticated using (user_id = auth.uid() or app.is_admin());
create policy "module access: admins add" on public.module_access
  for insert to authenticated with check (app.is_admin());
create policy "module access: admins change" on public.module_access
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy "module access: admins remove" on public.module_access
  for delete to authenticated using (app.is_admin());
revoke all on public.module_access from public, anon;
grant select, insert, update, delete on public.module_access to authenticated;
grant all on public.module_access to service_role;

-- ---------------------------------------------------------------------
-- Aftersales: customers, contacts, sites, categories
-- ---------------------------------------------------------------------
create table public.as_customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 160),
  kind       text not null default 'company' check (kind in ('company', 'person')),
  phone      text check (char_length(phone) <= 40),
  address    text check (char_length(address) <= 300),
  notes      text check (char_length(notes) <= 4000),
  client_id  uuid references public.clients (id) on delete set null, -- optional link to Clients in the app
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index as_customers_name_idx on public.as_customers (lower(name));
create trigger as_customers_touch before update on public.as_customers
  for each row execute function app.touch_updated_at();

create table public.as_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.as_customers (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 160),
  email       extensions.citext unique check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone       text check (char_length(phone) <= 40),
  created_at  timestamptz not null default now()
);
create index as_contacts_customer_idx on public.as_contacts (customer_id);

create table public.as_sites (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.as_customers (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 160),
  address       text check (char_length(address) <= 300),
  handover_date date,
  warranty_end  date,
  project_id    uuid references public.projects (id) on delete set null, -- optional link to a project in the app
  notes         text check (char_length(notes) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index as_sites_customer_idx on public.as_sites (customer_id);
create trigger as_sites_touch before update on public.as_sites
  for each row execute function app.touch_updated_at();

create table public.as_categories (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique check (char_length(trim(name)) between 1 and 60),
  position integer not null default 0,
  active   boolean not null default true
);
insert into public.as_categories (name, position) values
  ('Fire Alarm', 1), ('CCTV', 2), ('Access Control', 3), ('Sound System', 4), ('Intercom', 5),
  ('Plumbing', 6), ('Electrical', 7), ('Air Conditioning', 8), ('Ventilation', 9), ('Automation', 10);

-- ---------------------------------------------------------------------
-- Tickets, conversation and files
-- ---------------------------------------------------------------------
create sequence public.as_ticket_number_seq start 1001;

create table public.as_tickets (
  id                uuid primary key default gen_random_uuid(),
  number            integer not null unique default nextval('public.as_ticket_number_seq'),
  subject           text not null check (char_length(trim(subject)) between 1 and 300),
  status            text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed')),
  priority          text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  category_id       uuid references public.as_categories (id) on delete set null,
  customer_id       uuid references public.as_customers (id) on delete set null,
  contact_id        uuid references public.as_contacts (id) on delete set null,
  site_id           uuid references public.as_sites (id) on delete set null,
  assigned_to       uuid references public.profiles (id) on delete set null,
  source            text not null default 'staff' check (source in ('email', 'portal', 'staff')),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  first_response_at timestamptz,
  last_customer_at  timestamptz,
  last_staff_at     timestamptz,
  resolved_at       timestamptz,
  closed_at         timestamptz
);
alter sequence public.as_ticket_number_seq owned by public.as_tickets.number;
create index as_tickets_status_idx on public.as_tickets (status, created_at desc);
create index as_tickets_customer_idx on public.as_tickets (customer_id);
create index as_tickets_assigned_idx on public.as_tickets (assigned_to) where status not in ('resolved', 'closed');

create table public.as_messages (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.as_tickets (id) on delete cascade,
  -- customer: from the customer (email, portal, or logged by staff, e.g. a phone call)
  -- reply: our answer to the customer · note: internal, never shown to the customer
  -- event: history written by the app (status, assignment…)
  kind             text not null check (kind in ('customer', 'reply', 'note', 'event')),
  author_id        uuid references public.profiles (id) on delete set null default auth.uid(),
  from_name        text check (char_length(from_name) <= 160),
  from_email       extensions.citext check (char_length(from_email) <= 254),
  body             text not null check (char_length(body) between 1 and 100000),
  email_message_id text check (char_length(email_message_id) <= 1000), -- stage 2
  email_status     text check (email_status in ('pending', 'sent', 'failed')), -- stage 2
  created_at       timestamptz not null default now()
);
create index as_messages_ticket_idx on public.as_messages (ticket_id, created_at);

create table public.as_files (
  id           uuid primary key,
  ticket_id    uuid not null references public.as_tickets (id) on delete cascade,
  message_id   uuid references public.as_messages (id) on delete set null,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index as_files_ticket_idx on public.as_files (ticket_id, created_at);

-- ---------------------------------------------------------------------
-- Ticket rules: status follows assignment, timestamps, history, alerts
-- ---------------------------------------------------------------------
create or replace function app.as_ticket_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Tickets can only be given to people who use Aftersales.
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from app.module_people('aftersales') x where x = new.assigned_to) then
    raise exception 'That person can''t use Aftersales — give them access in Admin → Modules first' using errcode = '22023';
  end if;
  -- Giving a new ticket to someone makes it Assigned; taking it away puts it back to New.
  if new.assigned_to is not null and new.status = 'new' then new.status := 'assigned'; end if;
  if new.assigned_to is null and new.status = 'assigned' then new.status := 'new'; end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then new.resolved_at := now(); end if;
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then new.closed_at := now(); end if;
  if new.status not in ('resolved', 'closed') then new.resolved_at := null; new.closed_at := null; end if;
  if new.status = 'resolved' then new.closed_at := null; end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;
create trigger as_tickets_before before insert or update on public.as_tickets
  for each row execute function app.as_ticket_before();

create or replace function app.as_status_label(s text)
returns text
language sql immutable
set search_path = ''
as $$
  select case s when 'new' then 'New' when 'assigned' then 'Assigned' when 'in_progress' then 'In progress'
    when 'waiting' then 'Waiting for customer' when 'resolved' then 'Resolved' when 'closed' then 'Closed' else s end
$$;

create or replace function app.as_ticket_after()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  ref text := 'TKT-' || new.number;
  link text := '/aftersales/tickets/' || new.number;
  u uuid;
  d jsonb;
begin
  if tg_op = 'INSERT' then
    perform app.audit('created', 'ticket', new.id, null, ref || ' · ' || new.subject);
    insert into public.as_messages (ticket_id, kind, author_id, body)
    values (new.id, 'event', auth.uid(), 'Ticket opened' || case new.source when 'email' then ' from an email' when 'portal' then ' from the portal' else '' end);
    if new.assigned_to is not null then
      if new.assigned_to is distinct from auth.uid() then
        perform app.notify(new.assigned_to, 'ticket.assigned', ref || ' was given to you', new.subject, link);
      end if;
    else
      -- Nobody has it yet: tell the module's managers.
      for u in select app.module_people('aftersales', true) loop
        if u is distinct from auth.uid() then
          perform app.notify(u, 'ticket.new', 'New ticket ' || ref, new.subject, link);
        end if;
      end loop;
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.as_messages (ticket_id, kind, author_id, body)
    values (new.id, 'event', auth.uid(), 'Status: ' || app.as_status_label(old.status) || ' → ' || app.as_status_label(new.status));
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.as_messages (ticket_id, kind, author_id, body)
    values (new.id, 'event', auth.uid(), case when new.assigned_to is null then 'No longer assigned' else 'Assigned to ' || app.person_name(new.assigned_to) end);
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      perform app.notify(new.assigned_to, 'ticket.assigned', ref || ' was given to you', new.subject, link);
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into public.as_messages (ticket_id, kind, author_id, body)
    values (new.id, 'event', auth.uid(), 'Priority: ' || initcap(old.priority) || ' → ' || initcap(new.priority));
  end if;
  d := app.diff(to_jsonb(old), to_jsonb(new), array['subject', 'status', 'priority', 'assigned_to', 'category_id', 'customer_id', 'site_id']);
  if d <> '{}'::jsonb then
    if d ? 'assigned_to' then
      d := d || jsonb_build_object('assigned_to', jsonb_build_array(app.person_name(old.assigned_to), app.person_name(new.assigned_to)));
    end if;
    perform app.audit('updated', 'ticket', new.id, null, ref || ' · ' || new.subject, d - 'category_id' - 'customer_id' - 'site_id');
  end if;
  return null;
end;
$$;
create trigger as_tickets_after after insert or update on public.as_tickets
  for each row execute function app.as_ticket_after();

create or replace function app.as_ticket_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.audit('deleted', 'ticket', old.id, null, 'TKT-' || old.number || ' · ' || old.subject);
  return null;
end;
$$;
create trigger as_tickets_deleted after delete on public.as_tickets
  for each row execute function app.as_ticket_deleted();

-- A message: keeps the ticket's "last heard" times, and moves the status along.
create or replace function app.as_message_added()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t public.as_tickets%rowtype;
begin
  if new.kind = 'event' then return null; end if;
  select * into t from public.as_tickets where id = new.ticket_id;
  if new.kind = 'reply' then
    update public.as_tickets
       set first_response_at = coalesce(first_response_at, new.created_at), last_staff_at = new.created_at,
           status = case when status in ('new', 'assigned') then 'in_progress' else status end
     where id = new.ticket_id;
  elsif new.kind = 'customer' then
    update public.as_tickets
       set last_customer_at = new.created_at,
           status = case when status in ('waiting', 'resolved', 'closed') then 'in_progress' else status end
     where id = new.ticket_id;
    -- Tell whoever has it (or the managers, if nobody does).
    if t.assigned_to is not null then
      if t.assigned_to is distinct from auth.uid() then
        perform app.notify(t.assigned_to, 'ticket.customer', 'TKT-' || t.number || ': the customer wrote', left(new.body, 200), '/aftersales/tickets/' || t.number);
      end if;
    end if;
  else
    update public.as_tickets set updated_at = now() where id = new.ticket_id;
  end if;
  return null;
end;
$$;
create trigger as_messages_added after insert on public.as_messages
  for each row execute function app.as_message_added();

-- ---------------------------------------------------------------------
-- Permissions: only people with the Aftersales module.
-- Agents work on everything; managers also delete and change categories.
-- ---------------------------------------------------------------------
alter table public.as_customers  enable row level security;
alter table public.as_contacts   enable row level security;
alter table public.as_sites      enable row level security;
alter table public.as_categories enable row level security;
alter table public.as_tickets    enable row level security;
alter table public.as_messages   enable row level security;
alter table public.as_files      enable row level security;

create policy "as customers: module read"   on public.as_customers for select to authenticated using (app.has_module('aftersales'));
create policy "as customers: module add"    on public.as_customers for insert to authenticated with check (app.has_module('aftersales'));
create policy "as customers: module edit"   on public.as_customers for update to authenticated using (app.has_module('aftersales')) with check (app.has_module('aftersales'));
create policy "as customers: manager delete" on public.as_customers for delete to authenticated using (app.is_module_manager('aftersales'));

create policy "as contacts: module read"   on public.as_contacts for select to authenticated using (app.has_module('aftersales'));
create policy "as contacts: module add"    on public.as_contacts for insert to authenticated with check (app.has_module('aftersales'));
create policy "as contacts: module edit"   on public.as_contacts for update to authenticated using (app.has_module('aftersales')) with check (app.has_module('aftersales'));
create policy "as contacts: module delete" on public.as_contacts for delete to authenticated using (app.has_module('aftersales'));

create policy "as sites: module read"    on public.as_sites for select to authenticated using (app.has_module('aftersales'));
create policy "as sites: module add"     on public.as_sites for insert to authenticated with check (app.has_module('aftersales'));
create policy "as sites: module edit"    on public.as_sites for update to authenticated using (app.has_module('aftersales')) with check (app.has_module('aftersales'));
create policy "as sites: manager delete" on public.as_sites for delete to authenticated using (app.is_module_manager('aftersales'));

create policy "as categories: module read"    on public.as_categories for select to authenticated using (app.has_module('aftersales'));
create policy "as categories: manager add"    on public.as_categories for insert to authenticated with check (app.is_module_manager('aftersales'));
create policy "as categories: manager edit"   on public.as_categories for update to authenticated using (app.is_module_manager('aftersales')) with check (app.is_module_manager('aftersales'));
create policy "as categories: manager delete" on public.as_categories for delete to authenticated using (app.is_module_manager('aftersales'));

create policy "as tickets: module read"    on public.as_tickets for select to authenticated using (app.has_module('aftersales'));
create policy "as tickets: module add"     on public.as_tickets for insert to authenticated with check (app.has_module('aftersales') and created_by = auth.uid());
create policy "as tickets: module edit"    on public.as_tickets for update to authenticated using (app.has_module('aftersales')) with check (app.has_module('aftersales'));
create policy "as tickets: manager delete" on public.as_tickets for delete to authenticated using (app.is_module_manager('aftersales'));

create policy "as messages: module read" on public.as_messages for select to authenticated using (app.has_module('aftersales'));
create policy "as messages: module add"  on public.as_messages for insert to authenticated
  with check (app.has_module('aftersales') and author_id = auth.uid() and kind in ('customer', 'reply', 'note') and email_status is null);
create policy "as messages: manager delete" on public.as_messages for delete to authenticated
  using (app.is_module_manager('aftersales') and kind <> 'event');

create policy "as files: module read" on public.as_files for select to authenticated using (app.has_module('aftersales'));
create policy "as files: module add"  on public.as_files for insert to authenticated
  with check (app.has_module('aftersales') and uploaded_by = auth.uid() and storage_path like 'tickets/' || ticket_id || '/%');
create policy "as files: uploader or manager delete" on public.as_files for delete to authenticated
  using (app.has_module('aftersales') and (uploaded_by = auth.uid() or app.is_module_manager('aftersales')));

revoke all on public.as_customers, public.as_contacts, public.as_sites, public.as_categories,
              public.as_tickets, public.as_messages, public.as_files from public, anon;
grant select, insert, update, delete on public.as_customers, public.as_contacts, public.as_sites,
  public.as_categories, public.as_tickets to authenticated;
grant select, insert, delete on public.as_messages, public.as_files to authenticated;
-- The conversation can't be edited afterwards (not even by mistake through older default grants).
revoke update, truncate on public.as_messages, public.as_files from authenticated;
grant usage on sequence public.as_ticket_number_seq to authenticated;
grant all on public.as_customers, public.as_contacts, public.as_sites, public.as_categories,
             public.as_tickets, public.as_messages, public.as_files to service_role;
grant usage on sequence public.as_ticket_number_seq to service_role;

-- Files: a private bucket, only for people with the module. tickets/<ticket_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aftersales', 'aftersales', false, 26214400, null)
on conflict (id) do nothing;
create policy "aftersales files: module read" on storage.objects
  for select to authenticated using (bucket_id = 'aftersales' and app.has_module('aftersales'));
create policy "aftersales files: module add" on storage.objects
  for insert to authenticated with check (bucket_id = 'aftersales' and app.has_module('aftersales'));
create policy "aftersales files: module delete" on storage.objects
  for delete to authenticated using (bucket_id = 'aftersales' and app.has_module('aftersales'));
