import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMeetingNotes, type ParserMember } from "../lib/meetings/parse-notes";

/**
 * The meeting is a Wednesday. Every relative date in here is checked
 * against THIS date, not against the day the tests happen to run —
 * which is the single most important property of the parser.
 */
const MEETING = new Date(2026, 9, 7); // 2026-10-07, a Wednesday

const MEMBERS: ParserMember[] = [
  { id: "u1", fullName: "Yusuf Khan", nickname: "Yus" },
  { id: "u2", fullName: "Ibrahim Patel", nickname: null },
  { id: "u3", fullName: "Yusuf Ahmed", nickname: null },   // same first name as u1
  { id: "u4", fullName: "Bilal Osman", nickname: "Bill" },
];

/** Only one Yusuf, for the cases where ambiguity is not the point. */
const SIMPLE: ParserMember[] = [
  { id: "u1", fullName: "Yusuf Khan", nickname: "Yus" },
  { id: "u4", fullName: "Bilal Osman", nickname: "Bill" },
];

function parse(text: string, members: ParserMember[] = SIMPLE) {
  return parseMeetingNotes(text, { meetingDate: MEETING, members });
}

describe("actions", () => {
  test("reads owner, text and date from an ACTION line", () => {
    const { actions } = parse("ACTION @Yusuf: Book the venue for the Seerah night by 12/10");

    assert.equal(actions.length, 1);
    assert.equal(actions[0].ownerId, "u1");
    assert.equal(actions[0].dueDate, "2026-10-12");
    assert.equal(actions[0].text, "Book the venue for the Seerah night");
  });

  test("indented lines beneath become its steps", () => {
    const { actions } = parse(
      [
        "ACTION @Yusuf: Book the venue by 12/10",
        "  - Call the masjid office",
        "  - Confirm the price",
        "  - Send the booking to Head of Finance",
      ].join("\n")
    );

    assert.deepEqual(actions[0].steps, [
      "Call the masjid office",
      "Confirm the price",
      "Send the booking to Head of Finance",
    ]);
  });

  test("a blank line does not end the block", () => {
    const { actions } = parse("ACTION @Yusuf: Book the venue by 12/10\n\n  - Call the office");
    assert.deepEqual(actions[0].steps, ["Call the office"]);
  });

  test("lowercase action is still an action", () => {
    assert.equal(parse("action @Yusuf: Book the venue by 12/10").actions.length, 1);
  });

  test("a missing colon is still an action", () => {
    const { actions } = parse("ACTION @Yusuf Book the venue by 12/10");
    assert.equal(actions.length, 1);
    assert.equal(actions[0].text, "Book the venue");
  });

  test("matches a nickname", () => {
    assert.equal(parse("ACTION @Bill: Sort the chairs by 12/10").actions[0].ownerId, "u4");
  });

  test("matches a surname", () => {
    assert.equal(parse("ACTION @Khan: Sort the chairs by 12/10").actions[0].ownerId, "u1");
  });

  test("prose is ignored without complaint", () => {
    const result = parse("We talked about the Seerah night and everyone was happy.");
    assert.equal(result.actions.length, 0);
    assert.equal(result.unmatched.length, 0);
  });
});

describe("Notion to-do lines", () => {
  test("an unticked box with an @name becomes an action", () => {
    const { actions } = parse("[ ] @Yusuf book the hall by 12/10");
    assert.equal(actions.length, 1);
    assert.equal(actions[0].ownerId, "u1");
  });

  test("a ticked box is read the same way", () => {
    assert.equal(parse("[x] @Yusuf book the hall by 12/10").actions.length, 1);
  });

  test("a box with no @name is ignored, not reported", () => {
    const result = parse("[ ] tidy the store cupboard by 12/10");
    assert.equal(result.actions.length, 0);
    assert.equal(result.unmatched.length, 0);
  });
});

describe("decisions", () => {
  test("a DECISION line goes to the decision log", () => {
    const { decisions } = parse("DECISION: Seerah night moves to the first Friday of November");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].text, "Seerah night moves to the first Friday of November");
  });

  test("an empty DECISION line is reported rather than dropped", () => {
    const { decisions, unmatched } = parse("DECISION:");
    assert.equal(decisions.length, 0);
    assert.equal(unmatched.length, 1);
  });

  test("indented lines under a decision do not become steps of anything", () => {
    const { decisions, actions } = parse("DECISION: We move the date\n  - because the hall is booked");
    assert.equal(decisions.length, 1);
    assert.equal(actions.length, 0);
  });
});

