import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

const STATUS_LABEL = { DRAFT: "Draft", SCHEDULED: "Scheduled", SENDING: "Sending", COMPLETED: "Completed" };

router.get("/", async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({ include: { template: true }, orderBy: { createdAt: "desc" } });

    const sentTotal = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
    const deliveredTotal = campaigns.reduce((sum, c) => sum + c.deliveredCount, 0);
    const repliedTotal = campaigns.reduce((sum, c) => sum + c.repliedCount, 0);
    const recipientsTotal = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
    const activeNow = campaigns.filter((c) => c.status === "SENDING").length;
    const deliveredRate = sentTotal ? (deliveredTotal / sentTotal) * 100 : 0;
    const replyRate = sentTotal ? (repliedTotal / sentTotal) * 100 : 0;

    res.json({
      stats: [
        { label: "Campaigns Sent (30d)", value: String(campaigns.length), note: `${activeNow} active now`, noteTone: "blue" },
        { label: "Recipients", value: recipientsTotal.toLocaleString(), note: "Across all campaigns", noteTone: "cyan" },
        { label: "Delivered Rate", value: `${deliveredRate.toFixed(1)}%`, note: "Healthy", noteTone: "green" },
        { label: "Reply Rate", value: `${replyRate.toFixed(1)}%`, note: "vs last month", noteTone: "indigo" }
      ],
      rows: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template.name,
        audience: c.audienceLabel,
        status: STATUS_LABEL[c.status],
        sent: String(c.sentCount),
        delivered: String(c.deliveredCount),
        read: String(c.readCount),
        replied: String(c.repliedCount)
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, templateId, audienceLabel, scheduledAt } = req.body;
    if (!name || !templateId || !audienceLabel) {
      return res.status(400).json({ error: "name, templateId and audienceLabel are required" });
    }
    const campaign = await prisma.campaign.create({
      data: {
        name,
        templateId,
        audienceLabel,
        status: scheduledAt ? "SCHEDULED" : "DRAFT",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

export default router;
