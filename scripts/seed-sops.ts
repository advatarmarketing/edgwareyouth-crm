/**
 * Seeds the twenty starter SOPs from section 4.5 of docs/SPEC.md.
 *
 * Every one lands as a DRAFT with its suggested visibility already set.
 * They are a first pass written from the spec and from how a UK Muslim
 * youth organisation actually runs — not finished policy. The shura
 * review and publish them; nothing here is visible to the wider team
 * until they do, because a draft is only visible to sops.manage.
 *
 * Safe to re-run: it matches on title and updates rather than
 * duplicating. It will NOT overwrite an SOP somebody has already
 * published — once the shura have worked on one, this script leaves it
 * alone.
 *
 *   npm run seed:sops
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database, TeamKey, TierKey } from "../lib/supabase/types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRAFT_NOTE = "DRAFT — shura to review.\n\n";

interface SeedSop {
  title: string;
  category: string;
  body: string;
  steps: string[];
  /** Everyone, or the tiers and teams it is limited to. */
  all?: boolean;
  tiers?: TierKey[];
  teams?: TeamKey[];
}

const SOPS: SeedSop[] = [
  {
    title: "Running a weekly dars / talk",
    category: "Events",
    all: true,
    body: "The weekly dars is the thing most people meet us through, so it has to feel the same every week: on time, set up before anyone arrives, and warm at the door. One person owns the evening. If they cannot make it, they hand over to a named replacement rather than leaving it to whoever turns up.",
    steps: [
      "Confirm the speaker and topic by the Monday",
      "Send the reminder to the group and the story to socials 24 hours before",
      "Arrive 45 minutes early and complete the venue set-up SOP",
      "Brief the welcome team on tonight's topic and who is expected",
      "Start within five minutes of the advertised time",
      "Close with the announcement for next week and a du'a",
      "Pack down, then log attendance and first-timers in the CRM",
    ],
  },
  {
    title: "Venue set-up and pack-down",
    category: "Events",
    all: true,
    body: "Nobody should ever walk into a room being set up. Everything below is done before the first person arrives, and the room is left cleaner than we found it — we are guests in almost every space we use, and being invited back depends on this more than anything we say.",
    steps: [
      "Unlock and check heating, lighting and toilets",
      "Set the layout — circle for a halaqah, rows for a talk",
      "Sound check the mic and any playback",
      "Put out dates and water at the entrance",
      "Set up signage from the door to the room",
      "Check the wudu area and toilets are clean and stocked",
      "After: bin bags out, chairs stacked, lost property collected, doors locked",
      "Report anything broken to the venue contact the same evening",
    ],
  },
  {
    title: "Welcome, registration and door team",
    category: "Events",
    all: true,
    body: "The door is the whole first impression. Two people, standing, phones away. Your job is that nobody stands alone looking uncertain — especially anyone who has come by themselves for the first time.",
    steps: [
      "Be in position 20 minutes before the start",
      "Greet everyone with salam and a handshake",
      "Ask first-timers their name and how they heard about us",
      "Walk first-timers into the room and introduce them to someone",
      "Record attendance and mark who is new",
      "Pass new names to the event lead before the end of the night",
      "Message every first-timer within 24 hours",
    ],
  },
  {
    title: "Ihsan & the senses checklist",
    category: "Events",
    all: true,
    body: "Section 4.9 of the plan, in practice. Ihsan is doing it beautifully, and people remember how something felt long after they have forgotten what was said. Work through the senses before the event, not after.",
    steps: [
      "Decide the one thing you want people to take home",
      "Design the peak moment — a recitation, a story, a silence, a du'a together",
      "Sight: room clean and set before anyone arrives, lighting right, team identifiable",
      "Sound: opening recitation ready, sound checked, silence planned",
      "Smell: bukhoor lit, fresh air, clean toilets and wudu area",
      "Taste: dates and water at the door, food timed so it is not rushed",
      "Touch: temperature comfortable, seating sorted, a physical takeaway if there is one",
      "Personal: names learned, welcome team briefed, follow-up message within 24 hours",
    ],
  },
  {
    title: "Safeguarding: reporting a concern",
    category: "Safeguarding",
    all: true,
    body: "If something about a young person worries you, it gets reported the same day. You are not deciding whether it is serious — that is the safeguarding lead's job. You are making sure it reaches them.\n\nDo not promise a young person you will keep it secret. Do not investigate it yourself. Do not discuss it with anyone other than the safeguarding lead.",
    steps: [
      "Make sure the young person is safe right now",
      "Write down what was said or seen, in their words, with the date and time",
      "Tell the safeguarding lead the same day — in person or by phone, not group chat",
      "If a child is in immediate danger, call 999 first, then the safeguarding lead",
      "Hand your written note to the safeguarding lead and keep no copy",
      "Do not discuss it with anyone else, including other volunteers",
    ],
  },
  {
    title: "Lost or missing young person",
    category: "Safeguarding",
    all: true,
    body: "Act immediately. It is always better to start a search that turns out to be unnecessary than to wait and hope. The event lead takes charge and one person stays with the phone.",
    steps: [
      "Tell the event lead straight away",
      "Event lead stops the programme and takes a head count",
      "Assign searchers to specific areas — inside, outside, toilets, car park",
      "One named person stays at the entrance in case they return",
      "Call the parent or guardian after 10 minutes if not found",
      "Call 999 after 15 minutes if not found",
      "Write up what happened the same evening and give it to the safeguarding lead",
    ],
  },
  {
    title: "Medical emergency / first aid",
    category: "Safeguarding",
    all: true,
    body: "Know before the event starts who the first aider is and where the kit is. If you are not trained, your job is to get the trained person and keep everyone else back.",
    steps: [
      "Send someone to fetch the named first aider",
      "Clear space around the person and keep others back",
      "Call 999 for anything involving breathing, chest pain, a head injury or loss of consciousness",
      "Send someone to the entrance to meet the ambulance",
      "Check the medical and allergy information held for that person",
      "Contact the parent or guardian",
      "Record what happened and give it to the event lead the same evening",
    ],
  },
  {
    title: "Photography and consent",
    category: "Safeguarding",
    all: true,
    body: "We do not photograph anyone under 18 without consent from a parent or guardian recorded in the event file. If you are unsure whether someone has consented, do not take the shot — you cannot un-post a photo.",
    steps: [
      "Check the event file for who has photo consent and who does not",
      "Brief anyone filming before the event starts",
      "Announce at the start that photos are being taken and where to stand to avoid them",
      "Do not post any image of a young person without recorded consent",
      "Never post anything showing a home address, a school uniform or a car registration",
      "Take a post down immediately on request, without arguing",
    ],
  },
  {
    title: "Submitting an expense claim",
    category: "Finance",
    all: true,
    body: "Anything you have paid for out of your own pocket, claim it. Claims need a receipt photo and go through the CRM so there is a record. Every claim is approved by someone other than the claimant — nobody approves their own, including the shura.",
    steps: [
      "Photograph the receipt at the time — not later from memory",
      "Submit the claim in the CRM with the amount, date and what it was for",
      "Say which event or fund it belongs to",
      "Wait for approval before chasing payment",
      "Claim within 30 days, so the monthly finance close is accurate",
    ],
  },
  {
    title: "Volunteer (muhsin) onboarding",
    category: "Volunteers",
    tiers: ["shura", "sabiqun"],
    body: "Somebody's first month decides whether they stay. Give them a real job quickly — people commit to what they are needed for, not to what they are invited to.",
    steps: [
      "Invite them to the CRM and set their tier",
      "Meet them for 20 minutes and find out what they are good at and what time they have",
      "Record their skills and availability on their profile",
      "Assign the SOPs everyone reads",
      "Give them a specific role at the next event, not a general invitation",
      "Introduce them to their team and name who they report to on the day",
      "Check in after their first event and ask how it went",
    ],
  },
  {
    title: "Planning an event from proposal to close",
    category: "Events",
    tiers: ["shura", "sabiqun"],
    body: "Every event runs through the same stages so nothing gets forgotten under time pressure: idea, proposal to shura, approved, planning, live, wrap-up, closed. An event is not closed until the retrospective is written.",
    steps: [
      "Write the proposal — aims, audience, date, rough budget, which priority it serves",
      "Submit to shura for approval",
      "On approval, confirm the event lead and fill the role list",
      "Work the milestones backwards from the event date",
      "Complete the risk register and name the safeguarding lead",
      "Confirm venue, speaker and budget at least three weeks out",
      "Brief every volunteer with their role, time and who they report to",
      "Run the event",
      "Hold the retrospective within a week and push the lessons into the template",
    ],
  },
  {
    title: "Booking and briefing a speaker",
    category: "Events",
    tiers: ["shura", "sabiqun"],
    body: "A speaker who has not been briefed properly will give a talk that does not fit the evening. Tell them the audience, the length and the one thing you want people to leave with — and always have a backup.",
    steps: [
      "Agree the topic and date in writing, not verbally",
      "Send the written brief: audience, ages, length, the takeaway, and what to avoid",
      "Confirm travel, parking and what time to arrive",
      "Agree the fee or expenses up front and in writing",
      "Confirm again three days before",
      "Name a backup speaker and tell them they are the backup",
      "Meet them at the door and brief them on the room before they go on",
      "Thank them within 48 hours",
    ],
  },
  {
    title: "Running a meeting and taking minutes",
    category: "Meetings & planning",
    tiers: ["shura", "sabiqun"],
    body: "The point of a meeting is the actions that come out of it. Whoever takes the minutes writes actions in the CRM format so they land on people's task lists without anybody retyping them — that is the single habit that makes the whole system work.\n\nWrite an action as: ACTION @Name: what, by when. Indent any sub-steps beneath it. Write decisions as DECISION: followed by the decision.",
    steps: [
      "Name the chair and the minute-taker before starting",
      "Open the agenda in the CRM and check matters arising from last time",
      "Keep to the agenda — park anything else for the end",
      "Record every action as ACTION @Name: what, by when",
      "Record every decision as DECISION: followed by the decision",
      "Read the actions back out before closing so owners can object",
      "Publish the minutes the same day",
    ],
  },
  {
    title: "Event retrospective and follow-up",
    category: "Events",
    tiers: ["shura", "sabiqun"],
    body: "Held within a week, while people still remember. An event is not closed until this is done. The point is not to grade ourselves — it is to change the template so the next one starts further ahead.",
    steps: [
      "Get the event team in a room within seven days",
      "What went well — be specific, name people",
      "What was hard, and what we would change",
      "Rate each of the senses from the Ihsan checklist out of five",
      "Record numbers: expected, actual, first-timers, returning",
      "Write the summary of at least 100 words",
      "Push the lessons into the event template",
      "Thank volunteers and the speaker within 48 hours",
      "Invite every first-timer to the next dars personally",
    ],
  },
  {
    title: "Social media posting and approval",
    category: "Media",
    tiers: ["shura"],
    teams: ["media"],
    body: "Everything public carries the organisation's name, so nothing goes out without a second pair of eyes. Posts follow the content calendar rather than being invented on the day.",
    steps: [
      "Check the content calendar for what is due",
      "Draft the caption and select the assets",
      "Check every image against the photo consent list",
      "Send to the Head of Media for approval",
      "Post at the agreed time",
      "Mark it posted in the content calendar",
      "Reply to comments and DMs within 24 hours",
    ],
  },
  {
    title: "Event media coverage (filming and photos)",
    category: "Media",
    tiers: ["shura"],
    teams: ["media"],
    body: "Coverage is planned before the event, not improvised during it. Agree the shot list in advance so the person filming knows what they are there to get and is not standing at the back hoping.",
    steps: [
      "Agree the shot list with the event lead a week before",
      "Check who does not have photo consent",
      "Confirm who is filming and who is photographing",
      "Charge batteries and clear cards the night before",
      "Get the peak moment — that is the shot the recap needs",
      "Get wide shots of a full room early, before people leave",
      "Back the files up the same night to the agreed folder",
      "Hand the recap edit to the Head of Media within three days",
    ],
  },
  {
    title: "Handling cash and mosque collections",
    category: "Finance",
    tiers: ["shura"],
    teams: ["finance"],
    body: "Cash is counted by two people, always. This is not about trust — it is about protecting whoever is carrying it from any suggestion later that something was wrong. Zakat is kept strictly separate from general funds and never mixed.",
    steps: [
      "Two named counters, counting together, in a private room",
      "Count twice and both sign the total",
      "Record which fund it belongs to — general, zakat, sadaqah or waqf",
      "Never leave cash unattended, not for a minute",
      "Bank it within 48 hours",
      "Log it in the CRM the same day with both counters named",
      "Zakat goes to the zakat fund and never moves to general",
    ],
  },
  {
    title: "Face-to-face fundraising at mosques",
    category: "Finance",
    tiers: ["shura"],
    teams: ["finance"],
    body: "Always get the committee's permission before turning up. Be brief, be specific about what the money does, and never pressure anyone — an uncomfortable ask costs us the relationship with that masjid.",
    steps: [
      "Get written permission from the mosque committee first",
      "Agree which prayer and how long you have",
      "Prepare a 60-second ask with one concrete example of what the money does",
      "Take the card machine and check it is charged and connected",
      "Two counters for any cash — follow the cash SOP",
      "Thank the committee before leaving",
      "Log the total and the contact the same day",
    ],
  },
  {
    title: "Monthly finance close",
    category: "Finance",
    tiers: ["shura"],
    teams: ["finance"],
    body: "Done in the first week of the month for the month just gone. The point is that the shura can see the real position rather than a guess, and that pledges which have quietly stopped get noticed.",
    steps: [
      "Check every fund balance against the bank",
      "Record which member pledges were paid and which were missed",
      "Chase missed pledges personally, not by group message",
      "Close off any outstanding expense claims",
      "Update campaign totals",
      "Produce the monthly report by fund",
      "Take it to the next shura meeting",
    ],
  },
  {
    title: "Year planning session",
    category: "Meetings & planning",
    tiers: ["shura"],
    body: "Once a year, a full day, phones away. Start from the vision and the five priorities rather than from last year's calendar — otherwise you will simply repeat the year you have just had.",
    steps: [
      "Review last year honestly against what was actually achieved",
      "Re-read the purpose, vision, mission and values before planning anything",
      "Set objectives for each of the five priorities",
      "Write two to five key results per objective, each with a number and an owner",
      "Map the key events onto the four quarters",
      "Check the plan against the money — what can actually be afforded",
      "Assign an owner to every quarter's goals",
      "Publish the year plan in the CRM",
    ],
  },
];

