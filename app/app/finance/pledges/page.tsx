import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { recordPledgeMonth } from "../actions";
import { PledgeMonthForm } from "../FinanceForms";

export const dynamic = "force-dynamic";

const money = (n: number) => `£${Number(n).toFixed(2)}`;

export default async function PledgesPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // RLS does the work: without finance.view_individual this comes back
  // with your own pledge and nothing else. The page does not filter.
  const [{ data: pledges }, { data: progress }, { data: payments }, { data: people }] = await Promise.all([
    supabase.from("pledges").select("*").is("ended_on", null).order("created_at"),
    supabase.from("pledge_progress").select("*"),
    supabase.from("pledge_payments").select("*").order("month", { ascending: false }).limit(300),
    supabase.from("member_directory").select("id, full_name"),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const progressOf = new Map((progress ?? []).map((p) => [p.pledge_id, p]));
  const canLog = viewer.can("finance.log");
  const seesEveryone = viewer.can("finance.view_individual");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/finance" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Finance</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Monthly pledges</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        {seesEveryone
          ? "Everyone's pledges. Seeing the totals and seeing what each person gives are different permissions, and this is the second one."
          : "Your own pledge. What anyone else gives is between them and the shura."}
      </p>

      {(pledges ?? []).length === 0 ? (
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>No pledge recorded.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {(pledges ?? []).map((p) => {
            const prog = progressOf.get(p.id);
            const months = (payments ?? []).filter((pp) => pp.pledge_id === p.id).slice(0, 12);
            return (
              <section key={p.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <strong style={{ color: "var(--text-1)" }}>
                    {p.profile_id === viewer.id ? "You" : nameOf.get(p.profile_id) ?? "Someone"}
                  </strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{money(p.amount)} a month</span>
                </div>

                {prog && (
                  <p style={{ fontSize: 13, color: "var(--text-3)", margin: "6px 0 0" }}>
                    {prog.months_paid} paid · {prog.months_missed} missed
                    {prog.months_partial > 0 && ` · ${prog.months_partial} part paid`}
                    {" · "}{money(prog.collected)} collected
                  </p>
                )}

                {months.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
                    {months.map((m) => (
                      <span
                        key={m.id}
                        title={`${new Date(m.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} — ${m.status}`}
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 6px",
                          borderRadius: 3, border: "1px solid var(--border-2)",
                          color: m.status === "paid" ? "#1e8449" : m.status === "missed" ? "#c0392b" : "var(--text-3)",
                        }}
                      >
                        {new Date(m.month).toLocaleDateString("en-GB", { month: "short" })}
                      </span>
                    ))}
                  </div>
                )}

                {canLog && <PledgeMonthForm pledgeId={p.id} action={recordPledgeMonth} />}
              </section>
            );
          })}
        </div>
      )}

      <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 20, lineHeight: 1.6 }}>
        A missed month is recorded as a row saying missed, not as an absent one. &quot;We never
        wrote it down&quot; and &quot;they did not pay&quot; are different facts, and the difference
        matters when somebody is asked about it a year later.
      </p>
    </main>
  );
}
