import { Router } from "express";
import { prisma } from "../db.js";
import { createZoomMeeting } from "../lib/zoomClient.js";
import { callMetrics } from "../lib/relationshipMetrics.js";
import { getAnthropicClient, getAnthropicModel } from "../lib/anthropic.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      include: { lead: true },
      orderBy: { startTime: "desc" }
    });
    res.json(
      meetings.map((m) => ({
        id: m.id,
        topic: m.topic,
        startTime: m.startTime,
        durationMinutes: m.durationMinutes,
        status: m.status,
        joinUrl: m.joinUrl,
        startUrl: m.startUrl,
        clientAttendees: m.clientAttendees,
        ourAttendees: m.ourAttendees,
        actualDurationMinutes: m.actualDurationMinutes,
        notes: m.notes,
        aiSummary: m.aiSummary,
        aiSummaryUpdatedAt: m.aiSummaryUpdatedAt,
        nextAction: m.nextAction,
        nextActionDueAt: m.nextActionDueAt,
        nextMeetingScheduled: m.nextMeetingScheduled,
        recordingLink: m.recordingLink,
        clientSatisfaction: m.clientSatisfaction,
        lead: m.lead ? { id: m.lead.id, name: m.lead.name, company: m.lead.company } : null
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { leadId, topic, startTime, durationMinutes } = req.body;
    if (!topic || !startTime) return res.status(400).json({ error: "topic and startTime are required" });

    const settings = await prisma.zoomSettings.findFirst();
    if (!settings?.accountId || !settings?.clientId || !settings?.clientSecret || !settings?.hostEmail) {
      return res
        .status(400)
        .json({ error: "Zoom isn't connected yet — add your Account ID, Client ID, Client Secret and Host Email in Meetings → Zoom Connection first." });
    }

    let lead = null;
    if (leadId) {
      lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return res.status(404).json({ error: "Lead not found" });
    }

    let zoomMeeting;
    try {
      zoomMeeting = await createZoomMeeting({
        ...settings,
        topic,
        startTime,
        durationMinutes: durationMinutes ?? 30
      });
    } catch (zoomErr) {
      return res.status(502).json({ error: `Zoom couldn't create the meeting: ${zoomErr.message}` });
    }

    const meeting = await prisma.meeting.create({
      data: {
        leadId: lead?.id,
        topic,
        startTime: new Date(startTime),
        durationMinutes: durationMinutes ?? 30,
        zoomMeetingId: zoomMeeting.id,
        joinUrl: zoomMeeting.joinUrl,
        startUrl: zoomMeeting.startUrl,
        status: "Scheduled"
      },
      include: { lead: true }
    });

    res.status(201).json({
      id: meeting.id,
      topic: meeting.topic,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      status: meeting.status,
      joinUrl: meeting.joinUrl,
      startUrl: meeting.startUrl,
      lead: meeting.lead ? { id: meeting.lead.id, name: meeting.lead.name, company: meeting.lead.company } : null
    });
  } catch (err) {
    next(err);
  }
});

const TEXT_FIELDS = ["clientAttendees", "ourAttendees", "notes", "nextAction", "recordingLink", "status"];

router.patch("/:id", async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    // Previously this only ever wrote `status` and silently discarded
    // everything else, which made the whole post-call capture form a no-op.
    const data = {};
    for (const f of TEXT_FIELDS) {
      if (req.body[f] !== undefined) data[f] = req.body[f]?.toString().trim() || null;
    }
    if (req.body.actualDurationMinutes !== undefined) {
      const n = Number(req.body.actualDurationMinutes);
      data.actualDurationMinutes = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    if (req.body.clientSatisfaction !== undefined) {
      const n = Number(req.body.clientSatisfaction);
      // Clamped rather than rejected: a stray 9 becomes 5 instead of
      // failing the whole save and losing the notes typed alongside it.
      data.clientSatisfaction = Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(1, Math.round(n))) : null;
    }
    if (req.body.nextMeetingScheduled !== undefined) data.nextMeetingScheduled = Boolean(req.body.nextMeetingScheduled);
    if (req.body.nextActionDueAt !== undefined) {
      data.nextActionDueAt = req.body.nextActionDueAt ? new Date(req.body.nextActionDueAt) : null;
    }

    const updated = await prisma.meeting.update({ where: { id: meeting.id }, data, include: { lead: true } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get("/metrics", async (_req, res, next) => {
  try {
    res.json(callMetrics(await prisma.meeting.findMany()));
  } catch (err) {
    next(err);
  }
});

// Summarises the call notes with Claude. Stored on the meeting so it isn't
// regenerated (and re-billed) every time the page loads — regenerating is
// an explicit action.
router.post("/:id/summarise", async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id }, include: { lead: true } });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    if (!meeting.notes?.trim()) {
      return res.status(400).json({ error: "Add call notes first — there's nothing to summarise yet." });
    }

    const anthropic = await getAnthropicClient();
    if (!anthropic) {
      return res.status(503).json({
        error: "No Claude API key is set. An admin can add one under Admin Panel → AI Assistant."
      });
    }

    const response = await anthropic.messages.create({
      model: await getAnthropicModel(),
      max_tokens: 400,
      system:
        "You summarise investment-team call notes. Reply with 2-4 short bullet points covering what was discussed and what was agreed, then a final line starting 'Next action:' if one is stated. " +
        "Use only what the notes actually say — do not invent numbers, commitments or next steps. If the notes are too thin to summarise, say so in one line.",
      messages: [
        {
          role: "user",
          content: `Call with ${meeting.lead ? `${meeting.lead.name} (${meeting.lead.company})` : "an unlinked contact"} on ${meeting.startTime.toISOString().slice(0, 10)}.

Notes:
${meeting.notes}`
        }
      ]
    });

    const summary = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!summary) return res.status(502).json({ error: "The model returned an empty summary. Try again." });

    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { aiSummary: summary, aiSummaryUpdatedAt: new Date() },
      include: { lead: true }
    });
    res.json(updated);
  } catch (err) {
    if (err.status === 401) {
      return res.status(503).json({ error: "Anthropic rejected the configured key — check Admin Panel → AI Assistant." });
    }
    next(err);
  }
});

export default router;
