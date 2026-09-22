-- Edgware Youth CRM — the scheduled safeguarding purge.
--
-- RUN THIS SEPARATELY FROM 0008, and only after enabling pg_cron.
-- It is its own migration precisely so that a database where the
-- extension is not available fails here and nowhere else.
--
-- HOW TO ENABLE IT (about thirty seconds):
--
--   1. Supabase dashboard -> Database -> Extensions
--   2. Search "pg_cron", toggle it on. Leave the schema as it offers.
--   3. Come back to the SQL editor and run this file.
--   4. Check it took:  select * from cron.job;
--      You should see one row named 'purge-expired-safeguarding'.
--
-- WHY pg_cron RATHER THAN A VERCEL CRON ROUTE.
-- The rule is about the data, so it belongs next to the data. A
-- database job keeps running if the site is down, if the Vercel
-- project is renamed, if CRON_SECRET is rotated and nobody updates it,
-- or if the app is replaced entirely in three years. A promise to
-- delete a child's medical details after eight weeks should not
-- quietly depend on a web deployment still existing.
--
-- If pg_cron is genuinely unavailable, the fallback is a Vercel cron
-- hitting a route that calls the same function with the service role —
-- note that it is the SAME function either way, which is the point of
-- having written the deletion in SQL.

create extension if not exists pg_cron;

-- Unschedule first so re-running this file does not stack up jobs.
do $$
begin
  perform cron.unschedule('purge-expired-safeguarding');
exception when others then
  -- No such job yet. Fine.
  null;
end $$;

-- 03:15 every day. Early enough to be quiet, odd enough not to collide
-- with everything else that runs on the hour.
select cron.schedule(
  'purge-expired-safeguarding',
  '15 3 * * *',
  $$select public.purge_expired_safeguarding();$$
);
