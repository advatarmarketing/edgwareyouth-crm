"use client";

import { useFormState } from "react-dom";
import { savePermissions, type ActionState } from "../actions";
import type { Permission, PermissionKey } from "@/lib/supabase/types";

const EMPTY: ActionState = { error: null, ok: null };

export function PermissionsForm({
  profileId,
  permissions,
  defaults,
  overrides,
}: {
  profileId: string;
  permissions: Permission[];
  /** Keys this person's tier grants, before any override. */
  defaults: PermissionKey[];
  overrides: Record<string, boolean>;
}) {
  const [state, action] = useFormState(savePermissions, EMPTY);
  const inherited = new Set(defaults);

  const byCategory = new Map<string, Permission[]>();
  for (const p of permissions) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return (
    <form action={action}>
      <input type="hidden" name="profile_id" value={profileId} />

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 10px" }}>{category}</h2>

          <div style={{ display: "grid", gap: 8 }}>
            {items.map((p) => {
              const current =
                p.key in overrides ? (overrides[p.key] ? "allow" : "deny") : "default";
              const tierGives = inherited.has(p.key);

              return (
                <div
                  key={p.key}
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    padding: "11px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ minWidth: 220, flex: "1 1 260px" }}>
                    <div style={{ fontSize: 14 }}>{p.label}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
                      {p.description ? `${p.description} ` : ""}
                      Their tier {tierGives ? "gives" : "does not give"} this.
                    </div>
                  </div>

                  <select name={`perm:${p.key}`} defaultValue={current} style={select}>
                    <option value="default">Default ({tierGives ? "on" : "off"})</option>
                    <option value="allow">Always on</option>
                    <option value="deny">Always off</option>
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div style={{ position: "sticky", bottom: 0, padding: "14px 0", background: "var(--bg)" }}>
        <button type="submit" style={button}>Save permissions</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

const select = {
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontSize: 13,
} as const;

const button = {
  padding: "10px 18px",
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
