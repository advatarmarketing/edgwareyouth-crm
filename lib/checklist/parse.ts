/**
 * The checklist engine — parsing half.
 *
 * Lifted from the Advatar CRM, where the same two rules were buried in
 * a client component and a server action respectively:
 *
 *   - components/ResourceChecklistEditor.tsx  (line -> step)
 *   - app/app/settings/templates/actions.ts   (line -> step + offset)
 *
 * They are pure string handling with no database in them, so they live
 * here as plain functions. SOPs (spec 4.5), meetings (4.6), events
 * (4.8) and tasks (4.4) all call these rather than each growing their
 * own slightly different splitter — which is the whole point of
 * section 4.1.
 *
 * Nothing here touches Supabase. That is deliberate: it is what makes
 * these testable without a database, and it is why the meeting parser
 * in Prompt 4a can build directly on top.
 */

/** A leading bullet (-, *, •) or numbering (1. or 1)) and its space. */
const LEADING_MARKER = /^\s*(?:[-*•]|\d+[.)])\s*/;

/** Leading whitespace, used to tell a sub-step from a top-level one. */
const LEADING_SPACE = /^(\s*)/;

export interface ParsedStep {
  text: string;
  /** 0 for a top-level step, 1+ for an indented sub-step. */
  depth: number;
  position: number;
}

/**
 * A pasted block becomes one step per line, with bullet characters and
 * numbering stripped — that is how the text arrives out of a document.
 *
 * Blank lines are dropped rather than becoming empty steps. Indentation
 * is preserved as `depth` (every 2 spaces, or 1 tab, is one level) so a
 * caller that cares about sub-steps has it, and a caller that doesn't
 * can ignore it.
 */
export function parseChecklistLines(input: string): ParsedStep[] {
  const steps: ParsedStep[] = [];

  for (const raw of input.split("\n")) {
    const indent = (LEADING_SPACE.exec(raw)?.[1] ?? "").replace(/\t/g, "  ");
    const text = raw.replace(LEADING_MARKER, "").trim();
    if (!text) continue;

    steps.push({
      text,
      depth: Math.floor(indent.length / 2),
      position: steps.length,
    });
  }

  return steps;
}

export interface ParsedTemplateItem {
  text: string;
  /**
   * Days before the anchor date that this task is due.
   *
   * The Advatar CRM counted forward from a client's start date. Events
   * (spec 4.8) count BACKWARDS from the event date, which is the same
   * number with the subtraction the other way round — the parser does
   * not need to know which, and deliberately doesn't.
   */
  offset_days: number;
  position: number;
}

/**
 * Template lines, written one per line as `task text | days`.
 *
 * A missing, non-numeric or negative offset becomes 0 rather than an
 * error. That is the Advatar behaviour and it is the right one here:
 * somebody typing a template into a textarea should get a task dated
 * on the anchor day, not a rejected form and a lost draft.
 */
export function parseTemplateLines(input: string): ParsedTemplateItem[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [text, offsetRaw] = line.split("|").map((part) => part.trim());
      const offset = Number(offsetRaw);

      return {
        text: text ?? "",
        offset_days: Number.isFinite(offset) && offset >= 0 ? Math.round(offset) : 0,
        position: index,
      };
    })
    .filter((item) => item.text.length > 0);
}

/**
 * Where a checklist came from. Every checklist records this and links
 * back — spec 4.1. `manual` is someone typing one straight in.
 */
export type ChecklistSource = "sop" | "meeting" | "event" | "okr" | "manual";
