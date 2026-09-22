import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { button, card, pageTitle, sectionTitle } from "@/lib/ui";
import type { InitiativeStage } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<InitiativeStage, string> = {
  idea: "Idea",
  proposal: "Waiting on the shura",
  approved: "Approved",
  planning: "Planning",
  live: "Live",
  wrap_up: "Wrapping up",
  closed: "Closed",
};

export default async function EventsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // Two reads on purpose. The first is the full file, which RLS limits
  // to people actually working on the thing. The second is the basics
  // view, which is what a volunteer gets — name, date, venue, nothing
  // about the budget or the risk register.
  const { data: mine } = await supabase
    .from("initiatives")
    .select("id, title, kind, initiative_type, stage, starts_on, recurrence")
    .order("starts_on", { ascending: false, nullsFirst: false })
    .limit(60);

  const { data: basics } = await supabase
    .from("initiative_basics")
    .select("id, title, kind, stage, starts_on")
    .order("starts_on", { ascending: false, nullsFirst: false })
    .limit(60);

  const full = mine ?? [];
  const fullIds = new Set(full.map((i) => i.id));
  const alsoOn = (basics ?? []).filter((b) => !fullIds.has(b.id));

  const active = full.filter((i) => i.stage !== "closed");
  const closed = full.filter((i) => i.stage === "closed");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={pageTitle}>Events &amp; programmes</h1>
        {viewer.can("events.propose") && (
          <Link href="/app/events/new" style={{ ...button, textDecoration: "none" }}>Propose something</Link>
        )}
      </div>

      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        One plan for a weekly dars, a seerah night and a residential camp — the same file,
        scaled to fit. Approving one dates every milestone backwards from the day itself.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>On the go</h2>
        {active.length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing in progress.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {active.map((i) => (
              <Link key={i.id} href={`/app/events/${i.id}`} style={{ ...card, textDecoration: "none", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--text-1)" }}>{i.title}</strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {STAGE_LABEL[i.stage]}
                  </span>
                </div>
                <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
                  {i.starts_on ?? i.recurrence ?? "No date yet"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {alsoOn.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={sectionTitle}>You are on the rota for</h2>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 8px" }}>
            The basics and your own line. The full file belongs to the people running it.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {alsoOn.map((i) => (
              <Link key={i.id} href={`/app/events/${i.id}`} style={{ ...card, textDecoration: "none", display: "block" }}>
                <strong style={{ color: "var(--text-1)" }}>{i.title}</strong>
                <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{i.starts_on ?? "No date yet"}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Closed</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {closed.map((i) => (
              <Link key={i.id} href={`/app/events/${i.id}`} style={{ ...card, textDecoration: "none", display: "block" }}>
                <strong style={{ color: "var(--text-1)" }}>{i.title}</strong>
                <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{i.starts_on}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
