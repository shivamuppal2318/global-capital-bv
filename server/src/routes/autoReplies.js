import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const [settings, rules] = await Promise.all([
      prisma.autoReplySettings.findFirst(),
      prisma.autoReplyRule.findMany({ orderBy: { createdAt: "asc" } })
    ]);

    res.json({
      greeting: { enabled: settings?.greetingEnabled ?? false, message: settings?.greetingMessage ?? "" },
      away: { enabled: settings?.awayEnabled ?? false, message: settings?.awayMessage ?? "", hours: settings?.awayHours ?? "" },
      rules: rules.map((r) => ({
        id: r.id,
        keyword: r.keyword,
        matchType: r.matchType.charAt(0) + r.matchType.slice(1).toLowerCase(),
        reply: r.reply,
        status: r.status.charAt(0) + r.status.slice(1).toLowerCase(),
        triggered: r.triggered
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.put("/greeting", async (req, res, next) => {
  try {
    const settings = await prisma.autoReplySettings.findFirst();
    if (!settings) return res.status(404).json({ error: "Auto-reply settings not initialized" });
    const updated = await prisma.autoReplySettings.update({
      where: { id: settings.id },
      data: {
        greetingEnabled: req.body.enabled ?? settings.greetingEnabled,
        greetingMessage: req.body.message ?? settings.greetingMessage
      }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.put("/away", async (req, res, next) => {
  try {
    const settings = await prisma.autoReplySettings.findFirst();
    if (!settings) return res.status(404).json({ error: "Auto-reply settings not initialized" });
    const updated = await prisma.autoReplySettings.update({
      where: { id: settings.id },
      data: {
        awayEnabled: req.body.enabled ?? settings.awayEnabled,
        awayMessage: req.body.message ?? settings.awayMessage,
        awayHours: req.body.hours ?? settings.awayHours
      }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/rules", async (req, res, next) => {
  try {
    const { keyword, matchType, reply } = req.body;
    if (!keyword || !reply) return res.status(400).json({ error: "keyword and reply are required" });
    const rule = await prisma.autoReplyRule.create({
      data: { keyword, matchType: (matchType ?? "CONTAINS").toUpperCase(), reply }
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

router.patch("/rules/:id", async (req, res, next) => {
  try {
    const rule = await prisma.autoReplyRule.findUnique({ where: { id: req.params.id } });
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    const updated = await prisma.autoReplyRule.update({
      where: { id: rule.id },
      data: { status: rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
