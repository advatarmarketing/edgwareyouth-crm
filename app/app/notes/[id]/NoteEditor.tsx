"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { button, input, secondaryButton } from "@/lib/ui";
import type { ChecklistItem, Note, NoteBlock } from "@/lib/supabase/types";
import {
  addTextBlock,
  addTodoBlock,
  addTodoItem,
  deleteNote,
  deleteTextBlock,
  deleteTodoItem,
  editTodoItem,
  makeTodoFromSelection,
  moveNote,
  saveNoteTitle,
  saveTextBlock,
  todoToText,
  toggleTodoItem,
} from "../actions";

type TaskLite = { id: string; title: string; status: string };

export function NoteEditor({
  note,
  blocks,
  folders,
  items,
  tasks,
}: {
  note: Note;
  blocks: NoteBlock[];
  folders: { id: string; name: string }[];
  items: ChecklistItem[];
  tasks: TaskLite[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (work: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setError(result.error ?? null);
      router.refresh();
    });

  const taskOf = new Map(tasks.map((t) => [t.id, t]));

  return (
    <div style={{ marginTop: 10 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title !== note.title) run(() => saveNoteTitle(note.id, title));
        }}
        placeholder="Untitled"
        aria-label="Note title"
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          outline: "none",
          fontFamily: "var(--font-display)",
          fontSize: 40,
          color: "var(--text-1)",
          padding: 0,
        }}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "6px 0 22px" }}>
        <select
          value={note.folder_id ?? ""}
          onChange={(e) => run(() => moveNote(note.id, e.target.value || null))}
          aria-label="Folder"
          style={{ ...input, width: "auto", padding: "5px 8px", fontSize: 13 }}
        >
          <option value="">Unfiled</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          Created {formatDateTime(note.created_at)} · Updated {formatDateTime(note.updated_at)}
          {pending && " · saving…"}
        </span>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--danger, #c0392b)", fontSize: 14, margin: "0 0 14px" }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {blocks.map((block) =>
          block.kind === "text" ? (
            <TextBlock
              key={block.id}
              block={block}
              noteId={note.id}
              noteTitle={title}
              canRemove={blocks.length > 1}
              onDone={(result) => {
                setError(result.error ?? null);
                router.refresh();
              }}
            />
          ) : (
            <TodoBlock
              key={block.id}
              block={block}
              noteId={note.id}
              task={block.task_id ? taskOf.get(block.task_id) ?? null : null}
              items={items.filter((i) => i.checklist_id === block.checklist_id)}
              onDone={(result) => {
                setError(result.error ?? null);
                router.refresh();
              }}
            />
          ),
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        <button type="button" disabled={pending} style={secondaryButton}
          onClick={() => run(() => addTextBlock(note.id))}>
          + Text
        </button>
        <button type="button" disabled={pending} style={secondaryButton}
          onClick={() => run(() => addTodoBlock(note.id, title))}>
          + To-do list
        </button>
      </div>

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)}
            style={{ ...secondaryButton, fontSize: 11 }}>
            Delete this note
          </button>
        ) : (
          <form action={deleteNote} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="folder_id" value={note.folder_id ?? ""} />
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>
              Delete it for good? Any to-do lists in it stay in your Tasks.
            </span>
            <button type="submit" style={{ ...button, background: "#c0392b", borderColor: "#c0392b" }}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} style={secondaryButton}>
              Keep it
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Text
// ---------------------------------------------------------------

