import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";

export const executiveDashboardRouter = Router();

// One call, everything the landing dashboard needs. The actual computation
// lives in lib/executiveKpis.js -- shared with routes/outreachDoe.js's own
// scorecard, so the two screens can never show conflicting numbers for the
// same metric.
//
// Three tiers: a Channel Partner sees only their own referred leads; a
// staff ADMIN gets the company-wide view (unscoped); any other staff
// EMPLOYEE only ever sees their own numbers -- the leads/records they're
// the Owner of -- since this is otherwise every rep's revenue and
// pipeline data laid bare to whoever else is logged in.
executiveDashboardRouter.get("/", asyncHandler(async (req, res) => {
  const doeName = !req.channelPartner && req.user.role !== "ADMIN" ? req.user.name : null;
  const { stats, funnel, kpis, scope } = await computeExecutiveKpis({ doeName, channelPartner: req.channelPartner });
  res.json({ generatedAt: new Date().toISOString(), stats, funnel, kpis, scope });
}));
