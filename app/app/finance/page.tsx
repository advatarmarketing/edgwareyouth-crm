import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { recordTransaction, transferBetweenFunds } from "./actions";
import { RecordTransactionForm, TransferForm } from "./FinanceForms";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function FinancePage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  const [{ data: balances }, { data: monthly }, { data: funds }, { data: people }, { data: campaigns }] =
    await Promise.all([
      supabase.from("fund_balances").select("*").order("kind"),
      supabase.from("finance_monthly_by_fund").select("*").order("month", { ascending: false }).limit(24),
      supabase.from("funds").select("id, name, kind").eq("is_active", true).order("position"),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("campaigns").select("*").neq("status", "finished").order("created_at", { ascending: false }),
    ]);

  const canSeeTotals = viewer.can("finance.view_totals");
  const canLog = viewer.can("finance.log");
  const canApprove = viewer.can("finance.approve");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={pageTitle}>Finance</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 20px", lineHeight: 1.6 }}>
        This records money. It does not take payments, and it never stores a bank or card
        number — there is no column for one.
      </p>

      <div style={{ display: "flex", gap: 14, marginBottom: 24, fontFamily: "var(--font-mono)", fontSize: 12, flexWrap: "wrap" }}>
        <Link href="/app/finance/claims" style={{ color: "var(--text-3)" }}>Expense claims</Link>
        <Link href="/app/finance/pledges" style={{ color: "var(--text-3)" }}>Pledges</Link>
        <Link href="/app/finance/donors" style={{ color: "var(--text-3)" }}>Donor outreach</Link>
        {canSeeTotals && <Link href="/app/finance/export" style={{ color: "var(--accent)" }}>Export CSV</Link>}
      </div>

      {canSeeTotals && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Where the money is</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(balances ?? []).map((b) => (
              <div key={b.fund_id} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ color: "var(--text-1)" }}>{b.name}</strong>
                  {b.kind === "zakat" && (
                    <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 2 }}>
                      Held in trust. Cannot be moved into any other fund.
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-1)" }}>
                  {money(b.balance)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(campaigns ?? []).length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Campaigns</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(campaigns ?? []).map((c) => {
              const pct = c.target ? Math.min(100, Math.round((Number(c.raised) / Number(c.target)) * 100)) : 0;
              return (
                <div key={c.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--text-1)" }}>{c.name}</strong>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                      {money(Number(c.raised))}{c.target && ` of ${money(Number(c.target))}`}
                    </span>
                  </div>
                  {c.target && (
                    <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0" }}>
                    Entered by hand{c.raised_updated_at && ` — last updated ${new Date(c.raised_updated_at).toLocaleDateString("en-GB")}`}.
                    Nothing here talks to {c.platform ?? "the platform"}.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {canLog && (
        <section style={{ ...card, marginBottom: 16 }}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Record money</h2>
          <RecordTransactionForm funds={funds ?? []} people={people ?? []} action={recordTransaction} />
        </section>
      )}

      {canApprove && (
        <section style={{ ...card, marginBottom: 16 }}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Move money between funds</h2>
          <TransferForm funds={funds ?? []} action={transferBetweenFunds} />
        </section>
      )}

      {canSeeTotals && (monthly ?? []).length > 0 && (
        <section>
          <h2 style={sectionTitle}>By month</h2>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px 8px 0" }}>MONTH</th>
                  <th style={{ padding: "4px 8px 8px 0" }}>FUND</th>
                  <th style={{ padding: "4px 8px 8px 0", textAlign: "right" }}>IN</th>
                  <th style={{ padding: "4px 8px 8px 0", textAlign: "right" }}>OUT</th>
                  <th style={{ padding: "4px 0 8px 0", textAlign: "right" }}>NET</th>
                </tr>
              </thead>
              <tbody>
                {(monthly ?? []).map((m, n) => (
                  <tr key={`${m.month}-${m.fund_key}-${n}`} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px 6px 0", color: "var(--text-2)" }}>
                      {new Date(m.month).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "6px 8px 6px 0", color: "var(--text-2)" }}>{m.fund_name}</td>
                    <td style={{ padding: "6px 8px 6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(m.money_in ?? 0)}</td>
                    <td style={{ padding: "6px 8px 6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(m.money_out ?? 0)}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)", color: m.net < 0 ? "#c0392b" : "var(--text-1)" }}>{money(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!canSeeTotals && (
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>
          You can submit expense claims and see your own pledge. Totals are for people with
          finance permissions.
        </p>
      )}
    </main>
  );
}
