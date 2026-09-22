import Link from "next/link";
import { card, pageTitle, sectionTitle } from "@/lib/ui";

export const dynamic = "force-static";

/**
 * Spec section 5 asks for "a simple privacy notice for members".
 *
 * What is below is an accurate description of what this system stores
 * and who can read it — that part comes straight from the schema and
 * the policies, and I can stand behind it.
 *
 * It is NOT a legally reviewed privacy notice and does not claim to
 * be. The banner says so, and it should stay until somebody qualified
 * has read it.
 */
export default function PrivacyPage() {
  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={pageTitle}>What this system knows about you</h1>

      <div style={{ ...card, borderColor: "var(--accent)", marginTop: 16, marginBottom: 24 }}>
        <strong style={{ color: "var(--accent)" }}>Draft — not legally reviewed.</strong>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--text-2)" }}>
          The description below is accurate about what the software stores and who can see it.
          It has not been checked against ICO guidance or by anyone qualified, and it is not
          legal advice. Whoever holds data protection responsibility should read it before
          this is shown to anyone outside the shura.
        </p>
      </div>

      <Section title="What is held about staff">
        <p>
          Your name, nickname, email, phone, tier, Ansar badge, position, teams, skills,
          availability, the date you joined, and whether your account is active. If you hold a
          DBS check or a first aid qualification, its status and expiry.
        </p>
        <p>
          Also: the tasks you own, the events you work on, the meetings you attend, the SOPs
          you have read, your pledges and your own donor list, expense claims you submit, and
          the messages you send.
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Names and teams are visible to everyone with an account. Phone and email need a
          permission. Skills, availability and DBS status are limited to the shura.
        </p>
        <p>
          <strong>What you give is not public.</strong> Seeing the organisation&apos;s totals and
          seeing what each person individually gives are two different permissions, and only
          the shura hold the second. Your donor list is yours and the shura&apos;s — nobody else,
          including people who can see every total.
        </p>
        <p>
          Private notes the shura keep about members are in a separate table with its own
          rule, and are never shown to the person they are about through this system.
        </p>
      </Section>

      <Section title="Young people at events">
        <p>
          Medical details, allergies, emergency contacts and consent records for under-18s are
          kept apart from the rest of the event file. They can be read only by the event lead,
          the named safeguarding lead, the named first aider and the shura.
        </p>
        <p>
          <strong>They are deleted automatically</strong> a set number of weeks after the event
          — eight by default, twelve for a residential camp. The deletion is a scheduled job in
          the database, not something anyone has to remember, and every deletion is written to
          the audit log with a count and a date but never with a copy of what was deleted.
        </p>
      </Section>

      <Section title="What is never stored">
        <p>
          Bank details and card numbers. There is no column for one anywhere in the system, and
          any description or note containing a long run of digits is refused outright rather
          than saved.
        </p>
        <p>
          Nothing here is sent to an AI service. There is no AI anywhere in this CRM — the
          checklists come from the structure of the text you type, nothing more.
        </p>
      </Section>

      <Section title="Where it lives">
        <p>
          In a Supabase project in the EU, and served through Vercel. Files you upload —
          receipts, message attachments, resources — sit in private storage that needs a
          sign-in; none of it is on a public address.
        </p>
      </Section>

      <Section title="Asking about your own data">
        <p>
          Speak to the shura. You have the right to ask what is held about you, to have it
          corrected, and in some cases to have it deleted. Deactivating an account stops access
          but does not erase the record of what somebody did, which is deliberate — a meeting&apos;s
          minutes should not change because somebody left.
        </p>
      </Section>

      <p style={{ marginTop: 28 }}>
        <Link href="/app/dashboard" style={{ color: "var(--accent)", fontSize: 14 }}>
          Back to the dashboard
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={sectionTitle}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-1)" }}>{children}</div>
    </section>
  );
}
