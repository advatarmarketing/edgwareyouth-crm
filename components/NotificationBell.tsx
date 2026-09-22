"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/supabase/types";

/**
 * The bell, with a live unread count.
 *
 * Seeded from the server so it paints filled in rather than
 * empty-then-populated, then kept current by a realtime subscription
 * on `notifications`. RLS returns only your own rows, so the channel
 * carries nothing that needs filtering here.
 *
 * If the subscription never connects — a blocked websocket, an offline
 * laptop — the bell still shows whatever the server handed it. It goes
 * stale, it does not break.
 */
export function NotificationBell({ initial }: { initial: AppNotification[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => setItems((current) => [payload.new as AppNotification, ...current].slice(0, 20))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Close when the click lands anywhere else.
  useEffect(() => {
    if (!open) return;

    function onClick(event: MouseEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAllRead() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;

    // Optimistic: the badge clears immediately. A failed write means
    // the count returns on the next page load, which is the right way
    // round — better a number that comes back than one that vanishes
    // while the row is still unread.
    setItems((current) => current.map((n) => ({ ...n, read: true })));

    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    router.refresh();
  }

  return (
    <div ref={panel} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        style={{
          display: "inline-flex",
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
          position: "relative",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: 9,
              background: "var(--accent)",
              color: "var(--accent-fg)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              lineHeight: "17px",
              textAlign: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12 }}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 && (
            <p style={{ padding: "16px 12px", margin: 0, color: "var(--text-3)", fontSize: 13 }}>Nothing yet.</p>
          )}

          {items.map((n) => {
            const body = (
              <>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 500 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{n.body}</div>}
              </>
            );

            return n.href ? (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => setOpen(false)}
                style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit", background: n.read ? "transparent" : "var(--accent-soft)" }}
              >
                {body}
              </Link>
            ) : (
              <div key={n.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", background: n.read ? "transparent" : "var(--accent-soft)" }}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
