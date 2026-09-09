import { Router } from "express";
import { prisma } from "../db.js";
import { formatRelativeTime } from "../utils.js";

const router = Router();

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FUNNEL_ORDER = ["NEW", "ASSIGNED", "REPLIED", "RESOLVED"];
const FUNNEL_TONE = { NEW: "cyan", ASSIGNED: "violet", REPLIED: "amber", RESOLVED: "green" };

router.get("/", async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const volumeRows = await prisma.$queryRaw`
      SELECT date_trunc('day', "sentAt") AS day, "direction" AS direction, COUNT(*)::int AS count
      FROM "Message"
      WHERE "sentAt" >= ${since}
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;

    const volumeMap = new Map();
    for (const row of volumeRows) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = volumeMap.get(key) ?? { date: key, sent: 0, received: 0 };
      if (row.direction === "OUTBOUND") entry.sent = row.count;
      else entry.received = row.count;
      volumeMap.set(key, entry);
    }
    const volume = [...volumeMap.values()]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(({ date, sent, received }) => ({ day: DAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()], sent, received }));

    const statusCounts = await prisma.conversation.groupBy({ by: ["status"], _count: { _all: true } });
    const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
    const maxCount = Math.max(...FUNNEL_ORDER.map((s) => countByStatus[s] ?? 0), 1);
    const funnel = FUNNEL_ORDER.map((status) => {
      const count = countByStatus[status] ?? 0;
      return {
        stage: status.charAt(0) + status.slice(1).toLowerCase(),
        count,
        width: `${Math.round((count / maxCount) * 100)}%`,
        tone: FUNNEL_TONE[status]
      };
    });

    const topTemplatesRaw = await prisma.template.findMany({ orderBy: { uses: "desc" }, take: 4 });
    const topTemplates = topTemplatesRaw.map((t) => [
      t.name,
      `${t.uses.toLocaleString()} sent`,
      `${t.readRate.toFixed(0)}% read`,
      `${t.replyRate.toFixed(0)}% reply`
    ]);

    const agentsRaw = await prisma.agent.findMany({ orderBy: { assignedCount: "desc" } });
    const agents = agentsRaw.map((a) => [
      a.name,
      `${a.assignedCount} assigned`,
      `${a.resolvedCount} resolved`,
      `${a.avgResponseMins}m avg`,
      a.csat.toFixed(1)
    ]);

    const activityRaw = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
    const activity = activityRaw.map((a) => ({ who: a.who, what: a.what, tone: a.tone, time: formatRelativeTime(a.createdAt) }));

    res.json({ volume, funnel, topTemplates, agents, activity });
  } catch (err) {
    next(err);
  }
});

export default router;
