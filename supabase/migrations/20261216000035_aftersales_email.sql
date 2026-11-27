-- =====================================================================
-- Orion Projects — 0035 Aftersales email (stage 2: Gmail)
--
-- The support@ Gmail mailbox is connected once (Aftersales → Settings).
-- Every minute the app reads new emails: each one goes onto its ticket
-- ([OGT-1234] in the subject, the same Gmail conversation, or a reply to
-- one of our emails) or opens a new ticket — creating the customer and
-- contact from the sender when they're new. Replies written in the app are
-- sent from support@ in the same Gmail conversation.
-- The mailbox's keys live in as_mail_settings, which only the server can read.
-- =====================================================================

alter table public.as_tickets add column gmail_thread_id text check (char_length(gmail_thread_id) <= 100);
create index as_tickets_gmail_thread_idx on public.as_tickets (gmail_thread_id) where gmail_thread_id is not null;

alter table public.as_messages
  add column gmail_id    text unique check (char_length(gmail_id) <= 100), -- each Gmail message is imported once
  add column email_to    text check (char_length(email_to) <= 1000),
  add column email_error text check (char_length(email_error) <= 500);
create index as_messages_email_message_idx on public.as_messages (email_message_id) where email_message_id is not null;

-- One row: the connected mailbox and the options. Server only (no access for signed-in people).
create table public.as_mail_settings (
  id               boolean primary key default true check (id),
  mailbox          text,
  refresh_token    text,
  access_token     text,
  access_expires_at timestamptz,
  label_id         text,
  connected_at     timestamptz,
  connected_by     uuid references public.profiles (id) on delete set null,
  import_after     timestamptz,
  last_sync_at     timestamptz,
  sync_lock_at     timestamptz, -- one check at a time
  imported_count   integer not null default 0,
  last_error       text,
  last_error_at    timestamptz,
  auto_ack         boolean not null default true,
  ack_text         text not null default
    E'Thank you for contacting Orion Group. We have received your request and logged it as {ticket}.\n\nOur aftersales team will get back to you as soon as possible. When replying, please keep {ticket} in the subject so your message reaches the right ticket.',
  signature        text not null default E'Orion Group — Aftersales\nsupport@oriongroup.com.mt',
  updated_at       timestamptz not null default now(),
  check (char_length(ack_text) <= 4000 and char_length(signature) <= 1000)
);
insert into public.as_mail_settings (id) values (true) on conflict do nothing;
alter table public.as_mail_settings enable row level security;
revoke all on public.as_mail_settings from public, anon, authenticated;
grant all on public.as_mail_settings to service_role;

-- What people with Aftersales may see about the mailbox (never the keys).
create or replace function public.aftersales_mail_status()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when app.has_module('aftersales') then jsonb_build_object(
    'mailbox', s.mailbox,
    'connected', s.refresh_token is not null,
    'connected_at', s.connected_at,
    'connected_by', app.person_name(s.connected_by),
    'last_sync_at', s.last_sync_at,
    'last_error', s.last_error,
    'last_error_at', s.last_error_at,
    'auto_ack', s.auto_ack,
    'ack_text', s.ack_text,
    'signature', s.signature
  ) end
  from public.as_mail_settings s where s.id
$$;
revoke all on function public.aftersales_mail_status() from public, anon;
grant execute on function public.aftersales_mail_status() to authenticated;

-- Aftersales managers: the automatic reply and the signature.
create or replace function public.set_aftersales_mail_options(p_auto_ack boolean, p_ack_text text, p_signature text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not app.is_module_manager('aftersales') then
    raise exception 'Only Aftersales managers can change the email settings' using errcode = '42501';
  end if;
  if position('{ticket}' in coalesce(p_ack_text, '')) = 0 then
    raise exception 'The automatic reply must include {ticket} (the ticket number)' using errcode = '22023';
  end if;
  update public.as_mail_settings
     set auto_ack = p_auto_ack, ack_text = left(trim(p_ack_text), 4000), signature = left(trim(coalesce(p_signature, '')), 1000), updated_at = now()
   where id;
end;
$$;
revoke all on function public.set_aftersales_mail_options(boolean, text, text) from public, anon;
grant execute on function public.set_aftersales_mail_options(boolean, text, text) to authenticated;

-- People write replies and notes; only the server records email details (sent, Gmail ids…).
drop policy "as messages: module add" on public.as_messages;
create policy "as messages: module add" on public.as_messages for insert to authenticated
  with check (
    app.has_module('aftersales') and author_id = auth.uid() and kind in ('customer', 'reply', 'note')
    and email_status is null and email_message_id is null and gmail_id is null and email_to is null and email_error is null
  );
