import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeAgeingReport } from "../lib/ageingReport.js";

export const ageingReportRouter = Router();

ageingReportRouter.get("/", asyncHandler(async (_req, res) => {
  res.json(await computeAgeingReport());
}));
