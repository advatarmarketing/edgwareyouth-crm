"use client";

import { useFormState, useFormStatus } from "react-dom";
import { button, fieldLabel, input, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;
type Person = { id: string; full_name: string | null };
type Priority = { id: string; number: number; title: string };

function Submit({ label, secondary = false }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={secondary ? secondaryButton : button}>
      {pending ? "Working…" : label}
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

function PeopleOptions({ people }: { people: Person[] }) {
  return (
    <>
      <option value="">Nobody yet</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
    </>
  );
}

export function GoalForm({
  year, people, priorities, action,
}: { year: number; people: Person[]; priorities: Priority[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="year" value={year} />
      <Label text="Goal"><input name="title" style={input} required /></Label>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Label text="Quarter">
          <select name="quarter" style={input}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </select>
        </Label>
        <Label text="Priority">
          <select name="priority_id" style={input}>
            <option value="">None</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.number}. {p.title}</option>)}
          </select>
        </Label>
        <Label text="Owner">
          <select name="owner_id" style={input}><PeopleOptions people={people} /></select>
        </Label>
      </div>
      <Label text="Detail"><textarea name="detail" rows={2} style={input} /></Label>
      <Message state={state} />
      <div><Submit label="Add goal" /></div>
    </form>
  );
}

export function ObjectiveForm({
  year, people, priorities, action,
}: { year: number; people: Person[]; priorities: Priority[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="year" value={year} />
      <Label text="Objective">
        <input name="title" style={input} placeholder="What are we actually trying to achieve?" required />
      </Label>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Label text="Priority it serves">
          <select name="priority_id" style={input}>
            <option value="">None</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.number}. {p.title}</option>)}
          </select>
        </Label>
        <Label text="Quarter">
          <select name="quarter" style={input}>
            <option value="">All year</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </select>
        </Label>
        <Label text="Owner">
          <select name="owner_id" style={input}><PeopleOptions people={people} /></select>
        </Label>
      </div>
      <Message state={state} />
      <div><Submit label="Add objective" /></div>
    </form>
  );
}

export function KeyResultForm({
  objectiveId, people, action,
}: { objectiveId: string; people: Person[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <input type="hidden" name="objective_id" value={objectiveId} />
      <Label text="Key result">
        <input name="title" style={input} placeholder="Something with a number on it" required />
      </Label>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
        <Label text="From"><input name="start_value" type="number" step="0.01" style={input} defaultValue={0} /></Label>
        <Label text="To"><input name="target_value" type="number" step="0.01" style={input} required /></Label>
        <Label text="Unit"><input name="unit" style={input} placeholder="people" /></Label>
        <Label text="Direction">
          <select name="direction" style={input}>
            <option value="up">Going up</option>
            <option value="down">Going down</option>
          </select>
        </Label>
        <Label text="Owner">
          <select name="owner_id" style={input}><PeopleOptions people={people} /></select>
        </Label>
      </div>
      <Message state={state} />
      <div><Submit label="Add key result" secondary /></div>
    </form>
  );
}

export function KpiValueForm({ kpiId, action }: { kpiId: string; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
      <input type="hidden" name="kpi_id" value={kpiId} />
      <Label text="Month"><input name="period" type="month" style={{ ...input, width: 150 }} required /></Label>
      <Label text="Value"><input name="value" type="number" step="0.01" style={{ ...input, width: 110 }} required /></Label>
      <Label text="Note"><input name="note" style={{ ...input, width: 180 }} /></Label>
      <Submit label="Record" secondary />
      <Message state={state} />
    </form>
  );
}

export function RefreshKpisForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Label text="Month"><input name="period" type="month" style={{ ...input, width: 150 }} /></Label>
      <Submit label="Recalculate" />
      <Message state={state} />
    </form>
  );
}
