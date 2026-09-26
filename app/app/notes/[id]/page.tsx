import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { NoteEditor } from "./NoteEditor";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // Somebody else's note id returns nothing here — RLS, not a check in
  // this file — so it 404s exactly like a note that never existed.
  const { data: note } = await supabase.from("notes").select("*").eq("id", params.id).maybeSingle();
  if (!note) notFound();

  const [{ data: blocks }, { data: folders }] = await Promise.all([
    supabase.from("note_blocks").select("*").eq("note_id", note.id).order("position"),
    supabase.from("note_folders").select("id, name").order("name"),
  ]);

  const checklistIds = (blocks ?? []).map((b) => b.checklist_id).filter((x): x is string => !!x);
  const taskIds = (blocks ?? []).map((b) => b.task_id).filter((x): x is string => !!x);

  const [{ data: items }, { data: tasks }] = await Promise.all([
    checklistIds.length
      ? supabase.from("checklist_items").select("*").in("checklist_id", checklistIds).order("position")
      : Promise.resolve({ data: [] as never[] }),
    taskIds.length
      ? supabase.from("tasks").select("id, title, status").in("id", taskIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 760, margin: "0 auto" }}>
      <Link
        href={note.folder_id ? `/app/notes?folder=${note.folder_id}` : "/app/notes"}
        style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}
      >
        ← Notes
      </Link>

      <NoteEditor
        note={note}
        blocks={blocks ?? []}
        folders={folders ?? []}
        items={items ?? []}
        tasks={tasks ?? []}
      />
    </main>
  );
}
