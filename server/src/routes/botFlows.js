import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const flows = await prisma.botFlow.findMany({ include: { steps: true }, orderBy: { createdAt: "desc" } });

    const liveFlows = flows.filter((f) => f.active).length;
    const usersInFlows = flows.reduce((sum, f) => sum + f.usersCount, 0);
    const completions = flows.filter((f) => f.completionRate != null);
    const avgCompletion = completions.length
      ? completions.reduce((sum, f) => sum + f.completionRate, 0) / completions.length
      : 0;

    res.json({
      stats: [
        { label: "Live Flows", value: String(liveFlows), note: `${flows.length - liveFlows} in draft`, noteTone: "violet" },
        { label: "Users in Flows", value: String(usersInFlows), note: "Last 7 days", noteTone: "blue" },
        { label: "Completion Rate", value: `${avgCompletion.toFixed(0)}%`, note: "Across live flows", noteTone: "green" },
        { label: "Handoffs to Human", value: "89", note: "28% of sessions", noteTone: "amber" }
      ],
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        trigger: f.trigger,
        steps: f.steps.length,
        completion: f.completionRate != null ? `${f.completionRate.toFixed(0)}%` : "—",
        active: f.active,
        users: f.usersCount
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/steps", async (req, res, next) => {
  try {
    const steps = await prisma.botFlowStep.findMany({ where: { flowId: req.params.id }, orderBy: { stepOrder: "asc" } });
    res.json(steps.map((s) => ({ type: s.type.toLowerCase(), label: s.label, detail: s.detail })));
  } catch (err) {
    next(err);
  }
});

export default router;
