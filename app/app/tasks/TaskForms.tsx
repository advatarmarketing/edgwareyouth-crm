"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { createTask, type ActionState } from "./actions";
import { input, fieldLabel, button, secondaryButton } from "@/lib/ui";

const EMPTY: ActionState = { error: null, ok: null };

export function NewTaskForm({
  people,
  canAssign,
  meId,
}: {
  people: { id: string; full_name: string | null }[];
  canAssign: boolean;
  meId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createTask, EMPTY);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={button}>
        New task
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 520, marginBottom: 28 }}>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Title</span>
        <input name="title" required autoFocus style={input} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Notes</span>
        <textarea name="description" rows={2} style={{ ...input, resize: "vertical" }} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Steps</span>
        <textarea
          name="steps"
          rows={4}
          placeholder={"One per line. Bullets and numbering are stripped.\n- Call the masjid office\n- Confirm the price"}
          style={{ ...input, resize: "vertical" }}
        />
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>
          Each line becomes a tick-box. Indent a line to make it a sub-step.
        </span>
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 160px" }}>
          <span style={fieldLabel}>Due</span>
          <input type="date" name="due_date" style={input} />
        </label>

        <label style={{ display: "grid", gap: 5, flex: "1 1 120px" }}>
          <span style={fieldLabel}>Priority</span>
          <select name="priority" defaultValue="normal" style={input}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Owner</span>
        {canAssign ? (
          <select name="owner_id" defaultValue={meId} style={input}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
            ))}
          </select>
        ) : (
          // Without tasks.assign you can only make one for yourself.
          // The policy enforces it; this just does not offer otherwise.
          <input value="You" readOnly style={{ ...input, color: "var(--text-3)" }} />
        )}
      </label>

      {state.error && <p style={{ color: "var(--danger-fg)", margin: 0 }}>{state.error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={button}>Create</button>
        <button type="button" onClick={() => setOpen(false)} style={secondaryButton}>Cancel</button>
      </div>
    </form>
  );
}
