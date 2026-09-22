"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import {
  pasteNotes,
  saveAction,
  addDecision,
  publishMeeting,
  suggestAgendaItem,
  type ActionState,
} from "../actions";
import { input, fieldLabel, button, secondaryButton } from "@/lib/ui";

const EMPTY: ActionState = { error: null, ok: null };

type Person = { id: string; full_name: string | null };

export function PasteNotesForm({ meetingId }: { meetingId: string }) {
  const [state, action] = useFormState(pasteNotes, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <textarea
        name="notes"
        rows={10}
        placeholder={"Paste the notes here.\n\nACTION @Yusuf: Book the venue by 12/10\n  - Call the masjid office\nDECISION: Seerah night moves to November"}
        style={{ ...input, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
      />
      <div>
        <button type="submit" style={button}>Read the notes</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

/**
 * One action on the review screen.
 *
 * The due date is shown as a real date input holding the resolved
 * calendar date — never the phrase that produced it. "next Friday" is
 * ambiguous in British usage, so the minute-taker has to be able to
 * see which Friday the parser actually chose and change it.
 */
export function ActionRow({
  meetingId,
  action: item,
  people,
  resolvesId,
}: {
  meetingId: string;
  action: { id?: string; text: string; owner_id: string | null; due_date: string | null; steps: string[] };
  people: Person[];
  resolvesId?: string;
}) {
  const [state, formAction] = useFormState(saveAction, EMPTY);
  const incomplete = !item.owner_id || !item.due_date;

  return (
    <form
      action={formAction}
      style={{
        display: "grid",
        gap: 8,
        padding: 14,
        border: `1px solid ${incomplete ? "var(--warn-border)" : "var(--border)"}`,
        background: incomplete ? "var(--warn-bg)" : "var(--surface)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <input type="hidden" name="meeting_id" value={meetingId} />
      {item.id && <input type="hidden" name="id" value={item.id} />}
      {resolvesId && <input type="hidden" name="resolves" value={resolvesId} />}

      <input name="text" defaultValue={item.text} placeholder="What needs doing" style={input} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="owner_id" defaultValue={item.owner_id ?? ""} style={{ ...input, flex: "1 1 170px" }}>
          <option value="">Nobody yet</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
          ))}
        </select>

        <input type="date" name="due_date" defaultValue={item.due_date ?? ""} style={{ ...input, flex: "1 1 150px" }} />
      </div>

      <textarea
        name="steps"
        rows={item.steps.length ? item.steps.length + 1 : 2}
        defaultValue={item.steps.join("\n")}
        placeholder="Steps, one per line"
        style={{ ...input, resize: "vertical", fontSize: 13 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" style={secondaryButton}>Save</button>
        {incomplete && (
          <span style={{ color: "var(--warn-fg)", fontSize: 12 }}>
            Needs an owner and a date before the meeting can be published.
          </span>
        )}
        {state.error && <span style={{ color: "var(--danger-fg)", fontSize: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", fontSize: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

export function NewActionForm({ meetingId, people }: { meetingId: string; people: Person[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} style={secondaryButton}>+ Action</button>;
  }

  return (
    <ActionRow
      meetingId={meetingId}
      people={people}
      action={{ text: "", owner_id: null, due_date: null, steps: [] }}
    />
  );
}

export function DecisionForm({ meetingId }: { meetingId: string }) {
  const [state, action] = useFormState(addDecision, EMPTY);

  return (
    <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input name="text" placeholder="What was decided" style={{ ...input, flex: "1 1 260px" }} />
      <button type="submit" style={secondaryButton}>+ Decision</button>
      {state.error && <span style={{ color: "var(--danger-fg)" }}>{state.error}</span>}
    </form>
  );
}

export function PublishForm({ meetingId, actionCount }: { meetingId: string; actionCount: number }) {
  const [state, action] = useFormState(publishMeeting, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" style={button}>Publish the minutes</button>
        <span style={{ color: "var(--text-3)", fontSize: 13 }}>
          Turns {actionCount} action{actionCount === 1 ? "" : "s"} into tasks and sends everyone their pack.
        </span>
      </div>
      {state.error && <p style={{ color: "var(--danger-fg)", margin: 0 }}>{state.error}</p>}
      {state.ok && <p style={{ color: "var(--ok-fg)", margin: 0 }}>{state.ok}</p>}
    </form>
  );
}

export function SuggestItemForm({ meetingId }: { meetingId: string }) {
  const [state, action] = useFormState(suggestAgendaItem, EMPTY);

  return (
    <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input name="title" placeholder="Something for the agenda" style={{ ...input, flex: "1 1 240px" }} />
      <button type="submit" style={secondaryButton}>Add to agenda</button>
      {state.error && <span style={{ color: "var(--danger-fg)" }}>{state.error}</span>}
      {state.ok && <span style={{ color: "var(--ok-fg)" }}>{state.ok}</span>}
    </form>
  );
}

export function NewMeetingFields({ templates, people }: { templates: { id: string; name: string }[]; people: Person[] }) {
  return (
    <>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Type</span>
        <select name="template_id" required style={input}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Title</span>
        <input name="title" placeholder="Leave blank to use the type's name" style={input} />
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 160px" }}>
          <span style={fieldLabel}>Date</span>
          <input type="date" name="meeting_date" required style={input} />
        </label>
        <label style={{ display: "grid", gap: 5, flex: "1 1 120px" }}>
          <span style={fieldLabel}>Time</span>
          <input type="time" name="starts_at" style={input} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 180px" }}>
          <span style={fieldLabel}>Chair</span>
          <select name="chair_id" style={input}>
            <option value="">You</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, flex: "1 1 180px" }}>
          <span style={fieldLabel}>Minute-taker</span>
          <select name="minute_taker_id" style={input}>
            <option value="">You</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}

export function CreateMeetingForm({
  templates,
  people,
  action,
}: {
  templates: { id: string; name: string }[];
  people: Person[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useFormState(action, EMPTY);

  return (
    <form action={formAction} style={{ display: "grid", gap: 14, maxWidth: 520 }}>
      <NewMeetingFields templates={templates} people={people} />
      {state.error && <p style={{ color: "var(--danger-fg)", margin: 0 }}>{state.error}</p>}
      <div><button type="submit" style={button}>Create</button></div>
    </form>
  );
}
