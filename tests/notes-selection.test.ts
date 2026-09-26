import assert from "node:assert/strict";
import { test } from "node:test";
import { splitForTodo } from "../lib/notes/selection";

const NOTE = [
  "Seerah night planning",
  "Need to sort these:",
  "- ring the venue",
  "- book the speaker",
  "  - send him the brief",
  "- buy dates",
  "Anything else goes to the shura.",
].join("\n");

const at = (needle: string) => NOTE.indexOf(needle);

test("a selection becomes whole lines, with the prose either side kept", () => {
  const r = splitForTodo(NOTE, at("- ring"), at("- buy dates") + "- buy dates".length);
  assert.deepEqual(r.items.map((i) => i.text), [
    "ring the venue", "book the speaker", "send him the brief", "buy dates",
  ]);
  assert.equal(r.before, "Seerah night planning\nNeed to sort these:");
  assert.equal(r.after, "Anything else goes to the shura.");
});

test("a selection starting mid-word takes the whole line", () => {
  // Highlighting "ng the ven" must not leave "ri" and "ue" behind.
  const r = splitForTodo(NOTE, at("ng the ven"), at("ng the ven") + 10);
  assert.deepEqual(r.items.map((i) => i.text), ["ring the venue"]);
  assert.ok(!r.before.includes("ri"), "no stray fragment left in the prose");
  assert.ok(r.after.startsWith("- book the speaker"));
});

test("indentation survives as depth", () => {
  const r = splitForTodo(NOTE, at("- book"), at("- buy") - 1);
  assert.deepEqual(r.items.map((i) => [i.text, i.depth]), [
    ["book the speaker", 0],
    ["send him the brief", 1],
  ]);
});

test("a tick box written into the note comes across ticked", () => {
  const body = "- [x] ring the venue\n- [ ] buy dates\n[X] tell Bilal";
  const r = splitForTodo(body, 0, body.length);
  assert.deepEqual(r.items, [
    { text: "ring the venue", depth: 0, done: true },
    { text: "buy dates", depth: 0, done: false },
    { text: "tell Bilal", depth: 0, done: true },
  ]);
});

test("blank lines inside the selection are not empty items", () => {
  const body = "one\n\n\ntwo";
  const r = splitForTodo(body, 0, body.length);
  assert.deepEqual(r.items.map((i) => i.text), ["one", "two"]);
});

test("a triple-click selection ending at the next line does not drag that line in", () => {
  // Triple-clicking a line selects through its newline, so the
  // selection ends at the very start of the following line.
  const lineStart = at("- ring");
  const nextLine = at("- book");
  const r = splitForTodo(NOTE, lineStart, nextLine);
  assert.deepEqual(r.items.map((i) => i.text), ["ring the venue"]);
  assert.ok(r.after.startsWith("- book the speaker"));
});

test("a backwards selection works the same as a forwards one", () => {
  const forwards = splitForTodo(NOTE, at("- ring"), at("- book"));
  const backwards = splitForTodo(NOTE, at("- book"), at("- ring"));
  assert.deepEqual(backwards, forwards);
});

test("the whole note can become one list, leaving nothing either side", () => {
  const body = "- a\n- b";
  const r = splitForTodo(body, 0, body.length);
  assert.equal(r.before, "");
  assert.equal(r.after, "");
  assert.equal(r.items.length, 2);
});

test("selecting nothing but blank lines gives no items", () => {
  const body = "text\n\n\nmore";
  const r = splitForTodo(body, 5, 7);
  assert.equal(r.items.length, 0);
});
