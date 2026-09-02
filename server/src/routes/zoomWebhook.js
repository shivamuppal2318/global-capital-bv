import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyZoomWebhookSignature, buildZoomUrlValidationResponse } from "../lib/zoomWebhookAuth.js";
import { processMeetingRecording } from "../lib/zoomTranscriptProcessor.js";

export const zoomWebhookRouter = Router();

// endpoint.url_validation is a one-time, unsigned handshake Zoom performs
// the moment this URL is saved (or re-validated) under the app's Event
// Subscriptions — there's nothing to sign yet since it's proving the
// Secret Token match in the other direction, so it's let through the
// signature check below and handled first thing in the route handler.
function isUrlValidationRequest(req) {
  return req.body?.event === "endpoint.url_validation";
}

function requireValidSignature(req, res, next) {
  if (isUrlValidationRequest(req)) return next();

  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secretToken) {
    return res.status(500).json({ error: "Server misconfigured: ZOOM_WEBHOOK_SECRET_TOKEN is not set." });
  }
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
  const signatureHeader = req.headers["x-zm-signature"];
  const timestampHeader = req.headers["x-zm-request-timestamp"];
  if (!verifyZoomWebhookSignature(rawBody, signatureHeader, timestampHeader, secretToken)) {
    return res.status(401).json({ error: "Invalid or missing Zoom webhook signature." });
  }
  next();
}

zoomWebhookRouter.post(
  "/",
  requireValidSignature,
  asyncHandler(async (req, res) => {
    if (isUrlValidationRequest(req)) {
      const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      if (!secretToken) {
        return res.status(500).json({ error: "Server misconfigured: ZOOM_WEBHOOK_SECRET_TOKEN is not set." });
      }
      const plainToken = req.body?.payload?.plainToken;
      if (!plainToken) return res.status(400).json({ error: "Missing payload.plainToken." });
      return res.status(200).json(buildZoomUrlValidationResponse(plainToken, secretToken));
    }

    const { event, payload } = req.body ?? {};

    if (event !== "recording.completed") {
      // Acknowledge and ignore — same reasoning as the Calendly webhook's
      // fallthrough: Zoom shouldn't keep retrying a delivery this
      // receiver deliberately doesn't act on.
      return res.status(200).json({ handled: false, event: event ?? null });
    }

    const zoomMeetingId = payload?.object?.id != null ? String(payload.object.id) : null;
    const zoomUuid = payload?.object?.uuid ?? null;
    if (!zoomMeetingId) {
      return res.status(400).json({ error: "Missing payload.object.id" });
    }

    const meeting = await prisma.meeting.findFirst({ where: { zoomMeetingId }, include: { lead: true } });
    if (!meeting) {
      // Not every Zoom meeting on the account was scheduled through this
      // app (or it's from before the app existed) — 200 either way so
      // Zoom doesn't retry something that will never match.
      console.warn(`[zoom-webhook] recording.completed for unknown zoomMeetingId ${zoomMeetingId}`);
      return res.status(200).json({ matched: false });
    }

    const zoomSettings = await prisma.zoomSettings.findFirst();
    if (!zoomSettings?.accountId || !zoomSettings?.clientId || !zoomSettings?.clientSecret) {
      console.error("[zoom-webhook] recording.completed received but Zoom isn't connected (Admin Panel → Zoom API).");
      return res.status(200).json({ matched: true, processed: false, reason: "Zoom not connected" });
    }

    let result;
    try {
      result = await processMeetingRecording({ meeting, zoomSettings, zoomIdentifier: zoomUuid ?? zoomMeetingId });
    } catch (err) {
      console.error(`[zoom-webhook] failed to process recording for meeting ${meeting.id}: ${err.message}`);
      return res.status(200).json({ matched: true, processed: false, reason: err.message });
    }

    if (!result.ok) {
      console.warn(`[zoom-webhook] meeting ${meeting.id}: ${result.reason}`);
      return res.status(200).json({ matched: true, processed: false, reason: result.reason });
    }

    res.status(200).json({ matched: true, processed: true, summarized: result.summarized });
  })
);
