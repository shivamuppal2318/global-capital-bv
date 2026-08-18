import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const sequences = await prisma.dripSequence.findMany({ orderBy: { createdAt: "desc" } });

    const activeSequences = sequences.filter((s) => s.status === "ACTIVE").length;
    const totalEnrolled = sequences.reduce((sum, s) => sum + s.enrolledCount, 0);
    const avgCompletion = sequences.length
      ? sequences.reduce((sum, s) => sum + s.completionRate, 0) / sequences.length
      : 0;

    res.json({
      stats: [
        { label: "Active Sequences", value: String(activeSequences), note: `${totalEnrolled.toLocaleString()} enrolled`, noteTone: "violet" },
        { label: "Avg Completion", value: `${avgCompletion.toFixed(0)}%`, note: "Across sequences", noteTone: "green" },
        { label: "Avg Reply Step", value: "Step 2", note: "Highest engagement", noteTone: "cyan" },
        { label: "Opt-outs", value: "1.8%", note: "Within policy", noteTone: "amber" }
      ],
      sequences: sequences.map((s) => ({
        id: s.id,
        name: s.name,
        trigger: s.trigger,
        enrolled: s.enrolledCount,
        completion: `${s.completionRate.toFixed(0)}%`,
        status: s.status.charAt(0) + s.status.slice(1).toLowerCase()
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/steps", async (req, res, next) => {
  try {
    const steps = await prisma.dripStep.findMany({ where: { sequenceId: req.params.id }, orderBy: { stepOrder: "asc" } });
    const maxEngagement = Math.max(...steps.map((s) => s.engagementRate), 1);
    res.json(
      steps.map((s) => [
        s.title,
        s.delayLabel,
        s.message,
        `${s.engagementRate.toFixed(0)}% engaged`,
        `${Math.round((s.engagementRate / maxEngagement) * 100)}%`
      ])
    );
  } catch (err) {
    next(err);
  }
});

export default router;
