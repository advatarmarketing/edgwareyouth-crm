/**
 * Where a signed-in person lands.
 *
 * The Advatar CRM had a HOME_BY_ROLE map repeated in three files,
 * because a client, a videographer and the CEO each worked in a
 * different part of the app. Edgware Youth is staff-only (spec section
 * 9 of Part A's preamble: "No parents, participants or public log in"),
 * so there is one home for everybody and the differences are *inside*
 * the dashboard rather than in the routing.
 *
 * Access differences between tiers are per-area and enforced by RLS and
 * has_permission() — see spec section 3. Route prefixes are not the
 * access model here and must not become one.
 */
export const APP_HOME = "/app/dashboard";
