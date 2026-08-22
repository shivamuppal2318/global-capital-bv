import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isQueueEnabled } from "../queue/cadenceQueue.js";

export const emailCampaignsRouter = Router();

// Lets the frontend show an honest "nothing is actually being sent yet"
// banner instead of a lead just silently sitting at "No reply yet"
// forever with no explanation — REDIS_URL not being set means the queue
// never runs, so intro/follow-up emails never fire even though the lead
// was saved successfully. Host/from-address are safe to expose (no
// secrets) and let the UI show *what's* configured, not just a yes/no.
emailCampaignsRouter.get("/system-status", asyncHandler(async (_req, res) => {
  const emailProvider = process.env.EMAIL_PROVIDER ?? "dev";
  res.json({
    queueEnabled: isQueueEnabled(),
    emailProvider,
    smtpHost: emailProvider === "smtp" ? (process.env.SMTP_HOST ?? null) : null,
    smtpFromAddress: emailProvider === "smtp" ? (process.env.SMTP_FROM_ADDRESS ?? null) : null
  });
}));

// Round-trip SMTP check via nodemailer's transporter.verify() — connects
// and authenticates but sends nothing, same pattern as
// emailAccounts.js's per-mailbox /:id/test. This is the single
// env-configured provider (SMTP_HOST/SMTP_USER/...), not a per-account one.
emailCampaignsRouter.post("/test-connection", asyncHandler(async (_req, res) => {
  if ((process.env.EMAIL_PROVIDER ?? "dev") !== "smtp") {
    return res.json({ success: false, message: `EMAIL_PROVIDER is "${process.env.EMAIL_PROVIDER ?? "dev"}", not "smtp" — nothing to test.` });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.verify();
    res.json({ success: true, message: `Connected to ${process.env.SMTP_HOST} — SMTP credentials are valid.` });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}));

const createCampaignSchema = z.object({
  name: z.string().min(1),
  audience: z.string().min(1),
  template: z.string().min(1),
  dailyLimit: z.number().int().positive().default(2000),
  delayDays: z.number().int().positive().default(3),
  followUpCount: z.number().int().min(0).default(3),
  abTest: z.boolean().default(true),
  autoPause: z.boolean().default(true),
  // Optional — omit to fall back to the single global env-configured
  // provider, exactly as every campaign behaved before EmailAccount existed.
  emailAccountId: z.string().optional()
});

// Real open/click rates, computed from ActivityLog rows the tracking pixel
// and click-redirect actually write (see routes/tracking.js) — not the
// static/formula-based numbers the frontend used to show before tracking
// existed. Null (not "0%") when nothing has been sent yet, so the UI can
// tell "no data" apart from "0% engagement."
// Counts distinct leads, not raw event rows — a lead re-opening the same
// email (common: preview panes, forwarding) writes another EMAIL_OPENED
// row each time, which would otherwise push the rate above 100%.
async function distinctLeadCount(campaignId, kind) {
  const rows = await prisma.emailActivityLog.findMany({
    where: { kind, lead: { campaignId } },
    distinct: ["leadId"],
    select: { leadId: true }
  });
  return rows.length;
}

async function withEngagementRates(campaign) {
  const [sent, opened, clicked] = await Promise.all([
    prisma.emailActivityLog.count({ where: { kind: "BRANCH_EMAIL_SENT", lead: { campaignId: campaign.id } } }),
    distinctLeadCount(campaign.id, "EMAIL_OPENED"),
    distinctLeadCount(campaign.id, "LINK_CLICKED")
  ]);
  return {
    ...campaign,
    engagement: {
      sent,
      opened,
      clicked,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : null,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : null
    }
  };
}

emailCampaignsRouter.get("/", asyncHandler(async (_req, res) => {
  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } }
  });
  const withRates = await Promise.all(campaigns.map(withEngagementRates));
  res.json(withRates);
}));

emailCampaignsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campaign = await prisma.emailCampaign.create({ data: parsed.data });
  res.status(201).json(campaign);
}));

// Only allows deleting an empty campaign (no leads ever enrolled) — mainly
// for cleaning up an accidental duplicate (e.g. from POST /campaigns being
// called twice with the same name before PATCH existed for edits). A
// campaign with real leads/activity attached should be paused, not deleted
// — deleting it would cascade-orphan or block on its Lead/ActivityLog rows.
emailCampaignsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { leads: true } } }
  });
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign._count.leads > 0) {
    return res.status(409).json({ error: `"${campaign.name}" has ${campaign._count.leads} lead(s) enrolled — pause it instead of deleting.` });
  }
  await prisma.emailCampaign.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

const updateCampaignSchema = z.object({
  audience: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  dailyLimit: z.number().int().positive().optional(),
  delayDays: z.number().int().positive().optional(),
  followUpCount: z.number().int().min(0).optional(),
  abTest: z.boolean().optional(),
  autoPause: z.boolean().optional()
});

// Edits an existing campaign's settings in place. Added because the "Save
// automation" form used to always POST a brand-new campaign, even when the
// user was clicking an already-selected one and just tweaking a setting —
// producing duplicate rows with the same name (harmless in the DB, but
// confusing clutter in the UI). Deliberately excludes `name` — renaming a
// campaign after leads/activity/ActivityLog rows reference it by name
// elsewhere (e.g. the reply-branch "campaign.name === selectedLead.campaign"
// matching on the frontend) would silently break those associations.
emailCampaignsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  res.json(campaign);
}));

emailCampaignsRouter.post("/:id/pause", asyncHandler(async (req, res) => {
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: { status: "SCHEDULED" }
  });
  res.json(campaign);
}));

emailCampaignsRouter.post("/:id/resume", asyncHandler(async (req, res) => {
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: { status: "SENDING" }
  });
  res.json(campaign);
}));

const assignAccountSchema = z.object({
  emailAccountId: z.string().nullable() // null explicitly clears it, falling back to the global env provider
});

emailCampaignsRouter.post("/:id/email-account", asyncHandler(async (req, res) => {
  const parsed = assignAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (parsed.data.emailAccountId) {
    const account = await prisma.emailAccount.findUnique({ where: { id: parsed.data.emailAccountId } });
    if (!account) {
      return res.status(404).json({ error: "Email account not found" });
    }
    if (!account.isActive) {
      return res.status(409).json({ error: `Email account "${account.label}" is deactivated.` });
    }
  }

  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: { emailAccountId: parsed.data.emailAccountId }
  });
  res.json(campaign);
}));
