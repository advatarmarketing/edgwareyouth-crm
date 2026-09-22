"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useState } from "react";
import { button, fieldLabel, input, secondaryButton } from "@/lib/ui";
import type { ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

function Submit({ label, secondary = false }: { label: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={secondary ? secondaryButton : button}>
      {pending ? "Sending…" : label}
    </button>
  );
}

const TIERS = [
  { key: "shura", label: "Shura" },
  { key: "sabiqun", label: "Sabiqun" },
  { key: "muhsinun", label: "Muhsinun" },
  { key: "ansar", label: "Ansar" },
];

export function Composer({
  channelId,
  isAnnouncement,
  teams,
  action,
}: {
  channelId: string;
  isAnnouncement: boolean;
  teams: { key: string; name: string }[];
  action: Action;
}) {
  const [state, formAction] = useFormState(action, EMPTY);
  const [targeting, setTargeting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (data) => {
        await formAction(data);
        formRef.current?.reset();
        setTargeting(false);
      }}
      style={{ display: "grid", gap: 10 }}
    >
      <input type="hidden" name="channel_id" value={channelId} />
      <textarea
        name="body"
        rows={3}
        style={input}
        placeholder="Type @ and a name to mention somebody."
      />

      {isAnnouncement && (
        <div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-2)" }}>
            <input type="checkbox" checked={targeting} onChange={(e) => setTargeting(e.target.checked)} />
            Send to particular tiers or teams only
          </label>

          {targeting && (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div>
                <span style={fieldLabel}>Tiers</span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                  {TIERS.map((t) => (
                    <label key={t.key} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" name="tier" value={t.key} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span style={fieldLabel}>Teams</span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                  {teams.map((t) => (
                    <label key={t.key} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" name="team" value={t.key} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.6 }}>
                Tick nothing and it goes to everyone. Whoever you pick is who can see it —
                this is not a label on a message everybody gets.
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="attachment" style={{ ...input, padding: 6, width: "auto", flex: "1 1 200px" }} />
        <Submit label="Send" />
      </div>

      {state.error && <p style={{ color: "var(--danger, #c0392b)", fontSize: 13, margin: 0 }}>{state.error}</p>}
      {state.ok && state.ok !== "Sent." && (
        <p style={{ color: "var(--accent)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{state.ok}</p>
      )}
    </form>
  );
}

export function StartDmForm({
  people,
  action,
}: {
  people: { id: string; full_name: string | null }[];
  action: Action;
}) {
  const [state, formAction] = useFormState(action, EMPTY);
  return (
    <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Message somebody</span>
        <select name="profile_id" style={{ ...input, minWidth: 200 }}>
          <option value="">Pick a person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
          ))}
        </select>
      </label>
      <Submit label="Start" secondary />
      {state.error && <p style={{ color: "var(--danger, #c0392b)", fontSize: 13, margin: 0 }}>{state.error}</p>}
    </form>
  );
}

/**
 * Marks the channel read once the thread has actually been rendered.
 *
 * A button would be honest but nobody presses it, and marking on the
 * server while building the page would mark things read that the
 * person never saw — a redirect, a slow render they abandoned. Firing
 * after paint is the closest thing to "they had it on screen".
 */
export function MarkRead({
  channelId,
  onRead,
}: {
  channelId: string;
  onRead: (channelId: string) => Promise<{ error?: string }>;
}) {
  const fired = useRef(false);
  if (typeof window !== "undefined" && !fired.current) {
    fired.current = true;
    // Deliberately not awaited: the badge clearing is not worth
    // blocking anything the reader is trying to do.
    void onRead(channelId);
  }
  return null;
}