async function seed() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const sop of SOPS) {
    const { data: existing } = await admin
      .from("sops")
      .select("id, status, checklist_id")
      .eq("title", sop.title)
      .maybeSingle();

    // Once the shura have published one, it is theirs. Re-running this
    // script must never overwrite reviewed wording with the first draft.
    if (existing?.status === "published") {
      console.log(`- ${sop.title} — already published, left alone`);
      skipped += 1;
      continue;
    }

    const body = DRAFT_NOTE + sop.body;
    let sopId = existing?.id;

    if (sopId) {
      await admin
        .from("sops")
        .update({ body, category: sop.category, visible_to_all: sop.all ?? false })
        .eq("id", sopId);
      updated += 1;
    } else {
      const { data: inserted, error } = await admin
        .from("sops")
        .insert({ title: sop.title, category: sop.category, body, status: "draft", visible_to_all: sop.all ?? false })
        .select("id")
        .single();

      if (error || !inserted) {
        console.error(`✗ ${sop.title}: ${error?.message}`);
        continue;
      }
      sopId = inserted.id;
      created += 1;
    }

    // Rebuild the master checklist from the steps.
    if (existing?.checklist_id) await admin.from("checklists").delete().eq("id", existing.checklist_id);

    const { data: checklist } = await admin
      .from("checklists")
      .insert({ title: sop.title, source: "sop", source_id: sopId })
      .select("id")
      .single();

    if (checklist) {
      await admin.from("checklist_items").insert(
        sop.steps.map((text, position) => ({ checklist_id: checklist.id, text, position, depth: 0 }))
      );
      await admin.from("sops").update({ checklist_id: checklist.id }).eq("id", sopId);
    }

    // Visibility.
    await admin.from("sop_visible_tiers").delete().eq("sop_id", sopId);
    await admin.from("sop_visible_teams").delete().eq("sop_id", sopId);

    if (sop.tiers?.length) {
      await admin.from("sop_visible_tiers").insert(sop.tiers.map((tier_key) => ({ sop_id: sopId!, tier_key })));
    }
    if (sop.teams?.length) {
      await admin.from("sop_visible_teams").insert(sop.teams.map((team_key) => ({ sop_id: sopId!, team_key })));
    }

    const who = sop.all ? "everyone" : [...(sop.tiers ?? []), ...(sop.teams ?? []).map((t) => `${t} team`)].join(", ");
    console.log(`✓ ${sop.title} — ${who}`);
  }

  console.log(`\n${created} created, ${updated} updated, ${skipped} left alone.`);
  console.log("All are DRAFTS. Only people who can manage SOPs see them until the shura publish them.");
}

seed();
