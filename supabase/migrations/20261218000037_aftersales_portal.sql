-- =====================================================================
-- Orion Projects — 0037 Aftersales client portal (stage 4)
--
-- Customers sign in at /portal with a link emailed to them (no password).
-- Only email addresses saved as Aftersales contacts can sign in. They see
-- their own tickets — or, when "share" is on for their company, all of its
-- tickets — with our replies (never internal notes), can reply, add files
-- and open new requests. Portal accounts never become staff accounts.
-- Everything goes through the functions below; portal users have no access
-- to the app's tables.
-- =====================================================================

-- Portal sign-ins don't get a staff profile (and never appear in "Waiting for approval").
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv  public.invites%rowtype;
  first_n text;
  last_n  text;
begin
  if meta ->> 'portal' = 'true' then return new; end if;

  first_n := coalesce(nullif(meta->>'first_name', ''), nullif(meta->>'given_name', ''),
                      split_part(coalesce(meta->>'full_name', meta->>'name', ''), ' ', 1), '');
  last_n  := coalesce(nullif(meta->>'last_name', ''), nullif(meta->>'family_name', ''),
                      nullif(regexp_replace(coalesce(meta->>'full_name', meta->>'name', ''), '^\S+\s*', ''), ''), '');

  select * into inv from public.invites i
   where lower(i.email::text) = lower(new.email)
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc limit 1;

  insert into public.profiles (id, email, first_name, last_name, avatar_url, role, status, approved_by, approved_at)
  values (
    new.id,
    new.email,
    left(first_n, 80),
    left(last_n, 80),
    coalesce(meta->>'avatar_url', meta->>'picture'),
    coalesce(inv.role, 'basic'),
    case when inv.id is not null then 'active'::public.user_status else 'pending'::public.user_status end,
    inv.invited_by,
    case when inv.id is not null then now() end
  );

  if inv.id is not null then
    update public.invites set accepted_at = now() where id = inv.id;
  end if;
  return new;
end;
$$;

-- "Everyone at this customer sees all its tickets in the portal" (otherwise each contact sees their own).
alter table public.as_customers add column portal_shared boolean not null default false;

-- The contact signed in to the portal (a confirmed email that matches a contact).
create or replace function app.portal_contact()
returns public.as_contacts
language sql stable security definer
set search_path = ''
as $$
  select c.* from public.as_contacts c
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null and lower(c.email::text) = lower(u.email::text)
  limit 1
$$;

create or replace function app.portal_sees(t public.as_tickets, me public.as_contacts)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  -- Only a clear yes counts (a missing contact or customer must never let anyone in).
  select coalesce(
    me.id is not null and t.id is not null and (
      t.contact_id is not distinct from me.id and t.contact_id is not null
      or (t.customer_id is not null and t.customer_id = me.customer_id
          and coalesce((select c.portal_shared from public.as_customers c where c.id = me.customer_id), false))
    ),
    false)
$$;

-- What the portal writes is recorded as the customer, not as a signed-in staff member:
-- while it writes, the sign-in is set aside (and put back straight after).
create or replace function app.portal_as_system()
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  saved jsonb := jsonb_build_object('sub', current_setting('request.jwt.claim.sub', true), 'claims', current_setting('request.jwt.claims', true));
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  return saved;
end;
$$;
create or replace function app.portal_restore(saved jsonb)
returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(saved ->> 'sub', ''), true);
  perform set_config('request.jwt.claims', coalesce(saved ->> 'claims', ''), true);
end;
$$;

-- Who am I (null when this email isn't an Aftersales contact).
create or replace function public.portal_me()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me public.as_contacts := app.portal_contact();
begin
  if me.id is null then return null; end if;
  return (
    select jsonb_build_object(
      'name', nullif(me.name, ''), 'email', me.email::text,
      'customer', c.name, 'shared', c.portal_shared,
      'sites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from public.as_sites s where s.customer_id = c.id), '[]')
    )
    from public.as_customers c where c.id = me.customer_id
  );
end;
$$;

create or replace function public.portal_tickets()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me public.as_contacts := app.portal_contact();
begin
  if me.id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x.updated_at desc)
    from (
      select t.number, app.ticket_ref(t.number) as ref, t.subject, t.status, t.created_at, t.updated_at,
             (select s.name from public.as_sites s where s.id = t.site_id) as site,
             (select nullif(k.name, '') from public.as_contacts k where k.id = t.contact_id) as contact
      from public.as_tickets t
      where app.portal_sees(t, me)
      order by t.updated_at desc
      limit 300
    ) x
  ), '[]'::jsonb);
end;
$$;

-- One ticket: our replies and the customer's messages (never internal notes or staff names' surnames).
create or replace function public.portal_ticket(p_number integer)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  me public.as_contacts := app.portal_contact();
  t public.as_tickets%rowtype;
