import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { recordReply } from "../lib/replyRecorder.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const webhooksRouter = Router();

// Provider-agnostic shape expected here: { fromEmail, textBody }. Real
// providers (SES inbound via SNS, Postmark inbound webhook) have different
// payload shapes — normalize them to this in a provider-specific adapter
// before this handler, rather than branching on provider format here.
const inboundEmailSchema = z.object({
  fromEmail: z.string().email(),
  textBody: z.string().min(1)
});

function requireWebhookSecret(req, res, next) {
  const provided = req.headers["x-webhook-secret"];
  if (!process.env.INBOUND_WEBHOOK_SECRET || provided !== process.env.INBOUND_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid or missing webhook secret" });
  }
  next();
}

webhooksRouter.post("/inbound-email", requireWebhookSecret, asyncHandler(async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { fromEmail, textBody } = parsed.data;

  const lead = await prisma.lead.findFirst({ where: { email: fromEmail } });
  if (!lead) {
    // Not necessarily an error: could be a reply from an address that
    // doesn't match any known lead (forwarded thread, CC'd colleague...).
    // Log it and 200 so the provider doesn't retry indefinitely.
    console.warn(`[inbound-webhook] no lead found for ${fromEmail}`);
    return res.status(200).json({ matched: false });
  }

  const { replyType, autoResponse } = await recordReply(lead, textBody);
  res.status(201).json({ matched: true, leadId: lead.id, replyType, autoResponse });
}));
