"use client";

import { useFormState } from "react-dom";
import { saveSop, type ActionState } from "./actions";
import { input, fieldLabel, button } from "@/lib/ui";
import type { Sop, Team, TierKey } from "@/lib/supabase/types";

const EMPTY: ActionState = { error: null, ok: null };

const TIERS: { key: TierKey; label: string }[] = [
  { key: "shura", label: "Shura" },
  { key: "sabiqun", label: "Sabiqun" },
  { key: "muhsinun", label: "Muhsinun" },
  { key: "ansar", label: "Ansar (badge)" },
];

export function SopEditor({
  sop,
  steps,
  teams,
  visibleTiers,
  visibleTeams,
}: {
  sop: Sop | null;
  steps: string;
  teams: Team[];
  visibleTiers: TierKey[];
  visibleTeams: string[];
}) {
  const [state, action] = useFormState(saveSop, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 16, maxWidth: 680 }}>
      {sop && <input type="hidden" name="id" value={sop.id} />}

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Title</span>
        <input name="title" required defaultValue={sop?.title ?? ""} style={input} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Category</span>
        <input name="category" defaultValue={sop?.category ?? "General"} style={input} />
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>The written guide</span>
        <textarea name="body" rows={12} defaultValue={sop?.body ?? ""} style={{ ...input, resize: "vertical", lineHeight: 1.6 }} />
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>
          What someone reads to understand the job. The steps below are the doing-it version.
        </span>
      </label>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Steps</span>
        <textarea
          name="steps"
          rows={8}
          defaultValue={steps}
          placeholder={"One per line. Bullets and numbering are stripped.\nIndent a line to make it a sub-step."}
          style={{ ...input, resize: "vertical" }}
        />
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>
          These become the tick-box checklist. Editing them replaces it — nobody ticks the
          library copy, so there is no progress to lose.
        </span>
      </label>

      <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 14, margin: 0 }}>
        <legend style={{ ...fieldLabel, padding: "0 6px" }}>Who can see it</legend>

        <label style={row}>
          <input type="checkbox" name="visible_to_all" defaultChecked={sop?.visible_to_all ?? false} />
          Everyone
        </label>

        <p style={{ color: "var(--text-3)", fontSize: 12, margin: "8px 0 10px" }}>
          Or pick tiers and teams. Leaving everything unticked means only people with
          permission to manage SOPs can see it — which is what you want for a draft.
        </p>

        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {TIERS.map((tier) => (
            <label key={tier.key} style={row}>
              <input type="checkbox" name="tiers" value={tier.key} defaultChecked={visibleTiers.includes(tier.key)} />
              {tier.label}
            </label>
          ))}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {teams.map((team) => (
            <label key={team.key} style={row}>
              <input type="checkbox" name="teams" value={team.key} defaultChecked={visibleTeams.includes(team.key)} />
              {team.name} team
            </label>
          ))}
        </div>
      </fieldset>

      <label style={row}>
        <input type="checkbox" name="publish" defaultChecked={sop?.status === "published"} />
        Published (unticked means draft — only visible to SOP managers)
      </label>

      {state.error && <p style={{ color: "var(--danger-fg)", margin: 0 }}>{state.error}</p>}

      <div>
        <button type="submit" style={button}>Save</button>
      </div>
    </form>
  );
}

const row = { display: "flex", alignItems: "center", gap: 8, fontSize: 14 } as const;