begin
  select * into t from public.as_tickets where number = p_number;
  if t.id is null or not app.portal_sees(t, me) then return null; end if;
  return jsonb_build_object(
    'number', t.number, 'ref', app.ticket_ref(t.number), 'subject', t.subject, 'status', t.status,
    'created_at', t.created_at, 'resolved_at', t.resolved_at,
    'site', (select s.name from public.as_sites s where s.id = t.site_id),
    'category', (select c.name from public.as_categories c where c.id = t.category_id),
    'handled_by', (select nullif(p.first_name, '') from public.profiles p where p.id = t.assigned_to),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'mine', m.kind = 'customer', 'body', m.body, 'created_at', m.created_at,
        'who', case when m.kind = 'customer' then coalesce(nullif(m.from_name, ''), m.from_email::text, 'You')
                    else coalesce((select nullif(p.first_name, '') from public.profiles p where p.id = m.author_id), 'Orion Group') || ' · Orion Group' end
      ) order by m.created_at, m.id)
      from public.as_messages m where m.ticket_id = t.id and m.kind in ('customer', 'reply')
    ), '[]'),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'size_bytes', f.size_bytes, 'created_at', f.created_at) order by f.created_at)
      from public.as_files f
      left join public.as_messages m on m.id = f.message_id
      where f.ticket_id = t.id and (m.id is null or m.kind in ('customer', 'reply'))
    ), '[]')
  );
end;
$$;

-- The customer writes on their ticket (it goes back to In progress if it was waiting or resolved).
create or replace function public.portal_add_message(p_number integer, p_body text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me public.as_contacts := app.portal_contact();
  t public.as_tickets%rowtype;
  new_id uuid;
  saved jsonb;
begin
  select * into t from public.as_tickets where number = p_number;
  if t.id is null or not app.portal_sees(t, me) then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 20000 then raise exception 'Write your message' using errcode = '22023'; end if;
  saved := app.portal_as_system();
  insert into public.as_messages (ticket_id, kind, author_id, from_name, from_email, body)
  values (t.id, 'customer', null, nullif(me.name, ''), me.email, trim(p_body))
  returning as_messages.id into new_id;
  perform app.portal_restore(saved);
  return new_id;
end;
$$;

-- A new request from the portal. Returns its number.
create or replace function public.portal_open_ticket(p_subject text, p_body text, p_site uuid default null)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me public.as_contacts := app.portal_contact();
  t_id uuid;
  n integer;
  saved jsonb;
begin
  if me.id is null then raise exception 'Sign in again' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_subject, ''))) not between 1 and 300 then raise exception 'Write a short subject' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 20000 then raise exception 'Describe the problem' using errcode = '22023'; end if;
  if p_site is not null and not exists (select 1 from public.as_sites s where s.id = p_site and s.customer_id = me.customer_id) then
    raise exception 'Choose one of your sites' using errcode = '22023';
  end if;
  saved := app.portal_as_system();
  insert into public.as_tickets (subject, source, customer_id, contact_id, site_id, created_by)
  values (trim(p_subject), 'portal', me.customer_id, me.id, p_site, null)
  returning id, number into t_id, n;
  insert into public.as_messages (ticket_id, kind, author_id, from_name, from_email, body)
  values (t_id, 'customer', null, nullif(me.name, ''), me.email, trim(p_body));
  perform app.portal_restore(saved);
  return n;
end;
$$;

-- For files: the ticket's id when this customer may add to it.
create or replace function public.portal_ticket_id(p_number integer)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select t.id from public.as_tickets t where t.number = p_number and app.portal_sees(t, app.portal_contact())
$$;

-- For downloads: where a file is kept, when this customer may see it (not files on internal notes).
create or replace function public.portal_file_path(p_file uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('path', f.storage_path, 'name', f.file_name)
  from public.as_files f
  join public.as_tickets t on t.id = f.ticket_id
  left join public.as_messages m on m.id = f.message_id
  where f.id = p_file and app.portal_sees(t, app.portal_contact()) and (m.id is null or m.kind in ('customer', 'reply'))
$$;

revoke all on function public.portal_me(), public.portal_tickets(), public.portal_ticket(integer), public.portal_add_message(integer, text),
  public.portal_open_ticket(text, text, uuid), public.portal_ticket_id(integer), public.portal_file_path(uuid) from public, anon;
grant execute on function public.portal_me(), public.portal_tickets(), public.portal_ticket(integer), public.portal_add_message(integer, text),
  public.portal_open_ticket(text, text, uuid), public.portal_ticket_id(integer), public.portal_file_path(uuid) to authenticated;

-- The automatic reply now tells customers about the portal ({portal} = its address).
update public.as_mail_settings
   set ack_text = ack_text || E'\n\nYou can follow your request, reply and add photos online: {portal}'
 where id and position('{portal}' in ack_text) = 0;
alter table public.as_mail_settings alter column ack_text set default
  E'Thank you for contacting Orion Group. We have received your request and logged it as {ticket}.\n\nOur aftersales team will get back to you as soon as possible. When replying, please keep {ticket} in the subject so your message reaches the right ticket.\n\nYou can follow your request, reply and add photos online: {portal}';
