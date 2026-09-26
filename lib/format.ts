/**
 * Shared formatting helpers.
 *
 * Money is GBP throughout this app (the client cards and dashboard
 * already hardcoded a £), so this centralises that rather than
 * spreading `£${n.toLocaleString()}` across every new screen.
 */

export function formatMoney(amount: number | null | undefined): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Today at 00:00 local time. Comparisons against a date-only column
 * need this rather than `new Date()`, or anything due *today* counts
 * as overdue from one minute past midnight onwards.
 */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d < startOfToday();
}

/** Whole days since `dateStr`, or null when there's no date. */
export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = startOfToday().getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * A moment as somebody in Edgware would read it: "26 Sep 2026, 09:12".
 *
 * The time zone is pinned to London rather than left to the machine.
 * Pages render on Vercel's servers, which run on UTC, so an unpinned
 * format shows every time an hour early for the half of the year the UK
 * is on BST — "updated 08:12" for something you changed at 09:12, which
 * is exactly the kind of small wrongness that makes people stop
 * trusting a timestamp.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
