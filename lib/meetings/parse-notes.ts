import { findDate } from "./dates";

/**
 * Turns pasted meeting notes into actions, decisions and a pile of
 * lines it could not resolve.
 *
 * No AI, no external API. Actions come from structure alone — the
 * minute-taker marks them, which is the one habit the team has to
 * learn (spec 4.6). This cannot read intent out of a conversation and
 * does not try.
 *
 * The rule the whole thing is built around: **nothing is ever guessed
 * and nothing is ever silently dropped.** A line that does not resolve
 * goes to `unmatched` with a reason, and the review screen makes a
 * person fix it. A parser that quietly assigns a task to the wrong
 * Yusuf is far worse than one that asks.
 */

export interface ParserMember {
  id: string;
  fullName: string | null;
  nickname: string | null;
}

export interface ParsedAction {
  ownerId: string;
  ownerName: string;
  /** The action itself, with the @name and the date phrase removed. */
  text: string;
  /** yyyy-mm-dd. */
  dueDate: string;
  /** Indented lines beneath it, in order. */
  steps: string[];
  sourceLine: string;
}

export interface ParsedDecision {
  text: string;
  sourceLine: string;
}

export interface UnmatchedLine {
  line: string;
  reason: string;
  /** Present when a name matched more than one person. */
  candidates?: { id: string; name: string }[];
  /** Any indented lines that belonged to it, so they are not lost either. */
  steps?: string[];
}

export interface ParseResult {
  actions: ParsedAction[];
  decisions: ParsedDecision[];
  unmatched: UnmatchedLine[];
}

export interface ParseOptions {
  /**
   * What relative dates resolve against. REQUIRED, and never defaulted
   * to today — see lib/meetings/dates.ts. Notes pasted three days late
   * must still produce the dates the room agreed.
   */
  meetingDate: Date;
  members: ParserMember[];
}

const ACTION_LINE = /^\s*action\b\s*/i;
const DECISION_LINE = /^\s*decision\b\s*[:\-]?\s*/i;
const TODO_LINE = /^\s*[-*]?\s*\[\s*[xX ]?\s*\]\s*/;
const MENTION = /@([\p{L}][\p{L}'\-.]*)/u;

export function parseMeetingNotes(input: string, options: ParseOptions): ParseResult {
  const actions: ParsedAction[] = [];
  const decisions: ParsedDecision[] = [];
  const unmatched: UnmatchedLine[] = [];

  const lines = input.split("\n");

  // Where the sub-steps of whatever was last recognised should go. An
  // indented line belongs to the thing above it, so the parser has to
  // remember what that was — including when the thing above it failed,
  // so its steps travel to the review screen with it.
  let stepTarget: string[] | null = null;
  let baseIndent = 0;

  for (const raw of lines) {
    if (!raw.trim()) {
      // A blank line does not end a block — people leave them between
      // an action and its steps all the time.
      continue;
    }

    const indent = indentWidth(raw);
    const line = raw.trim();

    // An indented line under something recognised is one of its steps.
    if (stepTarget && indent > baseIndent) {
      const text = line.replace(/^(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (text) stepTarget.push(text);
      continue;
    }

    stepTarget = null;

    if (DECISION_LINE.test(line)) {
      const text = line.replace(DECISION_LINE, "").trim();
      if (text) {
        decisions.push({ text, sourceLine: line });
      } else {
        unmatched.push({ line, reason: "A DECISION line with nothing after it." });
      }
      continue;
    }

    const isAction = ACTION_LINE.test(line);
    const isTodo = TODO_LINE.test(line);

    if (!isAction && !isTodo) {
      // Ordinary prose. Not an error and not reported — the notes are
      // mostly prose and flagging every sentence would bury the lines
      // that genuinely need attention.
      continue;
    }

    // A to-do line only counts as an action if it names somebody.
    // Notion exports are full of unassigned checkboxes and turning
    // those into tasks for nobody helps no one.
    const body = isAction ? line.replace(ACTION_LINE, "").replace(/^[:\-]\s*/, "") : line.replace(TODO_LINE, "");

    if (isTodo && !MENTION.test(body)) continue;

    const result = readAction(body, line, options);

    if ("action" in result) {
      actions.push(result.action);
      stepTarget = result.action.steps;
    } else {
      unmatched.push(result.unmatched);
      // Its steps still have somewhere to go, so the minute-taker sees
      // the whole block on the review screen rather than a bare line.
      result.unmatched.steps = [];
      stepTarget = result.unmatched.steps;
    }

    baseIndent = indent;
  }

  return { actions, decisions, unmatched };
}

function readAction(
  body: string,
  sourceLine: string,
  options: ParseOptions
): { action: ParsedAction } | { unmatched: UnmatchedLine } {
  const mention = MENTION.exec(body);

  if (!mention) {
    return { unmatched: { line: sourceLine, reason: "No @name, so there is nobody to give it to." } };
  }

  const typed = mention[1];
  const matches = matchMembers(typed, options.members);

  if (matches.length === 0) {
    return { unmatched: { line: sourceLine, reason: `Nobody here is called "${typed}".` } };
  }

  if (matches.length > 1) {
    // Deliberately not resolved. Two people called Yusuf is exactly the
    // case where a guess creates a task that the wrong person ignores
    // and the right person never sees.
    return {
      unmatched: {
        line: sourceLine,
        reason: `More than one person matches "${typed}".`,
        candidates: matches.map((m) => ({ id: m.id, name: displayName(m) })),
      },
    };
  }

  const found = findDate(body, options.meetingDate);

  if (!found) {
    return { unmatched: { line: sourceLine, reason: "No date on it, so there is nothing to chase." } };
  }

  let text = body
    .replace(mention[0], "")
    .replace(found.matched, "")
    .replace(/^[\s:\-–]+/, "")
    .replace(/\s+by\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s,;:]+$/, "");

  if (!text) text = "(no description)";

  return {
    action: {
      ownerId: matches[0].id,
      ownerName: displayName(matches[0]),
      text,
      dueDate: found.date,
      steps: [],
      sourceLine,
    },
  };
}

/**
 * Who a typed @name refers to.
 *
 * Nickname, first name, last name and full name all count, because
 * people write whichever comes to hand. Every match is returned rather
 * than the first: the caller needs to know when there were two.
 */
function matchMembers(typed: string, members: ParserMember[]): ParserMember[] {
  const wanted = typed.toLowerCase().replace(/[.']/g, "");

  return members.filter((member) => {
    const names = new Set<string>();

    if (member.nickname) names.add(member.nickname.toLowerCase());

    if (member.fullName) {
      const full = member.fullName.toLowerCase();
      names.add(full);
      names.add(full.replace(/\s+/g, ""));
      for (const part of full.split(/\s+/)) names.add(part);
    }

    return [...names].some((name) => name.replace(/[.']/g, "") === wanted);
  });
}

function displayName(member: ParserMember): string {
  return member.fullName ?? member.nickname ?? "Unnamed";
}

function indentWidth(line: string): number {
  const leading = /^[ \t]*/.exec(line)?.[0] ?? "";
  return leading.replace(/\t/g, "  ").length;
}
