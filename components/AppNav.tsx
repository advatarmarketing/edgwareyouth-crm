"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/supabase/types";
import { signOutAction } from "@/app/app/actions";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import { BackButton } from "@/components/BackButton";

interface NavLink {
  href: string;
  label: string;
  icon: NavIconName;
}

/**
 * What the nav shows, per tier.
 *
 * This is presentation, not enforcement. It exists so somebody never
 * sees a menu item that would bounce them — a link that always fails
 * is bad UX, not a control. RLS and has_permission() are what actually
 * stop a muhsin reading the finance module.
 *
 * Prompt 1 replaces the tier switch below with the real permission
 * keys, so that the shura turning finance.view_totals on for one
 * sabiqun makes Finance appear in that person's nav and nobody else's.
 * Until then this is the section 3 default, and only the default.
 *
 * The icons are the template's and several are stand-ins — NavIcon's
 * set was drawn for a marketing agency. Worth redrawing once the
 * modules are real; not worth blocking on now.
 */
const EVERYONE: NavLink[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/app/tasks", label: "Tasks", icon: "todo" },
  { href: "/app/calendar", label: "Calendar", icon: "calendar" },
  { href: "/app/events", label: "Events", icon: "work" },
  { href: "/app/sops", label: "SOPs", icon: "tools" },
  { href: "/app/messages", label: "Messages", icon: "messages" },
  { href: "/app/resources", label: "Resources", icon: "portal" },
];

const MEMBERS: NavLink = { href: "/app/members", label: "Members", icon: "clients" };
const MEETINGS: NavLink = { href: "/app/meetings", label: "Meetings", icon: "week" };
const STRATEGY: NavLink = { href: "/app/strategy", label: "Strategy", icon: "leads" };
const MEDIA: NavLink = { href: "/app/media", label: "Media", icon: "uploads" };
const FINANCE: NavLink = { href: "/app/finance", label: "Finance", icon: "finance" };
const ADMIN: NavLink = { href: "/app/admin", label: "Admin", icon: "logins" };
const DEVELOPMENT: NavLink = { href: "/app/development", label: "Development", icon: "portfolio" };

function linksFor(tier: Tier | null): NavLink[] {
  // Null tier is "Ansar only" — a real person with the badge and no
  // tier, not a missing value. They get the base nav.
  switch (tier) {
    case "shura":
      return [MEMBERS, ...EVERYONE, MEETINGS, FINANCE, STRATEGY, MEDIA, ADMIN];
    case "sabiqun":
      return [MEMBERS, ...EVERYONE, MEETINGS, STRATEGY, MEDIA];
    default:
      return [MEMBERS, ...EVERYONE, DEVELOPMENT];
  }
}

export function AppNav({ tier }: { tier: Tier | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabStrip = useRef<HTMLDivElement>(null);

  const links = linksFor(tier);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Keep the active tab in view on a phone, where the strip scrolls.
  useEffect(() => {
    const strip = tabStrip.current;
    if (!strip) return;

    const current = strip.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;

    const target = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  function isActive(href: string) {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 16px",
          minHeight: 56,
        }}
      >
        <BackButton home={links[0]?.href ?? "/app"} />

        <Link
          href="/app/dashboard"
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", marginRight: 8 }}
        >
          <Logo />
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          <ThemeToggle />

          <Link href="/app/settings/password" className="nav-links" title="Change your password" style={topLink(isActive("/app/settings/password"))}>
            Password
          </Link>

          <form action={signOutAction} className="nav-links">
            <button type="submit" style={{ ...topLink(false), background: "none", border: "none", cursor: "pointer", minHeight: 44 }}>
              Sign out
            </button>
          </form>

          <button
            type="button"
            className="nav-burger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-1)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {/* The tab strip gets its own row so a thirteen-item shura nav
          fits without the active tab scrolling off-screen. It stays on
          a phone rather than collapsing into the burger; the burger
          still holds everything, including Password and Sign out,
          which have no tab. */}
      <div
        ref={tabStrip}
        className="nav-tabs"
        style={{
          gap: 4,
          padding: "0 16px",
          borderTop: "1px solid var(--border)",
          marginBottom: -1,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textDecoration: "none",
                whiteSpace: "nowrap",
                color: active ? "var(--text-1)" : "var(--text-3)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                padding: "15px 13px",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {menuOpen && (
        <div
          className="nav-panel"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "8px 16px 16px",
          }}
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} style={menuRow(isActive(link.href))}>
              <NavIcon name={link.icon} />
              {link.label}
            </Link>
          ))}

          <Link href="/app/settings/password" style={menuRow(isActive("/app/settings/password"))}>
            <NavIcon name="password" />
            Password
          </Link>

          <form action={signOutAction}>
            <button
              type="submit"
              style={{
                ...menuRow(false),
                color: "var(--text-3)",
                background: "none",
                border: "none",
                borderBottom: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              <NavIcon name="signout" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}

function topLink(active: boolean) {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: active ? "var(--text-1)" : "var(--text-3)",
    textDecoration: "none",
    padding: "8px 4px",
    whiteSpace: "nowrap" as const,
  };
}

/** One row of the phone menu. */
function menuRow(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 13,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: active ? "var(--text-1)" : "var(--text-2)",
    textDecoration: "none",
    padding: "14px 4px",
    minHeight: 48,
    borderBottom: "1px solid var(--border)",
  };
}
