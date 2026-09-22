import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { firstName } from "@/lib/names";
import { card, pageTitle, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

const money = (n: number) => `£${Number(n).toFixed(0)}`;

/**
 * Spec 4.2 — a different dashboard per person.
 *
 * Built from permissions rather than from tier, so that a sabiqun the
 * shura have given finance.approve sees the claims waiting without
 * anybody editing this file. Tier is only used where the spec names a
 * tier outright, which is the Muhsinun "next shift" block.
 *
 * Everything is also filtered by RLS underneath, so a section that
 * would be empty for somebody simply renders nothing — the page never
 * has to decide what they are allowed to know.
 */
export default async function DashboardPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const weekISO = new Date(today.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const [
    { data: myTasks }, { data: events }, { data: meetings },
    { data: announcements }, { data: unread }, { data: sops }, { data: sopReads },
    { data: myShifts },
  ] = await Promise.all([
    supabase.from("tasks").select("id, title, due_date, status, priority")
      .eq("owner_id", viewer.id).neq("status", "done").order("due_date", { nullsFirst: false }).limit(50),
    supabase.from("initiative_basics").select("id, title, starts_on, starts_at, venue_name")
      .gte("starts_on", todayISO).order("starts_on").limit(3),
    supabase.from("meetings").select("id, title, meeting_date, starts_at")
      .gte("meeting_date", todayISO).order("meeting_date").limit(3),
    supabase.from("messages").select("id, body, created_at, channel_id")
      .order("created_at", { ascending: false }).limit(3),
    supabase.from("channel_unread").select("channel_id, unread"),
    supabase.from("sops").select("id, title, version").eq("status", "published"),
    supabase.from("sop_reads").select("sop_id, version_read").eq("profile_id", viewer.id),
    supabase.from("initiative_volunteers").select("initiative_id, role, from_time, to_time, report_to")
      .eq("profile_id", viewer.id),
  ]);

  const overdue = (myTasks ?? []).filter((t) => t.due_date && t.due_date < todayISO);
  const dueToday = (myTasks ?? []).filter((t) => t.due_date === todayISO);
  const dueThisWeek = (myTasks ?? []).filter(
    (t) => t.due_date && t.due_date > todayISO && t.due_date <= weekISO,
  );

  const readAt = new Map((sopReads ?? []).map((r) => [r.sop_id, r.version_read]));
  // Unread means never read OR read at an older version — a changed SOP
  // turns somebody's tick back into "needs re-reading" on its own.
  const unreadSops = (sops ?? []).filter((s) => readAt.get(s.id) !== s.version);
  const totalUnreadMessages = (unread ?? []).reduce((sum, u) => sum + u.unread, 0);

  // Shura extras. Each is behind the permission that governs the thing
  // itself, so an empty array and "not allowed" look the same here —
  // which is correct, because the page has no business distinguishing.
  const [
    { data: orgOverdue }, { data: awaitingApproval }, { data: claims },
    { data: income }, { data: objectives }, { data: krs }, { data: actionsKpi },
    { data: ledEvents }, { data: teamTasks },
  ] = await Promise.all([
    viewer.can("tasks.view_all")
      ? supabase.from("tasks").select("id").neq("status", "done").lt("due_date", todayISO)
      : Promise.resolve({ data: null }),
    viewer.can("events.approve")
      ? supabase.from("initiatives").select("id, title").eq("stage", "proposal")
      : Promise.resolve({ data: null }),
    viewer.can("finance.approve")
      ? supabase.from("expense_claims").select("id, amount, claimant_id").eq("status", "submitted")
      : Promise.resolve({ data: null }),
    viewer.can("finance.view_totals")
      ? supabase.from("finance_transactions").select("amount").eq("direction", "in").gte("occurred_on", monthStart)
      : Promise.resolve({ data: null }),
    viewer.can("okr.manage") || viewer.can("okr.update_own")
      ? supabase.from("objectives").select("id, title").eq("status", "active")
      : Promise.resolve({ data: null }),
    viewer.can("okr.manage") || viewer.can("okr.update_own")
      ? supabase.from("key_result_progress").select("objective_id, percent_complete, owner_id, title, current_value, target_value, unit")
      : Promise.resolve({ data: null }),
    viewer.can("kpi.view")
      ? supabase.from("kpi_values").select("value, period, kpis!inner(key)").order("period", { ascending: false }).limit(20)
      : Promise.resolve({ data: null }),
    supabase.from("initiatives").select("id, title, stage, starts_on").eq("lead_id", viewer.id).neq("stage", "closed"),
    viewer.can("tasks.view_all")
      ? supabase.from("tasks").select("id, status").neq("status", "done")
      : Promise.resolve({ data: null }),
  ]);

  const monthIncome = (income ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const claimsTotal = (claims ?? []).reduce((sum, c) => sum + Number(c.amount), 0);
  const myKrs = (krs ?? []).filter((k) => k.owner_id === viewer.id);
  const onTime = (actionsKpi ?? []).find(
    (v) => (v.kpis as unknown as { key: string })?.key === "actions_on_time_pct",
  );

  return (
    <main style={{ padding: "32px 16px", maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: "0 0 4px" }}>
        Assalamu alaikum, {firstName(viewer.fullName)}
      </h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 28px" }}>
        {overdue.length > 0
          ? `${overdue.length} thing${overdue.length === 1 ? "" : "s"} overdue.`
          : dueToday.length > 0
            ? `${dueToday.length} due today.`
            : "Nothing overdue."}
      </p>

      {/* ---- Everyone ---- */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={sectionTitle}>Your tasks</h2>
        {(myTasks ?? []).length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing on your list.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <TaskGroup label="Overdue" tasks={overdue} tone="#c0392b" />
            <TaskGroup label="Today" tasks={dueToday} tone="var(--accent)" />
            <TaskGroup label="This week" tasks={dueThisWeek} tone="var(--text-3)" />
          </div>
        )}
      </section>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginBottom: 26 }}>
        <Panel title="Next events" href="/app/events">
          {(events ?? []).length === 0 ? <Empty>Nothing coming up.</Empty> : (
            <List>
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  <Link href={`/app/events/${e.id}`} style={{ color: "var(--text-1)", textDecoration: "none" }}>
                    {e.title}
                  </Link>
                  <Meta>{e.starts_on}{e.venue_name && ` · ${e.venue_name}`}</Meta>
                </li>
              ))}
            </List>
          )}
        </Panel>

        <Panel title="Next meetings" href="/app/meetings">
          {(meetings ?? []).length === 0 ? <Empty>None scheduled.</Empty> : (
            <List>
              {(meetings ?? []).map((m) => (
                <li key={m.id}>
                  <Link href={`/app/meetings/${m.id}`} style={{ color: "var(--text-1)", textDecoration: "none" }}>
                    {m.title}
                  </Link>
                  <Meta>{m.meeting_date}{m.starts_at && ` · ${m.starts_at.slice(0, 5)}`}</Meta>
                </li>
              ))}
            </List>
          )}
        </Panel>

        <Panel title="Messages" href="/app/messages">
          {totalUnreadMessages > 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-1)" }}>
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{totalUnreadMessages}</strong> unread
            </p>
          ) : <Empty>All caught up.</Empty>}
          {(announcements ?? []).length > 0 && (
            <List>
              {(announcements ?? []).slice(0, 2).map((a) => (
                <li key={a.id}>
                  <span style={{ color: "var(--text-2)", fontSize: 13 }}>
                    {a.body.length > 70 ? `${a.body.slice(0, 70)}…` : a.body}
                  </span>
                </li>
              ))}
            </List>
          )}
        </Panel>

        <Panel title="SOPs to read" href="/app/sops">
          {unreadSops.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <List>
              {unreadSops.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <Link href={`/app/sops/${s.id}`} style={{ color: "var(--text-1)", textDecoration: "none" }}>
                    {s.title}
                  </Link>
                </li>
              ))}
            </List>
          )}
        </Panel>
      </div>

      {/* ---- Muhsinun: the next shift ---- */}
      {(myShifts ?? []).length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={sectionTitle}>Your next shift</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(myShifts ?? []).map((s, n) => (
              <Link key={n} href={`/app/events/${s.initiative_id}`}
                style={{ ...card, textDecoration: "none", display: "block" }}>
                <strong style={{ color: "var(--text-1)" }}>{s.role ?? "On the rota"}</strong>
                <Meta>
                  {s.from_time?.slice(0, 5)}–{s.to_time?.slice(0, 5)}
                  {s.report_to && ` · report to ${s.report_to}`}
                </Meta>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Sabiqun: events they lead ---- */}
      {(ledEvents ?? []).length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={sectionTitle}>Events you lead</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(ledEvents ?? []).map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} style={{ ...card, textDecoration: "none", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--text-1)" }}>{e.title}</strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", color: "var(--text-3)" }}>
                    {e.stage}
                  </span>
                </div>
                <Meta>{e.starts_on ?? "No date yet"}</Meta>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Your key results ---- */}
      {myKrs.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={sectionTitle}>Yours to move</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {myKrs.map((k, n) => (
              <Link key={n} href="/app/strategy/okrs" style={{ ...card, textDecoration: "none", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-1)", fontSize: 14 }}>{k.title}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                    {k.current_value} / {k.target_value} {k.unit ?? ""}
                  </span>
                </div>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${k.percent_complete}%`, height: "100%", background: "var(--accent)" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Shura: the org-wide view ---- */}
      {(orgOverdue || awaitingApproval || claims || income) && (
        <section style={{ marginBottom: 26 }}>
          <h2 style={sectionTitle}>Across the organisation</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {orgOverdue && (
              <Tile label="Tasks overdue" value={String(orgOverdue.length)} href="/app/tasks"
                tone={orgOverdue.length > 0 ? "var(--accent)" : undefined} />
            )}
            {teamTasks && (
              <Tile label="Open tasks" value={String(teamTasks.length)} href="/app/tasks" />
            )}
            {awaitingApproval && (
              <Tile label="Events to approve" value={String(awaitingApproval.length)} href="/app/events"
                tone={awaitingApproval.length > 0 ? "var(--accent)" : undefined} />
            )}
            {claims && (
              <Tile label="Claims waiting" value={`${claims.length}${claims.length ? ` · ${money(claimsTotal)}` : ""}`}
                href="/app/finance/claims" tone={claims.length > 0 ? "var(--accent)" : undefined} />
            )}
            {income && (
              <Tile label="In this month" value={money(monthIncome)} href="/app/finance" />
            )}
            {onTime && (
              <Tile label="Actions on time" value={`${Number(onTime.value)}%`} href="/app/strategy/kpis" />
            )}
          </div>
        </section>
      )}

      {(objectives ?? []).length > 0 && (
        <section>
          <h2 style={sectionTitle}>Objectives</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(objectives ?? []).map((o) => {
              const theirs = (krs ?? []).filter((k) => k.objective_id === o.id);
              const pct = theirs.length
                ? Math.round(theirs.reduce((s, k) => s + k.percent_complete, 0) / theirs.length)
                : 0;
              return (
                <Link key={o.id} href="/app/strategy/okrs" style={{ ...card, textDecoration: "none", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-1)", fontSize: 14 }}>{o.title}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 13,
                      color: pct >= 70 ? "#1e8449" : pct >= 30 ? "var(--text-2)" : "var(--accent)",
                    }}>
                      {pct}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function TaskGroup({ label, tasks, tone }: { label: string; tasks: { id: string; title: string; due_date: string | null }[]; tone: string }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: tone, margin: "0 0 6px" }}>
        {label} · {tasks.length}
      </h3>
      <div style={{ display: "grid", gap: 5 }}>
        {tasks.slice(0, 6).map((t) => (
          <Link key={t.id} href={`/app/tasks/${t.id}`}
            style={{ ...card, padding: "9px 13px", textDecoration: "none", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-1)", fontSize: 14 }}>{t.title}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{t.due_date ?? ""}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h2 style={{ ...sectionTitle, marginTop: 0, marginBottom: 8 }}>
        <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>{title}</Link>
      </h2>
      {children}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 14 }}>{children}</ul>;
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>{children}</p>;
}

function Tile({ label, value, href, tone }: { label: string; value: string; href: string; tone?: string }) {
  return (
    <Link href={href} style={{ ...card, flex: "1 1 150px", minWidth: 140, textDecoration: "none" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: tone ?? "var(--text-1)", marginTop: 4 }}>
        {value}
      </div>
    </Link>
  );
}
