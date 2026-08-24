import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { computeDoePerformance } from "../lib/doePerformance.js";

export const doePerformanceRouter = Router();

doePerformanceRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await computeDoePerformance();
  res.json({ rows, generatedAt: new Date().toISOString() });
}));
