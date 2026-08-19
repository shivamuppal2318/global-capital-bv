import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyCalendlyWebhookSignature } from "../lib/calendlyWebhookAuth.js";

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
    return res.status(201).json({ matched: true, leadId: lead.id, event });
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