describe("dates resolve against the MEETING date, never today", () => {
  test("dd/mm is day-first", () => {
    assert.equal(parse("ACTION @Yusuf: x by 03/04").actions[0].dueDate, "2027-04-03");
  });

  test("dd/mm/yyyy", () => {
    assert.equal(parse("ACTION @Yusuf: x by 12/10/2026").actions[0].dueDate, "2026-10-12");
  });

  test("dd/mm/yy", () => {
    assert.equal(parse("ACTION @Yusuf: x by 12/10/27").actions[0].dueDate, "2027-10-12");
  });

  test("12 Oct", () => {
    assert.equal(parse("ACTION @Yusuf: x by 12 Oct").actions[0].dueDate, "2026-10-12");
  });

  test("12th October", () => {
    assert.equal(parse("ACTION @Yusuf: x by 12th October").actions[0].dueDate, "2026-10-12");
  });

  test("October 12th", () => {
    assert.equal(parse("ACTION @Yusuf: x by October 12th").actions[0].dueDate, "2026-10-12");
  });

  test("tomorrow is the day after the MEETING", () => {
    assert.equal(parse("ACTION @Yusuf: x by tomorrow").actions[0].dueDate, "2026-10-08");
  });

  test("bare Friday is the next Friday after the meeting", () => {
    // Meeting is Wednesday 7 Oct 2026; the Friday after is the 9th.
    assert.equal(parse("ACTION @Yusuf: x by Friday").actions[0].dueDate, "2026-10-09");
  });

  test("next Friday resolves the same way", () => {
    assert.equal(parse("ACTION @Yusuf: x by next Friday").actions[0].dueDate, "2026-10-09");
  });

  test("a weekday that matches the meeting's own day goes a week forward", () => {
    // Wednesday, from a Wednesday meeting, must not mean today.
    assert.equal(parse("ACTION @Yusuf: x by Wednesday").actions[0].dueDate, "2026-10-14");
  });

  test("a day and month already past rolls into next year", () => {
    assert.equal(parse("ACTION @Yusuf: x by 5 Jan").actions[0].dueDate, "2027-01-05");
  });

  test("a date mentioned in passing loses to the one after 'by'", () => {
    const { actions } = parse("ACTION @Yusuf: Confirm the 3 Oct booking by 20/10");
    assert.equal(actions[0].dueDate, "2026-10-20");
  });

  test("an impossible date is not accepted", () => {
    const { actions, unmatched } = parse("ACTION @Yusuf: x by 31/02");
    assert.equal(actions.length, 0);
    assert.equal(unmatched.length, 1);
  });

  test("the reference date is honoured even when it is nothing like today", () => {
    const result = parseMeetingNotes("ACTION @Yusuf: x by Friday", {
      meetingDate: new Date(2001, 0, 1), // a Monday
      members: SIMPLE,
    });
    assert.equal(result.actions[0].dueDate, "2001-01-05");
  });
});

describe("nothing is guessed, nothing is dropped", () => {
  test("an unknown name goes to unmatched with a reason", () => {
    const { actions, unmatched } = parse("ACTION @Mustafa: Book the hall by 12/10");
    assert.equal(actions.length, 0);
    assert.match(unmatched[0].reason, /Nobody here is called/);
  });

  test("two people with the same first name are NOT guessed between", () => {
    const { actions, unmatched } = parse("ACTION @Yusuf: Book the hall by 12/10", MEMBERS);

    assert.equal(actions.length, 0);
    assert.equal(unmatched.length, 1);
    assert.match(unmatched[0].reason, /More than one person/);
    assert.deepEqual(
      unmatched[0].candidates?.map((c) => c.id).sort(),
      ["u1", "u3"]
    );
  });

  test("a nickname still resolves when the first name is ambiguous", () => {
    assert.equal(parse("ACTION @Yus: Book the hall by 12/10", MEMBERS).actions[0].ownerId, "u1");
  });

  test("an @name with no date is reported", () => {
    const { unmatched } = parse("ACTION @Yusuf: Book the hall");
    assert.match(unmatched[0].reason, /No date/);
  });

  test("a date with no @name is reported", () => {
    const { unmatched } = parse("ACTION: Book the hall by 12/10");
    assert.match(unmatched[0].reason, /No @name/);
  });

  test("steps under a failed action travel with it to the review screen", () => {
    const { unmatched } = parse("ACTION @Mustafa: Book the hall by 12/10\n  - Call the office");
    assert.deepEqual(unmatched[0].steps, ["Call the office"]);
  });
});

describe("a realistic messy set of notes", () => {
  const NOTES = `
Shura meeting, 7 October.

Present: everyone except Bilal.

We went through the Seerah night plan. The hall is probably free but
nobody has confirmed it.

ACTION @Yusuf: Book the venue for the Seerah night by 12/10
  - Call the masjid office
  - Confirm the price
  - Send the booking to Head of Finance

DECISION: Seerah night moves to the first Friday of November

action @Bill sort the chairs and tables by next Friday

[ ] @Yusuf chase the speaker by 20 Oct
[x] tidy the store cupboard

ACTION @Mustafa: Design the poster by 15/10
  - Get the logo files

ACTION @Bill: Ring the caterer
`;

  test("pulls out everything it should", () => {
    const { actions, decisions, unmatched } = parse(NOTES);

    assert.equal(actions.length, 3, "three resolvable actions");
    assert.equal(decisions.length, 1);
    assert.equal(unmatched.length, 2, "unknown name, and one with no date");

    const [venue, chairs, speaker] = actions;

    assert.equal(venue.ownerId, "u1");
    assert.equal(venue.dueDate, "2026-10-12");
    assert.equal(venue.steps.length, 3);

    assert.equal(chairs.ownerId, "u4");
    assert.equal(chairs.dueDate, "2026-10-09");

    assert.equal(speaker.ownerId, "u1");
    assert.equal(speaker.dueDate, "2026-10-20");

    assert.match(unmatched[0].reason, /Nobody here is called "Mustafa"/);
    assert.deepEqual(unmatched[0].steps, ["Get the logo files"]);
    assert.match(unmatched[1].reason, /No date/);
  });

  test("the prose lines produce nothing at all", () => {
    const { actions, decisions, unmatched } = parse("Present: everyone except Bilal.\nWe went through the plan.");
    assert.equal(actions.length + decisions.length + unmatched.length, 0);
  });
});
