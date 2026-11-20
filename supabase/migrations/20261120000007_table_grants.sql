-- =====================================================================
-- Orion Projects — 0007 Explicit table privileges
--
-- Newer Supabase projects no longer grant the API roles access to new tables
-- automatically ("permission denied for table …"). Grant them explicitly.
-- This does NOT weaken security: Row Level Security policies (0001–0006)
-- still decide which rows each user can see or change.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Signed-in users: table access, filtered row-by-row by RLS.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- The server (secret key) has full access; it bypasses RLS by design.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Anonymous visitors get no table access at all. Public client share links
-- (phase 3) go through a dedicated SECURITY DEFINER function instead.
revoke all on all tables in schema public from anon;

-- Rate-limit counters are for the server only.
revoke all on public.rate_limits from authenticated;

-- Keep the same behaviour for tables added by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
