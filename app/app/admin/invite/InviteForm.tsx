"use client";

import { useFormState } from "react-dom";
import { inviteMember, type ActionState } from "../actions";

const EMPTY: ActionState = { error: null, ok: null };

export function InviteForm() {
  const [state, action] = useFormState(inviteMember, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 14, maxWidth: 460 }}>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={label}>Email</span>
        <input name="email" type="email" required style={input} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={label}>Name</span>
        <input name="full_name" style={input} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={label}>Tier</span>
        <select name="tier" defaultValue="" style={input}>
          <option value="">None (Ansar only)</option>
          <option value="shura">Shura</option>
          <option value="sabiqun">Sabiqun</option>
          <option value="muhsinun">Muhsinun</option>
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" name="is_ansar" />
        Ansar badge
      </label>

      <div>
        <button type="submit" style={button}>Send invite</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

const input = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontSize: 14,
  width: "100%",
} as const;

const label = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
} as const;

const button = {
  padding: "9px 16px",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--accent-fg)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  cursor: "pointer",
} as const;
