import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { button, card, pageTitle, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * The SOP library.
 *
 * RLS decides what is in this list — can_see_sop() checks the tier,
 * team and named-person rules, so an SOP aimed at the finance team
 * simply is not in the rows a muhsin gets back. There is no filtering
 * in this page at all, which is the point.
 */
export default async function SopsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  const [{ data: sops }, { data: reads }] = await Promise.all([
    supabase.from("sops").select("id, title, category, status, version").order("category").order("title"),
    supabase.from("sop_reads").select("sop_id, version_read").eq("profile_id", viewer.id),
  ]);

  // A read receipt against an older version is not a read. This is how
  // "when an SOP is updated, people are asked to re-read it" works
  // without anybody having to clear anything.
  const readVersion = new Map((reads ?? []).map((r) => [r.sop_id, r.version_read]));

  const byCategory = new Map<string, typeof sops>();
  for (const sop of sops ?? []) {
    const list = byCategory.get(sop.category) ?? [];
    list!.push(sop);
    byCategory.set(sop.category, list);
  }

  const unreadCount = (sops ?? []).filter((s) => (readVersion.get(s.id) ?? 0) < s.version).length;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={pageTitle}>SOPs</h1>
        {viewer.can("sops.manage") && (
          <Link href="/app/sops/new" style={{ ...button, textDecoration: "none" }}>New SOP</Link>
        )}
      </div>

      <p style={{ color: "var(--text-2)", margin: "8px 0 28px" }}>
        {unreadCount > 0
          ? `${unreadCount} still to read.`
          : "You have read everything here."}
      </p>

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} style={{ marginBottom: 26 }}>
          <h2 style={sectionTitle}>{category}</h2>

          <div style={{ display: "grid", gap: 8 }}>
            {(items ?? []).map((sop) => {
              const unread = (readVersion.get(sop.id) ?? 0) < sop.version;
              const neverRead = !readVersion.has(sop.id);

              return (
                <Link key={sop.id} href={`/app/sops/${sop.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: unread ? 500 : 400 }}>
                    {sop.title}
                    {sop.status === "draft" && (
                      <span style={{ color: "var(--warn-fg)", fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 8 }}>
                        DRAFT
                      </span>
                    )}
                  </span>

                  {unread && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap" }}>
                      {neverRead ? "NOT READ" : "UPDATED — RE-READ"}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {(sops ?? []).length === 0 && (
        <p style={{ color: "var(--text-2)" }}>
          Nothing here yet{viewer.can("sops.manage") ? " — write the first one." : " that you have been given."}
        </p>
      )}
    </main>
  );
}
