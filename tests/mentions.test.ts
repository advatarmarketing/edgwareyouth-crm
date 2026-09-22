import assert from "node:assert/strict";
import { test } from "node:test";
import { findMentions, type MentionCandidate } from "../lib/messaging/mentions";

const PEOPLE: MentionCandidate[] = [
  { id: "1", fullName: "Yusuf Khan", nickname: null },
  { id: "2", fullName: "Yusuf Ahmed", nickname: null },
  { id: "3", fullName: "Bilal Osman", nickname: "Bil" },
  { id: "4", fullName: "Samir Patel", nickname: null },
  { id: "5", fullName: "Sam Ali", nickname: null },
];

test("a full name is matched", () => {
  const r = findMentions("@Bilal can you set up?", PEOPLE);
  assert.deepEqual(r.profileIds, ["3"]);
  assert.deepEqual(r.unknown, []);
});

test("a nickname is matched", () => {
  const r = findMentions("thanks @Bil", PEOPLE);
  assert.deepEqual(r.profileIds, ["3"]);
});

test("a surname is matched", () => {
  const r = findMentions("@Osman is on the door", PEOPLE);
  assert.deepEqual(r.profileIds, ["3"]);
});

test("an ambiguous first name notifies NOBODY and names the candidates", () => {
  const r = findMentions("@Yusuf can you take it", PEOPLE);
  assert.deepEqual(r.profileIds, []);
  assert.equal(r.ambiguous.length, 1);
  assert.deepEqual(r.ambiguous[0].candidates.sort(), ["Yusuf Ahmed", "Yusuf Khan"]);
});

test("an exact match beats a longer prefix", () => {
  // "Sam" is exactly Sam Ali's first name, so it is not ambiguous with
  // Samir — otherwise nobody called Sam could ever be mentioned.
  const r = findMentions("@Sam are you coming", PEOPLE);
  assert.deepEqual(r.profileIds, ["5"]);
  assert.deepEqual(r.ambiguous, []);
});

test("a name nobody has is reported, not dropped", () => {
  const r = findMentions("@Mustafa please bring the projector", PEOPLE);
  assert.deepEqual(r.profileIds, []);
  assert.deepEqual(r.unknown, ["Mustafa"]);
});

test("the same person twice is notified once", () => {
  const r = findMentions("@Bilal and again @Bilal", PEOPLE);
  assert.deepEqual(r.profileIds, ["3"]);
});

test("a trailing full stop is punctuation, not part of the name", () => {
  const r = findMentions("speak to @Bilal.", PEOPLE);
  assert.deepEqual(r.profileIds, ["3"]);
});

test("an email address is not a mention", () => {
  const r = findMentions("email me at someone@example.com", PEOPLE);
  // "example" matches nobody; the point is that it does not throw or
  // match a person, and the address is not silently treated as a ping.
  assert.deepEqual(r.profileIds, []);
});

test("accents and case do not matter", () => {
  const r = findMentions("@yūsuf khan", [{ id: "9", fullName: "Yusuf Khan", nickname: null }]);
  assert.deepEqual(r.profileIds, ["9"]);
});

test("no mentions means no mentions", () => {
  const r = findMentions("just a normal message", PEOPLE);
  assert.deepEqual(r, { profileIds: [], unknown: [], ambiguous: [] });
});
