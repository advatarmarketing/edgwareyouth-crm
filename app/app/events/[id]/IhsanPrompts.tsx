import { EditableField } from "@/components/EditableField";
import { saveIhsanResponse } from "../actions";
import type { IhsanDimension, InitiativeIhsanPrompt } from "@/lib/supabase/types";

const DIMENSION_LABEL: Record<IhsanDimension, string> = {
  emotional: "Feeling",
  sight: "Sight",
  sound: "Sound",
  smell: "Smell",
  taste: "Taste",
  touch: "Touch",
  personal: "Personal",
};

/**
 * The ihsan prompts for one section of the file.
 *
 * Deliberately rendered INSIDE the section they belong to rather than
 * collected on a page of their own. A prompt about the smell of the
 * room is only useful while somebody is thinking about the room; on a
 * separate "Ihsan" tab it is read after the venue is booked, the
 * chairs are out and nothing can change.
 *
 * Each one takes a written answer rather than a tick. A checkbox
 * labelled "bukhoor" can be cleared without a thought. "Who is
 * lighting it, and when?" has to be answered with a name.
 */
export function IhsanPrompts({
  prompts,
  initiativeId,
  canEdit,
}: {
  prompts: InitiativeIhsanPrompt[];
  initiativeId: string;
  canEdit: boolean;
}) {
  if (prompts.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 14,
        paddingLeft: 12,
        borderLeft: "2px solid var(--accent-tint, #e6ecf4)",
        display: "grid",
        gap: 12,
      }}
    >
      {prompts.map((p) => (
        <div key={p.id}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--accent)",
              }}
            >
              {DIMENSION_LABEL[p.dimension]}
            </span>
            <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>{p.prompt}</span>
          </div>
          <div style={{ marginTop: 5 }}>
            {canEdit ? (
              <EditableField
                value={p.response ?? ""}
                onSave={saveIhsanResponse.bind(null, p.id, initiativeId)}
                as="textarea"
                placeholder="Answer it with a name and a time, not a yes."
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: p.response ? "var(--text-1)" : "var(--text-3)" }}>
                {p.response ?? "Not answered yet."}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
