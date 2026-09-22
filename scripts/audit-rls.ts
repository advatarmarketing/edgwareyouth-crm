/**
 * Does every table actually have RLS on, with policies behind it?
 *
 * verify-rls proves the RULES are right for the tables it knows about.
 * This proves there are no tables it does not know about — the failure
 * mode where a new migration adds a table, nobody adds a check, and it
 * sits there readable by anyone with a login.
 *
 * Three questions, in order of how bad the answer is:
 *   1. RLS off entirely            -> anyone signed in reads everything
 *   2. RLS on, zero policies       -> nobody reads anything (it fails shut,
 *                                     which is safe but is still a bug)
 *   3. RLS on, no SELECT policy    -> same, for reads specifically
 *
 *   npm run audit:rls
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase keys in .env.local.");
  process.exit(1);
}

/**
 * Runs SQL through PostgREST's RPC endpoint.
 *
 * Supabase-js has no "run arbitrary SQL" call, so this needs a helper
 * function in the database. If it is missing, the script says exactly
 * what to paste rather than failing with something cryptic.
 */
async function sql<T>(query: string): Promise<T[]> {
  const response = await fetch(`${url}/rest/v1/rpc/exec_sql_readonly`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ p_query: query }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (/exec_sql_readonly/.test(text)) {
      console.error(
        "\nThis script needs a read-only SQL helper in the database.\n" +
          "Run supabase/migrations/0020_audit_helper.sql first, then try again.\n",
      );
      process.exit(1);
    }
    throw new Error(text);
  }
  return (await response.json()) as T[];
}

type TableRow = { table_name: string; rls_enabled: boolean; policy_count: number; select_policies: number };

async function main() {
  const rows = await sql<TableRow>(`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
           (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname
               and p.cmd in ('SELECT', 'ALL')) as select_policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  `);

  const noRls = rows.filter((r) => !r.rls_enabled);
  const noPolicies = rows.filter((r) => r.rls_enabled && Number(r.policy_count) === 0);
  const noSelect = rows.filter(
    (r) => r.rls_enabled && Number(r.policy_count) > 0 && Number(r.select_policies) === 0,
  );

  console.log(`\n${rows.length} tables in public.\n`);

  if (noRls.length) {
    console.log("✗ RLS IS OFF — anyone signed in can read these:");
    for (const r of noRls) console.log(`    ${r.table_name}`);
  } else {
    console.log("✓ Every table has row level security enabled.");
  }

  if (noPolicies.length) {
    console.log("\n✗ RLS on but NO POLICIES — nobody can read these at all:");
    for (const r of noPolicies) console.log(`    ${r.table_name}`);
  } else {
    console.log("✓ Every table with RLS has at least one policy.");
  }

  if (noSelect.length) {
    console.log("\n! RLS on, policies exist, but none of them allows SELECT:");
    for (const r of noSelect) console.log(`    ${r.table_name}`);
    console.log("  (Correct for a write-only table like audit_log. Check each one.)");
  }

  console.log("");
  process.exit(noRls.length > 0 || noPolicies.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
