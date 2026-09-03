import { Router } from "express";
import { prisma } from "../db.js";
import { createZoomMeeting } from "../lib/zoomClient.js";
import { callMetrics } from "../lib/relationshipMetrics.js";
import { getAnthropicClient, getAnthropicModel } from "../lib/anthropic.js";
import { sendSystemEmail, zoomMeetingInviteEmail } from "../lib/systemMailer.js";
import { processMeetingRecording } from "../lib/zoomTranscriptProcessor.js";
import { relatedLeadOwnerWhereClause } from "../lib/channelPartnerLeadScope.js";

const router = Router();

// A Channel Partner's Zoom Call access is read-only, scoped to meetings on
// their own referred leads only (see GET / below) -- company-wide metrics
// and every write/action route stay refused outright. Same pattern as
// documents.js's blockChannelPartner.
function blockChannelPartner(req, res, next) {
  if (req.channelPartner) {
    return res.status(403).json({ error: "Your account has read-only access to meetings on your own referred leads." });
  }
  next();
}

// Which ordinal call this is for its lead — "Zoom Call 1" / "Zoom Call 2"
// / etc., purely by chronological order of every meeting tied to that
// leadId. Same convention lib/clientPortalStages.js's deriveZoomStage/
// deriveZoomStage2 already use for the client portal, computed here too
// since the staff-side list has no such split today (a lead's calls are
// just an undifferentiated list) — kept as one small pass over the
// already-loaded page of meetings rather than a second query.
function callNumbersByLead(meetings) {
  const byLead = new Map();
  for (const m of meetings) {
    if (!m.leadId) continue;
    if (!byLead.has(m.leadId)) byLead.set(m.leadId, []);
    byLead.get(m.leadId).push(m);
  }
  const numberById = new Map();
  for (const leadMeetings of byLead.values()) {
    const sorted = [...leadMeetings].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    sorted.forEach((m, index) => numberById.set(m.id, index + 1));
  }
  return numberById;
}

router.get("/", async (req, res, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: { ...relatedLeadOwnerWhereClause(req) },
      include: { lead: true },
      orderBy: { startTime: "desc" }
    });
    const callNumbers = callNumbersByLead(meetings);
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
        transcriptText: m.transcriptText,
        transcriptFetchedAt: m.transcriptFetchedAt,
        transcriptSummary: m.transcriptSummary,
        transcriptSummaryUpdatedAt: m.transcriptSummaryUpdatedAt,
        callNumber: m.leadId ? callNumbers.get(m.id) : null,
        lead: m.lead ? { id: m.lead.id, name: m.lead.name, company: m.lead.company } : null
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/", blockChannelPartner, async (req, res, next) => {
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
        // Each employee schedules as their own licensed Zoom user when one
        // is assigned (Admin Panel -> Employees), so their meetings run
        // concurrently under separate hosts instead of all landing on the
        // one global fallback account.
        hostEmail: req.user.zoomHostEmail || settings.hostEmail,
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

    // Best-effort: the meeting is already created on Zoom and saved either
    // way, so a mail failure is reported alongside it rather than failing
    // the whole request and leaving a meeting nobody was told about.
    let inviteSent = false;
    let inviteError = null;
    if (lead?.email) {
      const mail = zoomMeetingInviteEmail({
        contactName: lead.name,
        company: lead.company,
        topic,
        startTime,
        durationMinutes: durationMinutes ?? 30,
        joinUrl: zoomMeeting.joinUrl,
        hostName: req.user.name
      });
      const delivery = await sendSystemEmail({ to: lead.email, ...mail });
      inviteSent = delivery.sent;
      inviteError = delivery.reason ?? null;
    }

    res.status(201).json({
      id: meeting.id,
      topic: meeting.topic,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      status: meeting.status,
      joinUrl: meeting.joinUrl,
      startUrl: meeting.startUrl,
      inviteSent,
      inviteError,
      lead: meeting.lead ? { id: meeting.lead.id, name: meeting.lead.name, company: meeting.lead.company } : null
    });
  } catch (err) {
    next(err);
  }
});

const TEXT_FIELDS = ["clientAttendees", "ourAttendees", "notes", "nextAction", "recordingLink", "status"];

router.patch("/:id", blockChannelPartner, async (req, res, next) => {
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

router.get("/metrics", blockChannelPartner, async (_req, res, next) => {
  try {
    res.json(callMetrics(await prisma.meeting.findMany()));
  } catch (err) {
    next(err);
  }
});

// Summarises the call notes with Claude. Stored on the meeting so it isn't
// regenerated (and re-billed) every time the page loads — regenerating is
// an explicit action.
router.post("/:id/summarise", blockChannelPartner, async (req, res, next) => {
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

// Manual fallback for the automatic recording.completed webhook
// (routes/zoomWebhook.js) — for whenever the webhook hasn't fired yet
// (Zoom's own processing lag after a call ends, a missed delivery, or
// local dev where Zoom has no way to reach this server at all). Same
// pipeline either way, see lib/zoomTranscriptProcessor.js.
router.post("/:id/fetch-transcript", blockChannelPartner, async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id }, include: { lead: true } });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    if (!meeting.zoomMeetingId) {
      return res.status(400).json({ error: "This call has no Zoom meeting ID — it wasn't created through this app's Zoom connection." });
    }

    const zoomSettings = await prisma.zoomSettings.findFirst();
    if (!zoomSettings?.accountId || !zoomSettings?.clientId || !zoomSettings?.clientSecret) {
      return res.status(400).json({ error: "Zoom isn't connected — add credentials in Admin Panel → Zoom API first." });
    }

    let result;
    try {
      result = await processMeetingRecording({ meeting, zoomSettings, zoomIdentifier: meeting.zoomMeetingId });
    } catch (zoomErr) {
      return res.status(502).json({ error: `Zoom rejected the recordings request: ${zoomErr.message}` });
    }

    if (!result.ok) return res.status(404).json({ error: result.reason });
    res.json(result.meeting);
  } catch (err) {
    next(err);
  }
});

export default router;
