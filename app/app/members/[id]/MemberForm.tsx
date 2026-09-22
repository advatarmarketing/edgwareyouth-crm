"use client";

import { useFormState } from "react-dom";
import { updateMember, addNote, type ActionState } from "../actions";
import type { MemberDirectoryRow, Position, Team, TeamKey } from "@/lib/supabase/types";
import { POSITION_LABELS } from "@/lib/members";

const EMPTY: ActionState = { error: null, ok: null };

export function MemberForm({
  member,
  teams,
  memberTeams,
}: {
  member: MemberDirectoryRow;
  teams: Team[];
  memberTeams: TeamKey[];
}) {
  const [state, action] = useFormState(updateMember, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <input type="hidden" name="id" value={member.id} />

      <Field label="Name"><input name="full_name" defaultValue={member.full_name ?? ""} style={input} /></Field>
      <Field label="Nickname" hint="Used to match @names in meeting notes.">
        <input name="nickname" defaultValue={member.nickname ?? ""} style={input} />
      </Field>
      <Field label="Phone"><input name="phone" defaultValue={member.phone ?? ""} style={input} /></Field>

      <Field label="Tier" hint="Leave as “None” for someone who is Ansar only.">
        <select name="tier" defaultValue={member.tier ?? ""} style={input}>
          <option value="">None (Ansar only)</option>
          <option value="shura">Shura</option>
          <option value="sabiqun">Sabiqun</option>
          <option value="muhsinun">Muhsinun</option>
        </select>
      </Field>

      <Check name="is_ansar" label="Ansar badge" defaultChecked={member.is_ansar} />

      <Field label="Position">
        <select name="position" defaultValue={member.position ?? ""} style={input}>
          <option value="">None</option>
          {(Object.keys(POSITION_LABELS) as Position[]).map((p) => (
            <option key={p} value={p}>{POSITION_LABELS[p]}</option>
          ))}
        </select>
      </Field>

      <Field label="Teams">
        <div style={{ display: "grid", gap: 6 }}>
          {teams.map((t) => (
            <label key={t.key} style={row}>
              <input type="checkbox" name="teams" value={t.key} defaultChecked={memberTeams.includes(t.key)} />
              {t.name}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Skills" hint="Comma separated — camera, design, cooking, driving, first aid, speaking.">
        <input name="skills" defaultValue={(member.skills ?? []).join(", ")} style={input} />
      </Field>

      <Field label="Availability"><input name="availability" defaultValue={member.availability ?? ""} style={input} /></Field>

      <Field label="DBS">
        <select name="dbs_status" defaultValue={member.dbs_status ?? ""} style={input}>
          <option value="">Not recorded</option>
          <option value="none">None</option>
          <option value="applied">Applied</option>
          <option value="valid">Valid</option>
        </select>
      </Field>
      <Field label="DBS expiry"><input type="date" name="dbs_expiry" defaultValue={member.dbs_expiry ?? ""} style={input} /></Field>

      <Check name="first_aid_trained" label="First aid trained" defaultChecked={member.first_aid_trained} />
      <Field label="First aid expiry"><input type="date" name="first_aid_expiry" defaultValue={member.first_aid_expiry ?? ""} style={input} /></Field>

      <Field label="Date joined"><input type="date" name="date_joined" defaultValue={member.date_joined ?? ""} style={input} /></Field>

      <Check name="is_active" label="Active" defaultChecked={member.is_active} />

      <div>
        <button type="submit" style={button}>Save</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

export function NoteForm({ profileId }: { profileId: string }) {
  const [state, action] = useFormState(addNote, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <textarea name="body" rows={3} placeholder="Private note — shura only" style={{ ...input, resize: "vertical" }} />
      <div>
        <button type="submit" style={button}>Add note</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <span style={{ color: "var(--text-3)", fontSize: 12 }}>{hint}</span>}
    </label>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label style={row}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
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

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
} as const;

const row = { display: "flex", alignItems: "center", gap: 8, fontSize: 14 } as const;

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
