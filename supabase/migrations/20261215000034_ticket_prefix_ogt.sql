-- =====================================================================
-- Orion Projects — 0034 Aftersales ticket numbers: OGT-1001 (was TKT-)
--
-- Only the prefix changes; the numbers stay the same. Notifications, the
-- ticket history and the audit log now say OGT-…. The prefix lives in one
-- place (app.ticket_ref) so it's easy to change again.
-- =====================================================================

create or replace function app.ticket_ref(p_number integer)
returns text
language sql immutable
set search_path = ''
as $$ select 'OGT-' || p_number $$;

create or replace function app.as_ticket_after()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  ref text := app.ticket_ref(new.number);
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

create or replace function app.as_ticket_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.audit('deleted', 'ticket', old.id, null, app.ticket_ref(old.number) || ' · ' || old.subject);
  return null;
end;
$$;

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
        perform app.notify(t.assigned_to, 'ticket.customer', app.ticket_ref(t.number) || ': the customer wrote', left(new.body, 200), '/aftersales/tickets/' || t.number);
      end if;
    end if;
  else
    update public.as_tickets set updated_at = now() where id = new.ticket_id;
  end if;
  return null;
end;
$$;
