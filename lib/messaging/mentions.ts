/**
 * Who a message is talking to.
 *
 * Pure and Supabase-free, like lib/meetings/parse-notes.ts, and it
 * follows the same rule as the meeting parser: NOTHING IS GUESSED.
 * "@Mo" matching three people notifies none of them and says so, and
 * a name nobody has is reported rather than dropped.
 *
 * The consequence of getting this wrong is smaller here than in the
 * minutes — a missed mention is a missed ping, not a lost action — but
 * the failure people actually notice is the opposite one: being
 * notified about things meant for somebody with a similar name. So
 * silence on ambiguity is the right default, provided the sender is
 * told.
 */

export interface MentionCandidate {
  id: string;
  fullName: string | null;
  nickname: string | null;
}

export interface MentionResult {
  /** Profile ids to notify. Each appears once, however many times named. */
  profileIds: string[];
  /** Tokens matching nobody — shown back to the sender. */
  unknown: string[];
  /** Tokens matching more than one person. Nobody is notified. */
  ambiguous: { token: string; candidates: string[] }[];
}

/**
 * @ followed by a letter, then letters, digits, apostrophes, hyphens
 * or dots. Unicode-aware so a name in Arabic script is a mention too.
 */
const MENTION = /@([\p{L}][\p{L}\p{N}'\-.]*)/gu;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Strip combining marks so "Yusuf" matches "Yūsuf".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Every string that could reasonably stand for this person. */
function handlesFor(person: MentionCandidate): string[] {
  const out: string[] = [];
  const full = person.fullName?.trim();
  if (full) {
    out.push(full);
    const parts = full.split(/\s+/);
    if (parts.length > 1) {
      out.push(parts[0]);
      out.push(parts[parts.length - 1]);
      out.push(parts.join(""));
    }
  }
  if (person.nickname?.trim()) out.push(person.nickname.trim());
  return out;
}

export function findMentions(body: string, people: MentionCandidate[]): MentionResult {
  const tokens: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    // A trailing full stop is sentence punctuation, not part of a name.
    tokens.push(match[1].replace(/\.+$/, ""));
  }

  const profileIds = new Set<string>();
  const unknown: string[] = [];
  const ambiguous: { token: string; candidates: string[] }[] = [];
  const seenTokens = new Set<string>();

  for (const token of tokens) {
    const key = normalise(token);
    if (!key || seenTokens.has(key)) continue;
    seenTokens.add(key);

    // An exact handle beats a prefix. Without this, "@Sam" would be
    // ambiguous between Sam and Samir even though one of them is
    // called exactly that.
    const exact = people.filter((p) => handlesFor(p).some((h) => normalise(h) === key));
    const matches =
      exact.length > 0
        ? exact
        : people.filter((p) => handlesFor(p).some((h) => normalise(h).startsWith(key)));

    if (matches.length === 0) {
      unknown.push(token);
    } else if (matches.length > 1) {
      ambiguous.push({
        token,
        candidates: matches.map((p) => p.fullName ?? "Unnamed"),
      });
    } else {
      profileIds.add(matches[0].id);
    }
  }

  return { profileIds: [...profileIds], unknown, ambiguous };
}
