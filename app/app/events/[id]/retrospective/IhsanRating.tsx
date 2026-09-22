"use client";

import { useState } from "react";
import type { IhsanDimension } from "@/lib/supabase/types";

const LABEL: Record<IhsanDimension, string> = {
  emotional: "The feeling",
  sight: "Sight",
  sound: "Sound",
  smell: "Smell",
  taste: "Taste",
  touch: "Touch",
  personal: "Personal touches",
};

const HINT: Record<IhsanDimension, string> = {
  emotional: "Did the peak moment land? Did anyone leave changed?",
  sight: "The room as they first saw it.",
  sound: "Recitation, acoustics, the silence.",
  smell: "The air, the toilets, the food.",
  taste: "What was offered, and when.",
  touch: "Warmth, seating, the welcome at the door.",
  personal: "Were people known by name, and followed up?",
};

/**
 * Scored after, not planned before.
 *
 * Ihsan is not a box you tick on the way in; it is a judgement about
 * how the night actually felt, and the only honest moment to make it
 * is once it is over. Scores here are what make six events comparable
 * — the point at which "we always forget the smell" stops being a
 * feeling and becomes a number somebody can act on.
 */
export function IhsanRating({
  initiativeId,
  dimensions,
  mine,
  onRate,
}: {
  initiativeId: string;
  dimensions: IhsanDimension[];
  mine: Record<string, number>;
  onRate: (initiativeId: string, dimension: string, score: number) => Promise<{ error?: string }>;
}) {
  const [scores, setScores] = useState<Record<string, number>>(mine);
  const [error, setError] = useState<string | null>(null);

  async function pick(dimension: string, score: number) {
    const previous = scores[dimension];
    setScores((s) => ({ ...s, [dimension]: score }));
    const result = await onRate(initiativeId, dimension, score);
    if (result?.error) {
      setError(result.error);
      setScores((s) => ({ ...s, [dimension]: previous }));
    } else {
      setError(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {dimensions.map((d) => (
        <div key={d}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: 14, color: "var(--text-1)" }}>{LABEL[d]}</strong>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{HINT[d]}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = (scores[d] ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pick(d, n)}
                    aria-label={`${LABEL[d]}: ${n} out of 5`}
                    style={{
                      width: 30, height: 30, cursor: "pointer",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                      background: on ? "var(--accent)" : "var(--surface)",
                      color: on ? "var(--accent-fg)" : "var(--text-3)",
                      fontFamily: "var(--font-mono)", fontSize: 12,
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      {error && <p style={{ color: "var(--danger, #c0392b)", fontSize: 13 }}>{error}</p>}
    </div>
  );
}
