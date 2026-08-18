import { Router } from "express";
import { prisma } from "../db.js";
import { formatRelativeTime } from "../utils.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const triggers = await prisma.crmTrigger.findMany({ orderBy: { createdAt: "asc" } });

    const active = triggers.filter((t) => t.status === "ACTIVE").length;
    const draft = triggers.length - active;

    res.json({
      stats: [
        { label: "Active Triggers", value: String(active), note: `${draft} draft`, noteTone: "blue" },
        { label: "Fired (30d)", value: "1,860", note: "Across all triggers", noteTone: "cyan" },
        { label: "Leads Created", value: "142", note: "From WhatsApp events", noteTone: "green" },
        { label: "Tasks Created", value: "318", note: "Auto-assigned", noteTone: "violet" }
      ],
      rules: triggers.map((t) => ({
        id: t.id,
        event: t.event,
        action: t.action,
        status: t.status.charAt(0) + t.status.slice(1).toLowerCase(),
        lastTriggered: t.lastTriggeredAt ? formatRelativeTime(t.lastTriggeredAt) : "—"
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const trigger = await prisma.crmTrigger.findUnique({ where: { id: req.params.id } });
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    const updated = await prisma.crmTrigger.update({
      where: { id: trigger.id },
      data: { status: trigger.status === "ACTIVE" ? "DRAFT" : "ACTIVE" }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
