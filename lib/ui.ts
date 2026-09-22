/**
 * Shared inline style objects.
 *
 * The app styles with `style={}` rather than classes, following the
 * template. That is fine until the same eleven declarations appear in
 * six files and a change to the input border has to be made six times
 * — which is where these came from.
 *
 * Colours are always tokens, never hex. A hardcoded colour is the
 * classic "unreadable in dark mode" bug.
 */
export const input = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontSize: 14,
  width: "100%",
} as const;

export const fieldLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
} as const;

export const button = {
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

export const secondaryButton = {
  ...button,
  border: "1px solid var(--border-2)",
  background: "var(--surface)",
  color: "var(--text-1)",
} as const;

export const card = {
  padding: "14px 16px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface)",
} as const;

export const pageTitle = {
  fontFamily: "var(--font-display)",
  fontSize: 38,
  margin: 0,
} as const;

export const sectionTitle = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  margin: "0 0 12px",
} as const;
