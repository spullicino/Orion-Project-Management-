-- =====================================================================
-- Orion Projects: timed reminders (run ONCE in Supabase → SQL Editor,
-- after database update 0023).
--
-- Every 15 minutes Supabase calls the app, which sends the daily update
-- reminder when the time chosen in Admin → Settings has come.
-- Replace https://YOUR-APP.vercel.app with your app's address — or simply
-- copy the ready-made snippet from Admin → Setup, which already has it.
-- No secret to copy: the call proves itself with public.job_secrets.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'orion-reminders',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := 'https://YOUR-APP.vercel.app/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select token from public.job_secrets where name = 'reminders')),
    timeout_milliseconds := 30000
  );
  $job$
);

-- To stop it later: select cron.unschedule('orion-reminders');
