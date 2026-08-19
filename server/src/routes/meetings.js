import { Router } from "express";
import { prisma } from "../db.js";
import { createZoomMeeting } from "../lib/zoomClient.js";

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

router.patch("/:id", async (req, res, next) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: req.body.status ?? meeting.status }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
