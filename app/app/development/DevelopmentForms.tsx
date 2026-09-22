"use client";

import { useFormState, useFormStatus } from "react-dom";
import { button, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

function Submit({ label, secondary = false }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      style={{ ...(secondary ? secondaryButton : button), padding: "4px 10px", fontSize: 11 }}>
      {pending ? "…" : label}
    </button>
  );
}

export function MarkMilestoneForm({
  profileId, milestoneId, done, action,
}: { profileId: string; milestoneId: string; done: boolean; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="milestone_id" value={milestoneId} />
      <input type="hidden" name="done" value={done ? "false" : "true"} />
      <Submit label={done ? "Un-tick" : "Tick off"} secondary={done} />
      {state.error && <span style={{ color: "var(--danger, #c0392b)", fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}

export function RefreshForm({ action }: { action: (prev: ActionState) => Promise<ActionState> }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Submit label="Recount" />
      {state.ok && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{state.ok}</span>}
      {state.error && <span style={{ fontSize: 12, color: "var(--danger, #c0392b)" }}>{state.error}</span>}
    </form>
  );
}