function TextBlock({
  block,
  noteId,
  noteTitle,
  canRemove,
  onDone,
}: {
  block: NoteBlock;
  noteId: string;
  noteTitle: string;
  canRemove: boolean;
  onDone: (result: { error?: string }) => void;
}) {
  const [value, setValue] = useState(block.body);
  const [hasSelection, setHasSelection] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const dirty = useRef(false);

  // Take the server's copy when it changes — after a split, this block's
  // text is only the part above the new list — unless the person is
  // mid-edit, when their unsaved typing wins.
  useEffect(() => {
    if (!dirty.current) setValue(block.body);
  }, [block.body]);

  // Grow with the text rather than scrolling inside a box.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const rememberSelection = () => {
    const el = area.current;
    if (!el) return;
    selection.current = { start: el.selectionStart, end: el.selectionEnd };
    setHasSelection(el.selectionEnd > el.selectionStart);
  };

  async function save() {
    if (!dirty.current) return;
    const result = await saveTextBlock(block.id, noteId, value);
    dirty.current = false;
    if (result.error) onDone(result);
  }

  async function makeTodo() {
    setBusy(true);
    // The current text goes with the request, and dirty is cleared
    // FIRST: otherwise the blur that follows would save the full text
    // back over the split and the lines would appear twice — once as
    // prose and once as the list.
    dirty.current = false;
    const result = await makeTodoFromSelection(
      block.id, noteId, value,
      selection.current.start, selection.current.end,
      noteTitle,
    );
    setBusy(false);
    setHasSelection(false);
    onDone(result);
  }

  return (
    <div>
      <textarea
        ref={area}
        value={value}
        onChange={(e) => {
          dirty.current = true;
          setValue(e.target.value);
        }}
        onSelect={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={() => void save()}
        placeholder="Write anything. Highlight lines to turn them into a to-do list."
        rows={3}
        style={{
          ...input,
          resize: "none",
          overflow: "hidden",
          lineHeight: 1.6,
          fontSize: 15,
          minHeight: 72,
        }}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!hasSelection || busy}
          // Keep focus in the textarea. A blur here would fire a save of
          // the whole text while the split is in flight.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void makeTodo()}
          style={{
            ...secondaryButton,
            padding: "5px 11px",
            fontSize: 11,
            opacity: hasSelection ? 1 : 0.5,
            cursor: hasSelection ? "pointer" : "default",
          }}
          title={hasSelection ? "Turn the highlighted lines into a to-do list" : "Highlight some lines first"}
        >
          {busy ? "Making the list…" : "☐ Make to-do list"}
        </button>
        {!hasSelection && (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Highlight lines to turn them into a to-do list.
          </span>
        )}
        {canRemove && value.trim() === "" && (
          <button
            type="button"
            onClick={async () => onDone(await deleteTextBlock(block.id, noteId))}
            style={{ ...secondaryButton, padding: "5px 11px", fontSize: 11, marginLeft: "auto" }}
          >
            Remove empty section
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// To-do list — the same rows the Tasks tab shows
// ---------------------------------------------------------------

function TodoBlock({
  block,
  noteId,
  task,
  items,
  onDone,
}: {
  block: NoteBlock;
  noteId: string;
  task: TaskLite | null;
  items: ChecklistItem[];
  onDone: (result: { error?: string }) => void;
}) {
  // Optimistic ticks, so the box responds under the finger rather than
  // after a round trip. Reset from the server on every refresh.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [newItem, setNewItem] = useState("");
  const [confirmUndo, setConfirmUndo] = useState(false);

  useEffect(() => setTicked({}), [items]);

  const isDone = (item: ChecklistItem) => ticked[item.id] ?? item.done;
  const doneCount = items.filter(isDone).length;

  return (
    <div
      style={{
        border: "1px solid var(--border-2)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
          To-do · {doneCount} of {items.length} done
        </span>
        {task ? (
          <Link href={`/app/tasks/${task.id}`} style={{ fontSize: 12, color: "var(--accent)" }}>
            In your tasks as “{task.title}” →
          </Link>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>No longer in your tasks</span>
        )}
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
        {items.map((item) => (
          <TodoItemRow
            key={item.id}
            item={item}
            done={isDone(item)}
            onToggle={async (next) => {
              setTicked((t) => ({ ...t, [item.id]: next }));
              const result = await toggleTodoItem(item.id, noteId, next);
              if (result.error) setTicked((t) => ({ ...t, [item.id]: !next }));
              onDone(result);
            }}
            onEdit={async (text) => onDone(await editTodoItem(item.id, noteId, text))}
            onDelete={async () => onDone(await deleteTodoItem(item.id, noteId))}
          />
        ))}
      </ul>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!block.checklist_id || !newItem.trim()) return;
          const text = newItem;
          setNewItem("");
          onDone(await addTodoItem(block.checklist_id, noteId, text));
        }}
        style={{ display: "flex", gap: 6, marginTop: 8 }}
      >
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add an item and press Enter"
          style={{ ...input, flex: 1, padding: "6px 10px", fontSize: 14 }}
        />
      </form>

      <div style={{ marginTop: 10 }}>
        {!confirmUndo ? (
          <button type="button" onClick={() => setConfirmUndo(true)}
            style={{ ...secondaryButton, padding: "4px 10px", fontSize: 10 }}>
            Turn back into text
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              It comes out of your Tasks. Ticked items stay marked [x].
            </span>
            <button type="button"
              onClick={async () => onDone(await todoToText(block.id, noteId))}
              style={{ ...button, padding: "4px 10px", fontSize: 10 }}>
              Do it
            </button>
            <button type="button" onClick={() => setConfirmUndo(false)}
              style={{ ...secondaryButton, padding: "4px 10px", fontSize: 10 }}>
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function TodoItemRow({
  item,
  done,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItem;
  done: boolean;
  onToggle: (next: boolean) => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);

  return (
    <li style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: item.depth * 22 }}>
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={`Done: ${item.text}`}
        style={{ width: 17, height: 17, accentColor: "var(--accent)", flexShrink: 0, cursor: "pointer" }}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() !== item.text) onEdit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Item"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          background: "transparent",
          outline: "none",
          fontSize: 15,
          padding: "3px 0",
          color: done ? "var(--text-3)" : "var(--text-1)",
          textDecoration: done ? "line-through" : "none",
        }}
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${item.text}`}
        style={{ border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
      >
        ×
      </button>
    </li>
  );
}
