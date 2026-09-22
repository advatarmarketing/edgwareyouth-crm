import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle, secondaryButton } from "@/lib/ui";
import { markSopRead } from "../actions";
import { RunSopForm } from "./RunSopForm";

export const dynamic = "force-dynamic";

export default async function SopPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // can_see_sop() decides this. An SOP you have not been given simply
  // is not there — a 404 rather than a redirect, so the page does not
  // confirm it exists.
  const { data: sop } = await supabase.from("sops").select("*").eq("id", params.id).maybeSingle();
  if (!sop) notFound();

  const canManage = viewer.can("sops.manage");

  const [{ data: items }, { data: myRead }, { data: versions }, { data: people }, { data: allReads }] =
    await Promise.all([
      sop.checklist_id
        ? supabase.from("checklist_items").select("id, text, depth, position").eq("checklist_id", sop.checklist_id).order("position")
        : Promise.resolve({ data: null }),
      supabase.from("sop_reads").select("version_read, read_at").eq("sop_id", params.id).eq("profile_id", viewer.id).maybeSingle(),
      supabase.from("sop_versions").select("version, changed_at, changed_by").eq("sop_id", params.id).order("version", { ascending: false }),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
      canManage
        ? supabase.from("sop_reads").select("profile_id, version_read").eq("sop_id", params.id)
        : Promise.resolve({ data: null }),
    ]);

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const needsReading = (myRead?.version_read ?? 0) < sop.version;

  // Who still owes a read. Only meaningful for the people the SOP is
  // actually aimed at, but the membership rules live in SQL — so this
  // lists everyone active without a current receipt and says so.
  const readVersion = new Map((allReads ?? []).map((r) => [r.profile_id, r.version_read]));
  const notRead = canManage
    ? (people ?? []).filter((p) => (readVersion.get(p.id) ?? 0) < sop.version)
    : [];

  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/sops" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← SOPs</Link>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", margin: "8px 0 4px" }}>
        <h1 style={{ ...pageTitle, fontSize: 34 }}>{sop.title}</h1>
        {canManage && (
          <Link href={`/app/sops/${sop.id}/edit`} style={{ ...secondaryButton, textDecoration: "none" }}>Edit</Link>
        )}
      </div>

      <p style={{ color: "var(--text-2)", margin: "0 0 24px", fontSize: 14 }}>
        {sop.category} · version {sop.version}
        {sop.status === "draft" && <span style={{ color: "var(--warn-fg)" }}> · DRAFT</span>}
      </p>

      {sop.body && (
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, margin: "0 0 32px" }}>{sop.body}</div>
      )}

      {(items ?? []).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>The steps</h2>
          {/* Deliberately not tickable. This is the library copy — the
              standard. "Run this SOP" below hands you your own. */}
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            {(items ?? []).map((step) => (
              <li key={step.id} style={{ marginLeft: step.depth * 18, color: step.depth > 0 ? "var(--text-2)" : "var(--text-1)" }}>
                {step.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Have you read it?</h2>
        {needsReading ? (
          <form action={markSopRead}>
            <input type="hidden" name="sop_id" value={sop.id} />
            <input type="hidden" name="version" value={sop.version} />
            <button type="submit" style={{ ...secondaryButton, border: "1px solid var(--accent)", color: "var(--accent)" }}>
              {myRead ? "It has changed — I've read it again" : "I've read this"}
            </button>
          </form>
        ) : (
          <p style={{ color: "var(--ok-fg)", margin: 0, fontSize: 14 }}>
            Read on {new Date(myRead!.read_at).toLocaleDateString("en-GB")}.
          </p>
        )}
      </section>

      {(items ?? []).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>Run it</h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 12px" }}>
            Makes a task with its own copy of the checklist, so ticking it off does not
            touch the library version.
          </p>
          <RunSopForm sopId={sop.id} people={people ?? []} meId={viewer.id} canAssign={viewer.can("tasks.assign")} />
        </section>
      )}

      {canManage && (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={sectionTitle}>Who has not read it</h2>
            {notRead.length === 0 ? (
              <p style={{ color: "var(--ok-fg)", margin: 0, fontSize: 14 }}>Everyone is up to date.</p>
            ) : (
              <p style={{ color: "var(--text-2)", margin: 0, fontSize: 14, lineHeight: 1.7 }}>
                {notRead.map((p) => p.full_name ?? "Unnamed").join(", ")}
              </p>
            )}
          </section>

          {(versions ?? []).length > 0 && (
            <section>
              <h2 style={sectionTitle}>History</h2>
              <div style={{ display: "grid", gap: 6 }}>
                {(versions ?? []).map((v) => (
                  <div key={v.version} style={{ ...card, fontSize: 13, color: "var(--text-2)" }}>
                    Version {v.version} replaced on {new Date(v.changed_at).toLocaleDateString("en-GB")}
                    {v.changed_by ? ` by ${names.get(v.changed_by) ?? "someone"}` : ""}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
