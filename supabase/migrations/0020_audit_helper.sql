-- Edgware Youth CRM — a read-only SQL helper for the RLS audit script.
--
-- scripts/audit-rls.ts needs to ask the catalogue which tables have RLS
-- on. supabase-js has no "run arbitrary SQL" call, so this is the
-- narrowest possible door:
--
--   - it REFUSES anything that is not a single SELECT;
--   - it is granted to service_role ONLY, never to authenticated, so
--     it is not reachable with an anon or user token;
--   - it returns jsonb, so it cannot be used to write.
--
-- A general "run this SQL" endpoint reachable by a signed-in user would
-- be a far worse hole than the one the audit closes, which is why the
-- guard below is a hard refusal rather than a warning.

create or replace function public.exec_sql_readonly(p_query text)
returns jsonb
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
  v_clean  text := btrim(p_query);
begin
  if v_clean !~* '^(select|with)\s' then
    raise exception 'Only SELECT is allowed here.' using errcode = '42501';
  end if;
  -- One statement. A semicolon in the middle is somebody chaining.
  if position(';' in btrim(v_clean, ';')) > 0 then
    raise exception 'One statement at a time.' using errcode = '42501';
  end if;

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', v_clean)
     into v_result;
  return v_result;
end;
$$;

revoke all on function public.exec_sql_readonly(text) from public, anon, authenticated;
grant execute on function public.exec_sql_readonly(text) to service_role;
