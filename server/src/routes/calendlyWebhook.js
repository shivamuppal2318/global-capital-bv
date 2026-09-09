import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyCalendlyWebhookSignature } from "../lib/calendlyWebhookAuth.js";
import { createZoomMeeting } from "../lib/zoomClient.js";
import { sendRawEmail, plainTextToHtml } from "../lib/leadSender.js";

export const calendlyWebhookRouter = Router();

function requireValidSignature(req, res, next) {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    return res.status(500).json({ error: "Server misconfigured: CALENDLY_WEBHOOK_SIGNING_KEY is not set." });
  }
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
  const signatureHeader = req.headers["calendly-webhook-signature"];
  if (!verifyCalendlyWebhookSignature(rawBody, signatureHeader, signingKey)) {
    return res.status(401).json({ error: "Invalid or missing Calendly webhook signature." });
  }
  next();
}

// Calendly only picks the time — it doesn't create a real video-call room.
// Once a lead books, this creates the actual Zoom meeting (same
// Server-to-Server app as the Meetings module) and emails them the real
// join link. Best-effort: the booking itself is already recorded by the
// caller regardless of whether this succeeds, since Calendly shouldn't
// retry/fail the whole webhook over a Zoom hiccup.
async function scheduleZoomForBooking(lead, scheduledFor, calendlyEvent) {
  const settings = await prisma.zoomSettings.findFirst();
  if (!settings?.accountId || !settings?.clientId || !settings?.clientSecret || !settings?.hostEmail) {
    return { created: false, reason: "Zoom isn't connected (Admin Panel → Zoom API)." };
  }

  const startTime = calendlyEvent?.start_time;
  const endTime = calendlyEvent?.end_time;
  const durationMinutes = startTime && endTime ? Math.max(15, Math.round((new Date(endTime) - new Date(startTime)) / 60000)) : 30;

  let zoomMeeting;
  try {
    zoomMeeting = await createZoomMeeting({
      ...settings,
      topic: `Intro call with ${lead.name} (${lead.company})`,
      startTime: scheduledFor,
      durationMinutes
    });
  } catch (err) {
    return { created: false, reason: err.message };
  }

  await prisma.emailActivityLog.create({
    data: {
      leadId: lead.id,
      kind: "CALL_BOOKED",
      title: "Zoom meeting created for booked call",
      detail: `${zoomMeeting.joinUrl}`
    }
  });

  if (lead.email) {
    const when = new Date(scheduledFor).toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
    });
    const body = `Hi ${lead.name},\n\nYour call is confirmed for ${when} (${durationMinutes} minutes).\n\nJoin here: ${zoomMeeting.joinUrl}\n\nLooking forward to speaking.\n\nBest regards,\nGlobal Capital BV`;
    try {
      await sendRawEmail(lead.id, { subject: "Confirmed — your call with Global Capital BV", body, html: plainTextToHtml(body) });
    } catch (err) {
      // The meeting exists either way — a suppressed/capped send just means
      // the join link only lives in the activity log above, not a lost booking.
      return { created: true, joinUrl: zoomMeeting.joinUrl, emailReason: err.message };
    }
  }

  return { created: true, joinUrl: zoomMeeting.joinUrl };
}

// Calendly's actual payload shape (per their v2 webhook docs, not verified
// against a live account here): { event: "invitee.created" | "invitee.canceled",
// payload: { email, name, scheduled_event: { start_time, ... }, ... } }.
// Only reading the handful of fields this needs, rather than modeling the
// full payload, so an unrelated field Calendly adds later doesn't break
// parsing.
calendlyWebhookRouter.post("/", requireValidSignature, asyncHandler(async (req, res) => {
  const { event, payload } = req.body ?? {};
  const inviteeEmail = payload?.email?.toLowerCase();

  if (!event || !inviteeEmail) {
    return res.status(400).json({ error: "Missing event or payload.email" });
  }

  const lead = await prisma.emailLead.findFirst({ where: { email: inviteeEmail } });
  if (!lead) {
    console.warn(`[calendly-webhook] no lead found for ${inviteeEmail}`);
    return res.status(200).json({ matched: false });
  }

  if (event === "invitee.created") {
    const scheduledFor = payload?.scheduled_event?.start_time ? new Date(payload.scheduled_event.start_time) : null;
    await prisma.$transaction([
      prisma.emailLead.update({
        where: { id: lead.id },
        data: { callBookedAt: new Date(), callScheduledFor: scheduledFor, callCanceledAt: null, stage: "Zoom 1 Pending" }
      }),
      prisma.emailActivityLog.create({
        data: {
          leadId: lead.id,
          kind: "CALL_BOOKED",
          title: "Call booked via Calendly",
          detail: scheduledFor ? `Scheduled for ${scheduledFor.toISOString()}.` : "Booked (no scheduled time in payload)."
        }
      })
    ]);

    const zoomResult = scheduledFor ? await scheduleZoomForBooking(lead, scheduledFor, payload.scheduled_event) : { created: false };
    return res.status(201).json({ matched: true, leadId: lead.id, event, zoom: zoomResult });
  }

  if (event === "invitee.canceled") {
    await prisma.$transaction([
      prisma.emailLead.update({ where: { id: lead.id }, data: { callCanceledAt: new Date() } }),
      prisma.emailActivityLog.create({
        data: { leadId: lead.id, kind: "CALL_CANCELED", title: "Call canceled via Calendly", detail: "Invitee canceled the booked call." }
      })
    ]);
    return res.status(201).json({ matched: true, leadId: lead.id, event });
  }

  // Any other Calendly event type — acknowledge without acting, so
  // Calendly doesn't retry a webhook this receiver deliberately ignores.
  res.status(200).json({ matched: true, leadId: lead.id, event, handled: false });
}));
