import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { decideClaim, submitClaim } from "../actions";
import { ClaimForm, DecideClaimForm } from "../FinanceForms";

export const dynamic = "force-dynamic";

const money = (n: number) => `£${Number(n).toFixed(2)}`;

const STATUS_COLOUR: Record<string, string> = {
  submitted: "var(--accent)",
  approved: "#1e8449",
  paid: "var(--text-3)",
  rejected: "#c0392b",
};

export default async function ClaimsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const [{ data: claims }, { data: funds }, { data: people }] = await Promise.all([
    supabase.from("expense_claims").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("funds").select("id, name, kind").eq("is_active", true).order("position"),
    supabase.from("member_directory").select("id, full_name"),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const canApprove = viewer.can("finance.approve");

  const mine = (claims ?? []).filter((c) => c.claimant_id === viewer.id);
  // Deliberately excludes your own, because you cannot decide them and
  // showing them here would only invite the attempt.
  const toDecide = (claims ?? []).filter(
    (c) => c.status === "submitted" && c.claimant_id !== viewer.id,
  );
  const others = (claims ?? []).filter(
    (c) => c.claimant_id !== viewer.id && c.status !== "submitted",
  );

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/finance" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Finance</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Expense claims</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Every claim is approved by somebody else. Nobody can approve their own — that one is
        a database constraint, not a rule in the form, so there is no way round it.
      </p>

      <section style={{ ...card, marginBottom: 20 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>Claim something back</h2>
        <ClaimForm funds={funds ?? []} action={submitClaim} />
      </section>

      {canApprove && toDecide.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Waiting on you</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {toDecide.map((c) => (
              <div key={c.id} style={card}>
                <ClaimHeader claim={c} who={nameOf.get(c.claimant_id) ?? "Someone"} />
                <DecideClaimForm id={c.id} action={decideClaim} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Yours</h2>
        {mine.length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>Nothing claimed yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {mine.map((c) => (
              <div key={c.id} style={card}>
                <ClaimHeader claim={c} who="You" />
                {c.decision_note && (
                  <p style={{ fontSize: 13, color: "var(--text-2)", margin: "6px 0 0" }}>{c.decision_note}</p>
                )}
                {c.decided_by && (
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>
                    Decided by {nameOf.get(c.decided_by) ?? "someone"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {(canApprove || viewer.can("finance.view_totals")) && others.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Everything else</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {others.map((c) => (
              <div key={c.id} style={card}>
                <ClaimHeader claim={c} who={nameOf.get(c.claimant_id) ?? "Someone"} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function ClaimHeader({
  claim,
  who,
}: {
  claim: { amount: number; description: string; spent_on: string; status: string; receipt_path: string | null };
  who: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
      <div>
        <strong style={{ color: "var(--text-1)" }}>{money(claim.amount)}</strong>
        <span style={{ color: "var(--text-2)" }}> — {claim.description}</span>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
          {who} · spent {new Date(claim.spent_on).toLocaleDateString("en-GB")}
          {claim.receipt_path ? " · receipt attached" : " · no receipt"}
        </div>
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase",
        letterSpacing: "0.05em", color: STATUS_COLOUR[claim.status] ?? "var(--text-3)",
      }}>
        {claim.status}
      </span>
    </div>
  );
}
