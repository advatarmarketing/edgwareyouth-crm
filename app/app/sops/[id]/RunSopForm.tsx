"use client";

import { useFormState } from "react-dom";
import { runSop, type ActionState } from "../actions";
import { input, fieldLabel, button } from "@/lib/ui";

const EMPTY: ActionState = { error: null, ok: null };

export function RunSopForm({
  sopId,
  people,
  meId,
  canAssign,
}: {
  sopId: string;
  people: { id: string; full_name: string | null }[];
  meId: string;
  canAssign: boolean;
}) {
  const [state, action] = useFormState(runSop, EMPTY);

  return (
    <form action={action} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="sop_id" value={sopId} />

      <label style={{ display: "grid", gap: 5, flex: "1 1 200px" }}>
        <span style={fieldLabel}>Who</span>
        {canAssign ? (
          <select name="owner_id" defaultValue={meId} style={input}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
            ))}
          </select>
        ) : (
          <input value="You" readOnly style={{ ...input, color: "var(--text-3)" }} />
        )}
      </label>

      <label style={{ display: "grid", gap: 5, flex: "1 1 150px" }}>
        <span style={fieldLabel}>Due</span>
        <input type="date" name="due_date" style={input} />
      </label>

      <button type="submit" style={button}>Run this SOP</button>

      {state.error && <span style={{ color: "var(--danger-fg)" }}>{state.error}</span>}
      {state.ok && <span style={{ color: "var(--ok-fg)" }}>{state.ok}</span>}
    </form>
  );
}
