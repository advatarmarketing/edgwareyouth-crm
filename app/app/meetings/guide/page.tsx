import Link from "next/link";
import { card, pageTitle, sectionTitle } from "@/lib/ui";

/**
 * The one page that has to be read for the whole module to work.
 *
 * No AI is used anywhere in this CRM, so the actions come out of how
 * the notes are written. This is the habit the team has to learn, and
 * it is linked from the meetings page rather than buried in a doc.
 */
export default function MeetingNotesGuidePage() {
  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/meetings" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>How to write meeting notes</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 28px", lineHeight: 1.7 }}>
        The CRM does not listen to the meeting or guess who is doing what. It reads two
        kinds of line. Write those two properly and everyone&apos;s actions appear on their
        task list the moment you publish — nobody retypes anything.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>Actions</h2>
        <pre style={{ ...card, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
{`ACTION @Yusuf: Book the venue for the Seerah night by 12/10
  - Call the masjid office
  - Confirm the price
  - Send the booking to Head of Finance`}
        </pre>
        <ul style={{ color: "var(--text-2)", lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li><strong>@Name</strong> — first name, surname or their nickname.</li>
          <li><strong>by &lt;date&gt;</strong> — every action needs one. No date, no action.</li>
          <li><strong>Indented lines</strong> beneath become the tick-boxes on their task.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>Decisions</h2>
        <pre style={{ ...card, fontFamily: "var(--font-mono)", fontSize: 13, margin: "0 0 12px" }}>
{`DECISION: Seerah night moves to the first Friday of November`}
        </pre>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>
          These go to the decision log, which is searchable. Worth recording anything
          you would otherwise have to re-argue in three months.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>Dates it understands</h2>
        <p style={{ color: "var(--text-2)", lineHeight: 1.8, margin: 0 }}>
          <code>12/10</code> · <code>12/10/26</code> · <code>12 Oct</code> ·{" "}
          <code>12th October</code> · <code>tomorrow</code> · <code>Friday</code> ·{" "}
          <code>next Friday</code>
        </p>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: "12px 0 0" }}>
          Dates are always day first — <code>03/04</code> is the 3rd of April. Anything
          relative counts from the <strong>date of the meeting</strong>, not the day you
          type it up, so writing the notes a few days later still gives the dates the
          room agreed.
        </p>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: "12px 0 0" }}>
          One warning: people mean different things by <code>next Friday</code>. The CRM
          takes it as the very next Friday. The review screen shows you the actual date
          it worked out before you publish — check it there if you meant the week after.
        </p>
      </section>

      <section>
        <h2 style={sectionTitle}>If you took the notes in Notion</h2>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: "0 0 12px" }}>
          Paste them in as they are. To-do lines are picked up too, as long as they name
          somebody and carry a date:
        </p>
        <pre style={{ ...card, fontFamily: "var(--font-mono)", fontSize: 13, margin: "0 0 12px" }}>
{`[ ] @Yusuf chase the speaker by 20 Oct`}
        </pre>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>
          Anything it cannot work out — an unknown name, two people with the same first
          name, a missing date — is shown on the review screen for you to fix by hand. It
          is never guessed at and never thrown away.
        </p>
        <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: "12px 0 0" }}>
          Voice recordings can be attached to a meeting for the record, but nothing
          transcribes them. Either write the ACTION lines while listening back, or paste
          in a transcript from wherever you made one.
        </p>
      </section>
    </main>
  );
}
