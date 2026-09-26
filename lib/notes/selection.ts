import { parseChecklistLines } from "@/lib/checklist/parse";

/**
 * Turning part of a note into a to-do list.
 *
 * Pure and Supabase-free, like the other parsers, so the one decision
 * that is easy to get subtly wrong — what exactly "the selected
 * section" is — can be tested without a database.
 *
 * The rule: a selection is widened to WHOLE LINES. Nobody means to turn
 * "ring the ven" into a to-do and leave "ue" behind in the prose; if the
 * highlight touches a line, the whole line is the item.
 */

export interface TodoItem {
  text: string;
  depth: number;
  done: boolean;
}

export interface SplitResult {
  before: string;
  items: TodoItem[];
  after: string;
}

/** "[ ]", "[x]", "[X]" at the start of an item, after any bullet. */
const TICK_BOX = /^\[\s*([xX]?)\s*\]\s*/;

export function splitForTodo(body: string, selectionStart: number, selectionEnd: number): SplitResult {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, body.length));
  const end = Math.min(body.length, Math.max(selectionStart, selectionEnd));

  // Widen to the start of the first touched line...
  const lineStart = body.lastIndexOf("\n", start - 1) + 1;

  // ...and the end of the last. A selection that stops exactly at the
  // start of a line (triple-click does this) has not really touched
  // that line, so it is not dragged in.
  const effectiveEnd = end > start && body[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = body.indexOf("\n", effectiveEnd);
  const lineEnd = nextBreak === -1 ? body.length : nextBreak;

  const selected = body.slice(lineStart, lineEnd);

  const items: TodoItem[] = parseChecklistLines(selected).map((step) => {
    const tick = TICK_BOX.exec(step.text);
    return {
      text: tick ? step.text.slice(tick[0].length).trim() : step.text,
      depth: step.depth,
      done: tick ? tick[1] !== "" : false,
    };
  }).filter((item) => item.text !== "");

  return {
    before: body.slice(0, lineStart).replace(/\n+$/, ""),
    items,
    after: body.slice(lineEnd).replace(/^\n+/, ""),
  };
}
