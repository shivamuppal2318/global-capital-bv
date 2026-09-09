import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const rules = await prisma.automationRule.findMany({ orderBy: { createdAt: "asc" } });
    res.json({
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        condition: r.condition,
        action: r.action,
        status: r.enabled,
        executions: r.executions
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const rule = await prisma.automationRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    const updated = await prisma.automationRule.update({
      where: { id: rule.id },
      data: { enabled: req.body.enabled ?? !rule.enabled }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
