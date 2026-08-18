import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const [activeConversations, templateAgg, templates] = await Promise.all([
      prisma.conversation.count({ where: { status: { not: "RESOLVED" } } }),
      prisma.template.aggregate({ _sum: { uses: true } }),
      prisma.template.findMany({ select: { uses: true, readRate: true, replyRate: true } })
    ]);

    const totalUses = templates.reduce((sum, t) => sum + t.uses, 0) || 1;
    const readRate = templates.reduce((sum, t) => sum + t.readRate * t.uses, 0) / totalUses;
    const replyRate = templates.reduce((sum, t) => sum + t.replyRate * t.uses, 0) / totalUses;

    res.json({
      badge: "Module · WhatsApp Business API",
      title: "WhatsApp Business",
      description:
        "Official WhatsApp Business API — conversations, approved templates, campaigns, drip sequences, bots and CRM automation in one workspace.",
      stats: [
        { label: "Active Conversations", value: String(activeConversations), note: "24h window", noteTone: "green" },
        {
          label: "Template Messages",
          value: (templateAgg._sum.uses ?? 0).toLocaleString(),
          note: "Last 30 days",
          noteTone: "cyan"
        },
        { label: "Read Rate", value: `${readRate.toFixed(0)}%`, note: "+11pts vs email", noteTone: "blue" },
        { label: "Reply Rate", value: `${replyRate.toFixed(0)}%`, note: "Median 12m", noteTone: "indigo" }
      ]
    });
  } catch (err) {
    next(err);
  }
});

export default router;
