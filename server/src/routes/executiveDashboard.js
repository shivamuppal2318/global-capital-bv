import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";

export const executiveDashboardRouter = Router();

// One call, everything the landing dashboard needs. The actual computation
// lives in lib/executiveKpis.js -- shared with routes/outreachDoe.js's own
// scorecard, so the two screens can never show conflicting numbers for the
// same metric.
executiveDashboardRouter.get("/", asyncHandler(async (_req, res) => {
  const { stats, funnel, kpis } = await computeExecutiveKpis();
  res.json({ generatedAt: new Date().toISOString(), stats, funnel, kpis });
}));
