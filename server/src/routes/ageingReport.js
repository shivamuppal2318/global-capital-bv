import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeAgeingReport, staleInterestedReplies } from "../lib/ageingReport.js";

export const ageingReportRouter = Router();

ageingReportRouter.get("/", asyncHandler(async (req, res) => {
  res.json(await computeAgeingReport(req));
}));

// Just the count behind Ageing Report's own "DOE follow-up pending" table
// (same real query, already scoped to the caller's own records for a
// non-admin employee) — cheap enough to poll from the sidebar badge so a
// DOE sees they have something waiting on them without opening the full
// report first. Per QA feedback: "DOE should get notification on pending
// task" -- an on-screen badge, not email, per the follow-up clarification.
ageingReportRouter.get("/pending-count", asyncHandler(async (req, res) => {
  const pending = await staleInterestedReplies(req);
  res.json({ count: pending.length });
}));
