import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { EditableField } from "@/components/EditableField";
import { card, fieldLabel, pageTitle, sectionTitle } from "@/lib/ui";
import { saveDonor, updateDonorField } from "../actions";
import { DonorForm } from "../FinanceForms";

export const dynamic = "force-dynamic";

const money = (n: number | null) => (n == null ? "—" : `£${Number(n).toFixed(2)}`);

export default async function DonorsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const [{ data: donors }, { data: progress }, { data: target }] = await Promise.all([
    supabase.from("donors").select("*").order("next_follow_up", { nullsFirst: false }),
    supabase.from("donor_progress").select("*").order("approached", { ascending: false }),
    supabase.from("donor_targets").select("*").eq("profile_id", viewer.id).maybeSingle(),
  ]);

  const mine = (donors ?? []).filter((d) => d.owner_id === viewer.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/finance" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Finance</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Donor outreach</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Your list is yours. Everyone with finance permissions sees the counts below; only the
        shura can see the names. A list of people you might ask for money is not one anybody
        writes honestly if the whole organisation can read it.
        {target && ` Your target is ${target.target_count} people.`}
      </p>

      <section style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>Add someone</h2>
        <DonorForm action={saveDonor} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Your list</h2>
        {mine.length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>Nobody on it yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {mine.map((d) => {
              const overdue = d.next_follow_up != null && d.next_follow_up < today;
              return (
                <div key={d.id} style={{ ...card, borderColor: overdue ? "var(--accent)" : "var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                    <strong style={{ color: "var(--text-1)" }}>{d.name}</strong>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: overdue ? "var(--accent)" : "var(--text-3)" }}>
                      {d.next_follow_up ? `follow up ${d.next_follow_up}` : "no follow-up set"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: 10 }}>
                    <Field label="Pledged">
                      <EditableField value={d.pledged_amount?.toString() ?? ""} onSave={updateDonorField.bind(null, d.id, "pledged_amount")} />
                    </Field>
                    <Field label="Received">
                      <EditableField value={d.received_amount?.toString() ?? ""} onSave={updateDonorField.bind(null, d.id, "received_amount")} />
                    </Field>
                    <Field label="Follow up on">
                      <EditableField value={d.next_follow_up ?? ""} onSave={updateDonorField.bind(null, d.id, "next_follow_up")} />
                    </Field>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Field label="Notes">
                      <EditableField value={d.notes ?? ""} onSave={updateDonorField.bind(null, d.id, "notes")} as="textarea" />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(progress ?? []).length > 1 && (
        <section>
          <h2 style={sectionTitle}>How everyone is doing</h2>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <th style={{ padding: "4px 8px 8px 0" }}>WHO</th>
                  <th style={{ padding: "4px 8px 8px 0", textAlign: "right" }}>APPROACHED</th>
                  <th style={{ padding: "4px 8px 8px 0", textAlign: "right" }}>TARGET</th>
                  <th style={{ padding: "4px 8px 8px 0", textAlign: "right" }}>RECEIVED</th>
                  <th style={{ padding: "4px 0 8px 0", textAlign: "right" }}>OVERDUE</th>
                </tr>
              </thead>
              <tbody>
                {(progress ?? []).map((p) => (
                  <tr key={p.profile_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px 6px 0", color: "var(--text-2)" }}>{p.full_name ?? "Unnamed"}</td>
                    <td style={{ padding: "6px 8px 6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{p.approached}</td>
                    <td style={{ padding: "6px 8px 6px 0", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{p.target_count}</td>
                    <td style={{ padding: "6px 8px 6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(p.received)}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)", color: p.overdue_follow_ups > 0 ? "var(--accent)" : "var(--text-3)" }}>
                      {p.overdue_follow_ups}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "10px 0 0" }}>
              Counts only. The names behind them stay with whoever wrote them down.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}
