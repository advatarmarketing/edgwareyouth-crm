import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ResourcesPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // can_see_folder() filters both of these, so a folder somebody is not
  // meant to open is not in their list at all — not greyed out, absent.
  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase.from("resource_folders").select("*").order("position"),
    supabase.from("resources").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <h1 style={pageTitle}>Resources</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        Policies, forms, volunteer packs and the brand files. Each folder decides who can open
        it; a folder you cannot open does not appear here at all.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        {(folders ?? []).length === 0 && (
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing shared with you yet.</p>
        )}
        {(folders ?? []).map((f) => {
          const inFolder = (files ?? []).filter((r) => r.folder_id === f.id);
          return (
            <section key={f.id} style={card}>
              <h2 style={{ ...sectionTitle, marginTop: 0 }}>{f.name}</h2>
              {f.description && (
                <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>{f.description}</p>
              )}
              {inFolder.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>Empty.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
                  {inFolder.map((r) => (
                    <li key={r.id} style={{ fontSize: 14 }}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          {r.title}
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-1)" }}>{r.title}</span>
                      )}
                      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                        {r.filename && ` · ${r.filename}`}
                        {r.size_bytes ? ` · ${sizeLabel(r.size_bytes)}` : ""}
                      </span>
                      {r.description && (
                        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{r.description}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {viewer.can("resources.upload") && (
        <p style={{ color: "var(--text-3)", fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
          Uploading is not wired up yet — the bucket, the folder visibility and the policies
          are in place, the form is not. Add files through the Supabase dashboard for now,
          at <code>resources/&lt;folder id&gt;/</code>.
        </p>
      )}
    </main>
  );
}
