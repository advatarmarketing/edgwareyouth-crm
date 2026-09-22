-- Edgware Youth CRM — fix-up after 0020.
--
-- Symptom: every call to exec_sql_readonly() was refused with
-- "Only SELECT is allowed here", including plain SELECTs.
--
-- Cause: btrim(text) with ONE argument strips spaces and nothing else
-- — not newlines, not tabs. The audit script sends a query written
-- across several lines, so it arrives starting with a newline, and
-- `^(select|with)\s` never matched.
--
-- The bug was harmless (it failed shut, refusing everything), but the
-- fix matters: a guard that only works when the caller formats its
-- input tidily is not a guard. Leading whitespace is now stripped
-- properly, and any comment prefix is stripped too — otherwise
-- "/* */ delete from profiles" would sail past a check looking only at
-- the first word.

create or replace function public.exec_sql_readonly(p_query text)
returns jsonb
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
  v_clean  text;
begin
  -- Strip leading whitespace of every kind, then any leading SQL
  -- comments, then whitespace again — repeatedly, because
  -- "-- x\n/* y */ delete" needs more than one pass.
  v_clean := p_query;
  loop
    v_clean := regexp_replace(v_clean, '^\s+', '');
    if v_clean ~ '^--' then
      v_clean := regexp_replace(v_clean, '^--[^\n]*(\n|$)', '');
    elsif v_clean ~ '^/\*' then
      v_clean := regexp_replace(v_clean, '^/\*.*?\*/', '', 'n');
    else
      exit;
    end if;
  end loop;

  if v_clean !~* '^(select|with)\s' then
    raise exception 'Only SELECT is allowed here.' using errcode = '42501';
  end if;

  -- One statement. A trailing semicolon is fine; one in the middle is
  -- somebody chaining a second command onto the end of a SELECT.
  if position(';' in regexp_replace(v_clean, '[\s;]+$', '')) > 0 then
    raise exception 'One statement at a time.' using errcode = '42501';
  end if;

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t',
    regexp_replace(v_clean, '[\s;]+$', '')
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.exec_sql_readonly(text) from public, anon, authenticated;
grant execute on function public.exec_sql_readonly(text) to service_role;
