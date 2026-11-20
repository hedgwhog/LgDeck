import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, alternatives } from "./check.ts";

test("case and spaces do not matter", () => {
  assert.equal(checkAnswer("  Tack ", "tack").correct, true);
  assert.equal(checkAnswer("god   morgon", "God morgon").correct, true);
});

test("special letters are strict", () => {
  const r = checkAnswer("ar", "är");
  assert.equal(r.correct, false);
  assert.deepEqual(r.marks, [true, false]);
  assert.equal(checkAnswer("и", "і").correct, false);
});

test("apostrophes are interchangeable", () => {
  assert.equal(checkAnswer("м’ясо", "м'ясо").correct, true);
  assert.equal(checkAnswer("мʼясо", "м'ясо").correct, true);
});

test("Cyrillic capitals match lowercase", () => {
  assert.equal(checkAnswer("ДЯКУЮ", "дякую").correct, true);
});

test("alternatives separated by /", () => {
  assert.deepEqual(alternatives("hello / hi"), ["hello", "hi"]);
  assert.equal(checkAnswer("hi", "hello / hi").correct, true);
  const r = checkAnswer("hallo", "hello / hi");
  assert.equal(r.correct, false);
  assert.equal(r.expected, "hello");
});

test("decomposed letters count as the same letter", () => {
  // "a" + combining ring above, as some keyboards produce it
  assert.equal(checkAnswer("a\u030Angest", "ångest").correct, true);
});

test("missing and extra letters are marked", () => {
  assert.deepEqual(checkAnswer("dyakuyu", "дякую").marks.every(Boolean), true);
  assert.deepEqual(checkAnswer("tak", "tack").marks, [false, false, true, false]);
  const extra = checkAnswer("tacks", "tack");
  assert.equal(extra.correct, false);
  assert.ok(extra.marks.some(Boolean));
  assert.deepEqual(checkAnswer("", "tack").marks, [true, true, true, true]);
});
