"use client";

import { useFormState, useFormStatus } from "react-dom";
import { button, fieldLabel, input, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

function Submit({ label, secondary = false }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={secondary ? secondaryButton : button}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function Message({ state }: { state: ActionState }) {
  if (state.error) return <p style={{ color: "var(--danger, #c0392b)", fontSize: 13, margin: 0 }}>{state.error}</p>;
  if (state.ok) return <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>{state.ok}</p>;
  return null;
}

function Label({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={fieldLabel}>{text}</span>
      {children}
    </label>
  );
}

export function ContentItemForm({
  platforms, pillars, people, action,
}: {
  platforms: { platform: string }[];
  pillars: { id: string; name: string }[];
  people: { id: string; full_name: string | null }[];
  action: Action;
}) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <Label text="The post"><input name="title" style={input} required /></Label>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <Label text="When"><input name="planned_for" type="date" style={input} required /></Label>
        <Label text="Where">
          <select name="platform" style={input}>
            {platforms.map((p) => <option key={p.platform} value={p.platform}>{p.platform}</option>)}
          </select>
        </Label>
        <Label text="Pillar">
          <select name="pillar_id" style={input}>
            <option value="">None</option>
            {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Label>
        <Label text="Who">
          <select name="owner_id" style={input}>
            <option value="">Nobody yet</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
          </select>
        </Label>
      </div>
      <Message state={state} />
      <div><Submit label="Add to the calendar" /></div>
    </form>
  );
}

export function MediaReviewForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <Label text="Month"><input name="month" type="month" style={input} required /></Label>
        <Label text="Followers"><input name="followers" type="number" style={input} /></Label>
        <Label text="Reach"><input name="reach" type="number" style={input} /></Label>
        <Label text="Posts"><input name="posts" type="number" style={input} /></Label>
        <Label text="Engagement"><input name="engagement" type="number" style={input} /></Label>
      </div>
      <Label text="What worked"><textarea name="what_worked" rows={2} style={input} /></Label>
      <Label text="What did not"><textarea name="what_did_not" rows={2} style={input} /></Label>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.6 }}>
        The follower count moves the KPI with it, marked as typed in — so a recalculation
        will not overwrite what you read off the screen.
      </p>
      <Message state={state} />
      <div><Submit label="Save the review" /></div>
    </form>
  );
}

export function StatusPicker({
  id, status, onChange,
}: {
  id: string;
  status: string;
  onChange: (id: string, status: string) => Promise<{ error?: string }>;
}) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => { void onChange(id, e.target.value); }}
      style={{ ...input, width: "auto", padding: "3px 6px", fontSize: 12 }}
    >
      <option value="idea">Idea</option>
      <option value="planned">Planned</option>
      <option value="posted">Posted</option>
      <option value="dropped">Dropped</option>
    </select>
  );
}
