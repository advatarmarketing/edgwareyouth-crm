/**
 * Date phrases a minute-taker actually writes, resolved against the
 * meeting date.
 *
 * Every function here takes the reference date as a REQUIRED argument.
 * That is the whole point: notes are routinely pasted in days after
 * the meeting, and resolving "Friday" against today rather than
 * against the meeting would silently move every relative deadline. It
 * cannot be defaulted to `new Date()`, because a default is exactly
 * how that bug gets reintroduced.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

export interface FoundDate {
  /** ISO yyyy-mm-dd, which is what a Postgres DATE column wants. */
  date: string;
  /** Exactly the text that was recognised, so the caller can cut it out. */
  matched: string;
}

/**
 * Finds a date in a line and returns it with the text that produced it.
 *
 * Returns null rather than guessing. A task with no due date is a
 * problem the review screen makes somebody fix; a task with a wrong
 * due date is one nobody notices.
 */
export function findDate(line: string, meetingDate: Date): FoundDate | null {
  // Anything after "by" is far more likely to be the deadline than a
  // date mentioned in passing ("the Seerah night on 3 Oct ... by 12/10"),
  // so that half of the line is searched first.
  const byIndex = line.toLowerCase().lastIndexOf(" by ");
  if (byIndex !== -1) {
    const found = scan(line.slice(byIndex + 4), meetingDate);
    if (found) return found;
  }

  return scan(line, meetingDate);
}

function scan(text: string, meetingDate: Date): FoundDate | null {
  // 12/10, 12-10, 12/10/26, 12/10/2026 — day first, always. This is a
  // UK organisation; 03/04 is the third of April and never March 4th.
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = numeric[3] ? normaliseYear(Number(numeric[3])) : inferYear(day, month, meetingDate);
    const iso = build(year, month, day);
    if (iso) return { date: iso, matched: numeric[0] };
  }

  // 12 Oct, 12th October, 3rd Nov 2026
  const worded = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?\b/i.exec(text);
  if (worded) {
    const month = MONTHS[worded[2].toLowerCase()];
    if (month) {
      const day = Number(worded[1]);
      const year = worded[3] ? Number(worded[3]) : inferYear(day, month, meetingDate);
      const iso = build(year, month, day);
      if (iso) return { date: iso, matched: worded[0] };
    }
  }

  // October 12th
  const monthFirst = /\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (month) {
      const day = Number(monthFirst[2]);
      const iso = build(inferYear(day, month, meetingDate), month, day);
      if (iso) return { date: iso, matched: monthFirst[0] };
    }
  }

  if (/\btomorrow\b/i.test(text)) {
    return { date: addDays(meetingDate, 1), matched: "tomorrow" };
  }

  if (/\btoday\b/i.test(text)) {
    return { date: toIso(meetingDate), matched: "today" };
  }

  // "next Friday" and bare "Friday" both resolve to the next occurrence
  // strictly after the meeting date.
  //
  // "next Friday" is genuinely ambiguous in British usage — plenty of
  // people mean the Friday of the following week. Rather than guess at
  // which, both are treated the same and the review screen shows the
  // resolved calendar date before anything is published, so a
  // minute-taker who meant the other one can see that and change it.
  // Showing the phrase back instead of the date would hide exactly the
  // mistake this is most likely to make.
  const weekday = /\b(?:next\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i.exec(text);
  if (weekday) {
    const target = WEEKDAYS[weekday[1].toLowerCase()];
    return { date: nextWeekday(meetingDate, target), matched: weekday[0] };
  }

  return null;
}

/**
 * A day and month with no year: the next time that date comes round.
 *
 * A meeting in December that says "by 5 Jan" means the January weeks
 * away, not the one eleven months gone. Anything on or after the
 * meeting date stays in the meeting's year; anything before it rolls
 * forward.
 */
function inferYear(day: number, month: number, meetingDate: Date): number {
  const year = meetingDate.getFullYear();
  const candidate = new Date(year, month - 1, day);
  return candidate < startOfDay(meetingDate) ? year + 1 : year;
}

function normaliseYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

/** Rejects impossible dates rather than letting Date roll them over. */
function build(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toIso(date);
}

function nextWeekday(from: Date, target: number): string {
  const start = startOfDay(from);
  const ahead = (target - start.getDay() + 7) % 7 || 7;
  return addDays(start, ahead);
}

function addDays(from: Date, days: number): string {
  const date = startOfDay(from);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Local calendar date as yyyy-mm-dd.
 *
 * Deliberately not toISOString(), which converts to UTC first and
 * hands back the previous day for anything after midnight in BST.
 */
export function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
