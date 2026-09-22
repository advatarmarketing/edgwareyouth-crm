"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { button, fieldLabel, input, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

function Submit({ label, secondary = false }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={secondary ? secondaryButton : button}>
      {pending ? "Working…" : label}
    </button>
  );
}

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p style={{ color: "var(--danger, #c0392b)", fontSize: 13 }}>{state.error}</p>;
  if (state.ok) return <p style={{ color: "var(--text-2)", fontSize: 13 }}>{state.ok}</p>;
  return null;
}

export function CreateInitiativeForm({
  templates,
  people,
  action,
}: {
  templates: { id: string; name: string; description: string | null; weight: string; kind: string }[];
  people: { id: string; full_name: string | null }[];
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useFormState(action, EMPTY);
  const [picked, setPicked] = useState(templates[0]?.id ?? "");
  const chosen = templates.find((t) => t.id === picked);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabel}>What sort of thing</span>
        <select name="template_id" value={picked} onChange={(e) => setPicked(e.target.value)} style={input}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      {chosen?.description && (
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          {chosen.description}
          {chosen.weight === "light" && " The plan stays short on purpose."}
          {chosen.weight === "heavy" && " Every section of the file applies to this one."}
        </p>
      )}

      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabel}>Name it</span>
        <input name="title" style={input} placeholder="Seerah night — the year of sorrow" required />
      </label>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={fieldLabel}>Date</span>
          <input type="date" name="starts_on" style={input} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={fieldLabel}>Start time</span>
          <input type="time" name="starts_at" style={input} />
        </label>
      </div>

      <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
        The date matters more than it looks: every milestone is dated backwards from it.
      </p>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabel}>Who is leading it</span>
        <select name="lead_id" style={input} defaultValue="">
          <option value="">Me</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
          ))}
        </select>
      </label>

      <Message state={state} />
      <div><Submit label="Create" /></div>
    </form>
  );
}

export function StageForm({
  id,
  from,
  label,
  action,
  needsComment = false,
  secondary = false,
  placeholder,
}: {
  id: string;
  from?: string;
  label: string;
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  needsComment?: boolean;
  secondary?: boolean;
  placeholder?: string;
}) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      {from && <input type="hidden" name="from" value={from} />}
      {needsComment && (
        <textarea name="comment" rows={2} style={input} placeholder={placeholder ?? "What needs changing?"} />
      )}
      <Message state={state} />
      <div><Submit label={label} secondary={secondary} /></div>
    </form>
  );
}
