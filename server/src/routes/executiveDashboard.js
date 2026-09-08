import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";

export const executiveDashboardRouter = Router();

// One call, everything the landing dashboard needs. The actual computation
// lives in lib/executiveKpis.js -- shared with routes/outreachDoe.js's own
// scorecard, so the two screens can never show conflicting numbers for the
// same metric.
//
// An ADMIN gets the company-wide view (unscoped); anyone else only ever
// sees their own numbers -- the leads/records they're the Owner of -- since
// this is otherwise every rep's revenue and pipeline data laid bare to
// whoever else is logged in.
executiveDashboardRouter.get("/", asyncHandler(async (req, res) => {
  const doeName = req.user.role === "ADMIN" ? null : req.user.name;
  const { stats, funnel, kpis, scope } = await computeExecutiveKpis({ doeName });
  res.json({ generatedAt: new Date().toISOString(), stats, funnel, kpis, scope });
}));
