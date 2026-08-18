import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { evaluateCampaignHealth } from "../lib/campaignHealth.js";

export const bouncesRouter = Router();

// Provider-agnostic shape: normalize SES (SNS bounce notification),
// Postmark (bounce webhook), or SMTP-relay bounce reports to this before
// they hit this handler — their payload shapes all differ. This deliberately
// mirrors webhooks.js's inbound-email pattern.
const bounceSchema = z.object({
  email: z.string().email(),
  kind: z.enum(["HARD", "SOFT", "COMPLAINT"]),
  reason: z.string().optional()
});

function requireWebhookSecret(req, res, next) {
  const provided = req.headers["x-webhook-secret"];
  if (!process.env.INBOUND_WEBHOOK_SECRET || provided !== process.env.INBOUND_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid or missing webhook secret" });
  }
  next();
}

// After recording a bounce, check whether the owning campaign's overall
// bounce/complaint rate has crossed a threshold that warrants auto-pausing
// it — a rising bounce rate left to run is exactly how a sending domain's
// reputation gets tanked. Only acts if the campaign opted into autoPause
// and isn't already paused.
async function maybeAutoPauseCampaign(campaignId) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaign.autoPause || campaign.status !== "SENDING") {
    return;
  }

  const [sentCount, bounceCount, complaintCount] = await Promise.all([
    prisma.activityLog.count({ where: { kind: "BRANCH_EMAIL_SENT", lead: { campaignId } } }),
    prisma.lead.count({ where: { campaignId, bounced: true, bounceKind: "HARD" } }),
    prisma.lead.count({ where: { campaignId, bounced: true, bounceKind: "COMPLAINT" } })
  ]);

  const { shouldPause, reason } = evaluateCampaignHealth({ sentCount, bounceCount, complaintCount });
  if (!shouldPause) {
    return;
  }

  await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaignId }, data: { status: "SCHEDULED" } }),
    prisma.activityLog.create({
      data: {
        // Attach to any lead in the campaign so it shows up somewhere in
        // the activity trail — this is a campaign-level event, not really
        // lead-scoped, but ActivityLog is currently modeled per-lead only.
        leadId: (await prisma.lead.findFirstOrThrow({ where: { campaignId } })).id,
        kind: "SEND_BLOCKED",
        title: "Campaign auto-paused",
        detail: `Auto-paused "${campaign.name}": ${reason}`
      }
    })
  ]);

  console.warn(`[campaign-health] auto-paused campaign ${campaignId}: ${reason}`);
}

bouncesRouter.post("/", requireWebhookSecret, asyncHandler(async (req, res) => {
  const parsed = bounceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, kind, reason } = parsed.data;

  const lead = await prisma.lead.findFirst({ where: { email } });
  if (!lead) {
    console.warn(`[bounce-webhook] no lead found for ${email}`);
    return res.status(200).json({ matched: false });
  }

  // Hard bounces and spam complaints suppress permanently. A soft bounce
  // (mailbox full, greylisting, temporary DNS failure) is expected to
  // clear up on its own — repeatedly retrying those is normal; repeatedly
  // retrying a hard bounce is what gets a sending domain blocklisted.
  const shouldSuppress = kind === "HARD" || kind === "COMPLAINT";

  await prisma.$transaction([
    ...(shouldSuppress
      ? [prisma.lead.update({ where: { id: lead.id }, data: { bounced: true, bounceKind: kind } })]
      : []),
    prisma.activityLog.create({
      data: {
        leadId: lead.id,
        kind: "BOUNCED",
        title: `${kind} bounce${shouldSuppress ? " — future sends suppressed" : ""}`,
        detail: reason ?? "No reason provided by mail server."
      }
    })
  ]);

  if (shouldSuppress) {
    await maybeAutoPauseCampaign(lead.campaignId);
  }

  res.status(201).json({ matched: true, leadId: lead.id, suppressed: shouldSuppress });
}));
