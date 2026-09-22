"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { button, fieldLabel, input, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;
type Fund = { id: string; name: string; kind: string };
type Person = { id: string; full_name: string | null };

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

export function RecordTransactionForm({ funds, people, action }: { funds: Fund[]; people: Person[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  const [source, setSource] = useState("other");

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Label text="Fund">
          <select name="fund_id" style={input}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Label>
        <Label text="In or out">
          <select name="direction" style={input}>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </Label>
        <Label text="Amount (£)"><input name="amount" type="number" step="0.01" min="0.01" style={input} required /></Label>
        <Label text="Date"><input name="occurred_on" type="date" style={input} defaultValue={new Date().toISOString().slice(0, 10)} /></Label>
      </div>

      <Label text="Where it came from">
        <select name="source" value={source} onChange={(e) => setSource(e.target.value)} style={input}>
          <option value="other">Other</option>
          <option value="standing_order">Standing order</option>
          <option value="business_donor">Local business</option>
          <option value="campaign">Campaign</option>
          <option value="collection">Mosque collection</option>
          <option value="card_machine">Card machine</option>
          <option value="event">Event</option>
          <option value="grant">Grant</option>
          <option value="pledge">Member pledge</option>
        </select>
      </Label>

      {source === "collection" && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Label text="Counted by">
            <select name="counted_by_1" style={input} required>
              <option value="">Pick someone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
            </select>
          </Label>
          <Label text="And by">
            <select name="counted_by_2" style={input} required>
              <option value="">Pick someone else</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>)}
            </select>
          </Label>
        </div>
      )}
      {source === "collection" && (
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
          Two different people, both named. A collection counted by one person is not counted.
        </p>
      )}

      <Label text="What it was">
        <input name="description" style={input} placeholder="Friday collection, 12 September" />
      </Label>

      <Message state={state} />
      <div><Submit label="Record it" /></div>
    </form>
  );
}

export function TransferForm({ funds, action }: { funds: Fund[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  const [from, setFrom] = useState(funds[0]?.id ?? "");
  const fromFund = funds.find((f) => f.id === from);

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Label text="From">
          <select name="from_fund_id" value={from} onChange={(e) => setFrom(e.target.value)} style={input}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Label>
        <Label text="To">
          <select name="to_fund_id" style={input}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Label>
      </div>
      <Label text="Amount (£)"><input name="amount" type="number" step="0.01" min="0.01" style={input} required /></Label>
      <Label text="Why"><input name="reason" style={input} /></Label>

      {fromFund?.kind === "zakat" && (
        <p style={{ fontSize: 13, color: "var(--accent)", margin: 0, lineHeight: 1.6 }}>
          Zakat can only move to another zakat fund. The database refuses anything else —
          this is not a setting anyone can change here.
        </p>
      )}

      <Message state={state} />
      <div><Submit label="Move it" secondary /></div>
    </form>
  );
}

export function ClaimForm({ funds, action }: { funds: Fund[]; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Label text="Amount (£)"><input name="amount" type="number" step="0.01" min="0.01" style={input} required /></Label>
        <Label text="When you spent it"><input name="spent_on" type="date" style={input} defaultValue={new Date().toISOString().slice(0, 10)} /></Label>
      </div>
      <Label text="What it was for">
        <input name="description" style={input} placeholder="Dates and water for Friday" required />
      </Label>
      <Label text="Fund">
        <select name="fund_id" style={input}>
          <option value="">Not sure</option>
          {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Label>
      <Label text="Receipt">
        <input name="receipt" type="file" accept="image/*,application/pdf" style={{ ...input, padding: 7 }} />
      </Label>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.6 }}>
        Never put a card or account number in the description. The system refuses to store one,
        and somebody will pay you the way they always do.
      </p>
      <Message state={state} />
      <div><Submit label="Submit the claim" /></div>
    </form>
  );
}

export function DecideClaimForm({ id, action }: { id: string; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <input name="decision_note" style={input} placeholder="A note, or the reason if you are rejecting it" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" name="decision" value="approved" style={button}>Approve</button>
        <button type="submit" name="decision" value="paid" style={secondaryButton}>Mark paid</button>
        <button type="submit" name="decision" value="rejected" style={secondaryButton}>Reject</button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function PledgeMonthForm({ pledgeId, action }: { pledgeId: string; action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
      <input type="hidden" name="pledge_id" value={pledgeId} />
      <Label text="Month"><input name="month" type="month" style={{ ...input, width: 150 }} required /></Label>
      <Label text="Status">
        <select name="status" style={{ ...input, width: 130 }}>
          <option value="paid">Paid</option>
          <option value="missed">Missed</option>
          <option value="partial">Part paid</option>
          <option value="waived">Waived</option>
        </select>
      </Label>
      <Label text="If part paid"><input name="amount_paid" type="number" step="0.01" style={{ ...input, width: 110 }} /></Label>
      <Submit label="Record" secondary />
      <Message state={state} />
    </form>
  );
}

export function DonorForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Label text="Name"><input name="name" style={input} required /></Label>
        <Label text="How to reach them"><input name="contact" style={input} /></Label>
        <Label text="Approached on"><input name="approached_on" type="date" style={input} /></Label>
        <Label text="Follow up on"><input name="next_follow_up" type="date" style={input} /></Label>
        <Label text="Pledged (£)"><input name="pledged_amount" type="number" step="0.01" style={input} /></Label>
        <Label text="Received (£)"><input name="received_amount" type="number" step="0.01" style={input} /></Label>
      </div>
      <Label text="Notes"><textarea name="notes" rows={2} style={input} /></Label>
      <Message state={state} />
      <div><Submit label="Add" /></div>
    </form>
  );
}
