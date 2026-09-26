import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { EditableField } from "@/components/EditableField";
import { button, card, input, pageTitle, secondaryButton, sectionTitle } from "@/lib/ui";
import { createFolder, createNote, deleteFolder, renameFolder } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Folders down one side, notes in the chosen folder down the other,
 * most recently updated first.
 *
 * "All notes" and "Unfiled" are views, not folders — there is no row
 * for either, so neither can be renamed or deleted by accident.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: { folder?: string };
}) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // RLS returns this person's notes and nobody else's — the shura
  // included. Nothing on this page filters by owner itself.
  const [{ data: folders }, { data: notes }] = await Promise.all([
    supabase.from("note_folders").select("*"),
    supabase.from("notes").select("*").order("updated_at", { ascending: false }),
  ]);

  const selected = searchParams.folder ?? "all";
  const current =
    selected === "all" || selected === "unfiled"
      ? null
      : (folders ?? []).find((f) => f.id === selected) ?? null;

  const shown = (notes ?? []).filter((n) =>
    selected === "all" ? true : selected === "unfiled" ? n.folder_id == null : n.folder_id === selected,
  );

  // Folders sort the same way as notes: the one you touched last is on
  // top. A folder's "last touched" is its newest note, or the folder
  // itself if it is empty.
  const latestIn = (folderId: string, fallback: string) =>
    (notes ?? []).find((n) => n.folder_id === folderId)?.updated_at ?? fallback;
  const sortedFolders = [...(folders ?? [])].sort((a, b) =>
    latestIn(b.id, b.updated_at).localeCompare(latestIn(a.id, a.updated_at)),
  );

  const countIn = (folderId: string | null) =>
    (notes ?? []).filter((n) => n.folder_id === folderId).length;
  const folderName = new Map((folders ?? []).map((f) => [f.id, f.name]));

  const heading =
    selected === "all" ? "All notes" : selected === "unfiled" ? "Unfiled" : current?.name ?? "Folder";

  return (
    <main style={{ padding: "28px 16px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={pageTitle}>Notes</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        Yours alone — nobody else can open them, the shura included. Highlight any lines in a
        note and turn them into a to-do list; it appears in your Tasks as well, and ticking it
        in either place ticks both.
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* ---- Folders ---- */}
        <aside style={{ flex: "1 1 220px", maxWidth: 320, display: "grid", gap: 6 }}>
          <FolderLink href="/app/notes" active={selected === "all"} label="All notes" count={(notes ?? []).length} />
          <FolderLink href="/app/notes?folder=unfiled" active={selected === "unfiled"} label="Unfiled" count={countIn(null)} />

          {sortedFolders.length > 0 && (
            <h2 style={{ ...sectionTitle, margin: "14px 0 4px" }}>Folders</h2>
          )}
          {sortedFolders.map((f) => (
            <FolderLink
              key={f.id}
              href={`/app/notes?folder=${f.id}`}
              active={selected === f.id}
              label={f.name}
              count={countIn(f.id)}
            />
          ))}

          <form action={createFolder} style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <input name="name" placeholder="New folder" style={{ ...input, flex: 1 }} required />
            <button type="submit" style={{ ...secondaryButton, padding: "8px 12px" }}>Add</button>
          </form>
        </aside>

        {/* ---- Notes in the chosen folder ---- */}
        <section style={{ flex: "3 1 380px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            {current ? (
              <div style={{ flex: "1 1 200px", fontSize: 18 }}>
                <EditableField value={current.name} onSave={renameFolder.bind(null, current.id)} />
              </div>
            ) : (
              <h2 style={{ ...sectionTitle, margin: 0 }}>{heading}</h2>
            )}
            <form action={createNote}>
              <input type="hidden" name="folder_id" value={current?.id ?? ""} />
              <button type="submit" style={button}>New note</button>
            </form>
          </div>

          {shown.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: 14 }}>
              {selected === "all" ? "No notes yet." : "Nothing in here yet."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {shown.map((n) => (
                <Link
                  key={n.id}
                  href={`/app/notes/${n.id}`}
                  style={{ ...card, textDecoration: "none", display: "block" }}
                >
                  <strong style={{ color: n.title ? "var(--text-1)" : "var(--text-3)", fontSize: 15 }}>
                    {n.title || "Untitled"}
                  </strong>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, lineHeight: 1.6 }}>
                    Updated {formatDateTime(n.updated_at)}
                    <span style={{ margin: "0 6px" }}>·</span>
                    Created {formatDateTime(n.created_at)}
                    {selected === "all" && n.folder_id && (
                      <>
                        <span style={{ margin: "0 6px" }}>·</span>
                        {folderName.get(n.folder_id)}
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {current && (
            <form action={deleteFolder} style={{ marginTop: 28 }}>
              <input type="hidden" name="id" value={current.id} />
              <button type="submit" style={{ ...secondaryButton, fontSize: 11 }}>
                Delete this folder
              </button>
              <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 10 }}>
                Its notes move to Unfiled. None are deleted.
              </span>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function FolderLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 12px",
        borderRadius: "var(--radius-sm)",
        textDecoration: "none",
        background: active ? "var(--accent-tint, #e6ecf4)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-1)",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{count}</span>
    </Link>
  );
}
