import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVttToPlainText } from "../src/lib/vttParser.js";

const SAMPLE_VTT = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Rahul R: Thanks for joining the call today.

2
00:00:05.500 --> 00:00:10.000
Rahul R: We wanted to walk through the term sheet.

3
00:00:10.200 --> 00:00:15.000
Bhakthi Nair: Sure, happy to go through it.
`;

test("parseVttToPlainText strips cue numbers and timestamps", () => {
  const result = parseVttToPlainText(SAMPLE_VTT);
  assert.equal(result.includes("00:00:00.000"), false);
  assert.equal(result.includes("-->"), false);
  assert.equal(/^\d+$/m.test(result), false);
});

test("parseVttToPlainText drops the WEBVTT header", () => {
  const result = parseVttToPlainText(SAMPLE_VTT);
  assert.equal(result.startsWith("WEBVTT"), false);
});

test("parseVttToPlainText merges consecutive cues from the same speaker into one line", () => {
  const result = parseVttToPlainText(SAMPLE_VTT);
  const lines = result.split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "Rahul R: Thanks for joining the call today. We wanted to walk through the term sheet.");
  assert.equal(lines[1], "Bhakthi Nair: Sure, happy to go through it.");
});

test("parseVttToPlainText handles content with no speaker labels", () => {
  const vtt = `WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nJust some plain text.\n`;
  assert.equal(parseVttToPlainText(vtt), "Just some plain text.");
});

test("parseVttToPlainText returns empty string for empty/missing input", () => {
  assert.equal(parseVttToPlainText(""), "");
  assert.equal(parseVttToPlainText(null), "");
  assert.equal(parseVttToPlainText(undefined), "");
});
