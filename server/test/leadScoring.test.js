import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateLeadScore, deriveQualification } from "../src/lib/leadScoring.js";

test("a fresh no-reply lead with no activity scores 0 and is cold", () => {
  const result = calculateLeadScore({});
  assert.equal(result.score, 0);
  assert.equal(result.band, "cold");
  assert.deepEqual(result.reasons, []);
});

test("a reply alone is enough to move a lead from cold to warm", () => {
  const result = calculateLeadScore({ replyType: "INTERESTED" });
  assert.equal(result.band, "warm");
  assert.ok(result.reasons.includes("replied"));
});

test("opens and clicks both raise the score, clicks more per event than opens", () => {
  const opensOnly = calculateLeadScore({ openCount: 2 });
  const clicksOnly = calculateLeadScore({ clickCount: 2 });
  assert.ok(clicksOnly.score > opensOnly.score);
});

test("NDA signed plus a completed call reaches hot", () => {
  const result = calculateLeadScore({ replyType: "INTERESTED", ndaSignedAt: new Date(), callStatus: "completed" });
  assert.equal(result.band, "hot");
  assert.ok(result.reasons.includes("NDA signed"));
  assert.ok(result.reasons.includes("call completed"));
});

test("a hard bounce forces the risk band regardless of other positive signals", () => {
  const result = calculateLeadScore({
    replyType: "INTERESTED",
    ndaSignedAt: new Date(),
    callStatus: "completed",
    bounced: true,
    bounceKind: "HARD"
  });
  assert.equal(result.band, "risk");
  assert.equal(result.score, 0); // negative contributions clamp at 0, band is what actually flags it
});

test("unsubscribed also forces the risk band", () => {
  const result = calculateLeadScore({ replyType: "INTERESTED", unsubscribed: true });
  assert.equal(result.band, "risk");
});

test("a canceled call subtracts points but doesn't alone force risk", () => {
  const withCancel = calculateLeadScore({ replyType: "INTERESTED", callStatus: "canceled" });
  const withoutCancel = calculateLeadScore({ replyType: "INTERESTED" });
  assert.ok(withCancel.score < withoutCancel.score);
  assert.notEqual(withCancel.band, "risk");
});

test("score never goes below 0 or above 100", () => {
  const veryNegative = calculateLeadScore({ bounced: true, unsubscribed: true, callStatus: "canceled" });
  assert.equal(veryNegative.score, 0);

  const veryPositive = calculateLeadScore({
    replyType: "INTERESTED",
    ndaSignedAt: new Date(),
    callStatus: "completed",
    openCount: 50,
    clickCount: 50
  });
  assert.equal(veryPositive.score, 100);
});

test("deriveQualification maps bands to the diagram's qualify/reject/pending outcome", () => {
  assert.equal(deriveQualification("hot"), "qualified");
  assert.equal(deriveQualification("warm"), "qualified");
  assert.equal(deriveQualification("cold"), "pending");
  assert.equal(deriveQualification("risk"), "rejected");
});
