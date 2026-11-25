import test from "node:test";
import assert from "node:assert/strict";
import { createTranscriptHtml, escapeHtml, parseQuestions, slugify } from "../src/utils.js";

test("parseQuestions trims entries and enforces Discord modal limits", () => {
  assert.deepEqual(parseQuestions("  What happened? ; What have you tried? "), [
    "What happened?",
    "What have you tried?",
  ]);
  assert.throws(() => parseQuestions("one;two;three;four;five;six"), /at most five/);
  assert.throws(() => parseQuestions("x".repeat(46)), /45 characters/);
});

test("slugify produces a safe channel-name fragment", () => {
  assert.equal(slugify("Billing & Payments"), "billing-payments");
  assert.equal(slugify("東京"), "ticket");
});

test("HTML transcript escapes user-controlled message content", () => {
  const html = createTranscriptHtml(
    { categoryName: "<Billing>", userTag: "member<&", channelId: "123" },
    [
      {
        author: { tag: "user<script>" },
        content: "<img src=x onerror=alert(1)>",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        attachments: { values: () => [] },
      },
    ],
  );
  assert.match(html, /&lt;Billing&gt;/);
  assert.match(html, /user&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});
