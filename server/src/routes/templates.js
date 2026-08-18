import { Router } from "express";
import { prisma } from "../db.js";
import { formatRelativeTime, toTitleCase } from "../utils.js";

const router = Router();

const STATUS_LABEL = { APPROVED: "Approved", IN_REVIEW: "In review", REJECTED: "Rejected" };

router.get("/", async (req, res, next) => {
  try {
    const { category } = req.query;
    const templates = await prisma.template.findMany({
      where: category && category !== "All" ? { category: category.toUpperCase() } : undefined,
      orderBy: { createdAt: "desc" }
    });

    const stats = {
      total: templates.length,
      approved: templates.filter((t) => t.status === "APPROVED").length,
      inReview: templates.filter((t) => t.status === "IN_REVIEW").length,
      rejected: templates.filter((t) => t.status === "REJECTED").length
    };

    res.json({
      stats: [
        { label: "Total Templates", value: String(stats.total), note: "WABA library", noteTone: "blue" },
        { label: "Approved", value: String(stats.approved), note: "Ready to send", noteTone: "green" },
        { label: "In Review", value: String(stats.inReview), note: "Meta review", noteTone: "amber" },
        { label: "Rejected", value: String(stats.rejected), note: "Needs edits", noteTone: "red" }
      ],
      rows: templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: toTitleCase(t.category),
        language: t.language,
        status: STATUS_LABEL[t.status],
        uses: t.uses,
        lastSent: t.lastSentAt ? formatRelativeTime(t.lastSentAt) : "—",
        readRate: t.uses ? `${t.readRate.toFixed(0)}%` : "—"
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/preview", async (req, res, next) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ name: template.name, body: template.bodyText, footer: template.footerText });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, category, language, bodyText, footerText } = req.body;
    if (!name || !category || !bodyText) {
      return res.status(400).json({ error: "name, category and bodyText are required" });
    }
    // NOTE: submitting to Meta for approval happens here in a real integration
    // (POST /{waba-id}/message_templates). We just persist it as IN_REVIEW.
    const template = await prisma.template.create({
      data: {
        name,
        category: category.toUpperCase(),
        language: language ?? "English",
        bodyText,
        footerText,
        status: "IN_REVIEW"
      }
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

export default router;
