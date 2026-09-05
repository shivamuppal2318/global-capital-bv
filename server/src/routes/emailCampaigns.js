import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isQueueEnabled, enqueueCampaignBlast } from "../queue/cadenceQueue.js";
import { recordAudit } from "../lib/auditLog.js";
import { ownerWhereClause, ownerIdForCreate } from "../lib/channelPartnerScope.js";
import { filterMatchingLeads } from "../lib/segmentMatching.js";
import { sendCampaignBlastEmail } from "../lib/campaignBlastSender.js";

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
  emailAccountId: z.string().optional(),
  // Optional — omit/null/blank to let replies land on whichever mailbox
  // actually sent the email, the normal behavior with no header override.
  // preprocess so a blank input field (an empty string, not omitted)
  // normalizes to null instead of failing .email() validation.
  replyTo: z.preprocess((val) => (val === "" ? null : val), z.string().trim().email().nullable().optional()),
  // This campaign's own one-time blast content (POST /:id/send-now) — not
  // the per-reply-type EmailTemplate bodies, which drive the cadence
  // instead. Optional/nullable: a campaign can be saved before its content
  // is composed.
  subject: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional()
});

// Every activity kind that represents a real email actually going out —
// used both here and by dashboard-summary's funnel below. Was previously
// only "BRANCH_EMAIL_SENT" here (a pre-existing narrower check than
// dashboard-summary's own SEND_KINDS-based one), which would have made a
// campaign's own Sent count silently ignore its real CAMPAIGN_BLAST_SENT
// sends — the very metric this feature needs to show correctly.
const SEND_KINDS = ["BULK_INTRO_SENT", "BRANCH_EMAIL_SENT", "CAMPAIGN_BLAST_SENT"];

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
    prisma.emailActivityLog.count({ where: { kind: { in: SEND_KINDS }, lead: { campaignId: campaign.id } } }),
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

emailCampaignsRouter.get("/", asyncHandler(async (req, res) => {
  const campaigns = await prisma.emailCampaign.findMany({
    where: ownerWhereClause(req),
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } }
  });
  const withRates = await Promise.all(campaigns.map(withEngagementRates));
  res.json(withRates);
}));

// Loads a campaign only if the caller is allowed to see it — staff get
// everything (ownerWhereClause is {}), a Channel Partner only their own.
// Used by every :id route below instead of a bare findUnique, so a partner
// can't act on another partner's (or admin's) campaign just by knowing its
// id — the "own data" isolation the portal promises has to hold for
// mutations, not just the list view.
async function loadOwnedCampaignOr404(req, res, id) {
  const campaign = await prisma.emailCampaign.findFirst({ where: { id, ...ownerWhereClause(req) } });
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return null;
  }
  return campaign;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Buckets raw ActivityLog rows into local UTC-day counts in JS rather than a
// DB-side date_trunc — Prisma has no portable groupBy-by-day, and 7 days of
// rows is small enough that this is simpler than reaching for $queryRaw.
function bucketByDay(rows, days) {
  const buckets = new Map(days.map((d) => [d.key, 0]));
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key) + 1);
    }
  }
  return days.map((d) => buckets.get(d.key));
}

// Everything the Dashboard tab's chart/funnel/activity/mailbox panels need,
// in one call — real aggregates only, matching what's actually in
// EmailActivityLog/EmailLead/EmailAccount, same principle as
// withEngagementRates above (no formula-based/fabricated numbers).
emailCampaignsRouter.get("/dashboard-summary", asyncHandler(async (req, res) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return { key: d.toISOString().slice(0, 10), day: DAY_LABELS[d.getUTCDay()] };
  });
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

  // A Channel Partner's dashboard should only summarize their own leads —
  // staff get {} (no filter, today's behavior unchanged). Mailbox
  // performance is deliberately left global/unscoped: Phase 1 gives
  // partners no mailboxes of their own (see channelPartnerScope.js's
  // comment and the plan's "no new sending capability" note), so there's
  // no per-partner mailbox data to scope it to.
  const campaignFilter = ownerWhereClause(req);

  const [sentRows, openedRows, totalLeads, repliedLeads, interestedLeads, ndaSignedLeads, recentActivity, mailboxes] = await Promise.all([
    prisma.emailActivityLog.findMany({ where: { kind: { in: SEND_KINDS }, createdAt: { gte: sevenDaysAgo }, lead: { campaign: campaignFilter } }, select: { createdAt: true } }),
    prisma.emailActivityLog.findMany({ where: { kind: "EMAIL_OPENED", createdAt: { gte: sevenDaysAgo }, lead: { campaign: campaignFilter } }, select: { createdAt: true } }),
    prisma.emailLead.count({ where: { campaign: campaignFilter } }),
    prisma.emailLead.count({ where: { replyType: { not: "NO_REPLY" }, campaign: campaignFilter } }),
    prisma.emailLead.count({ where: { replyType: "INTERESTED", campaign: campaignFilter } }),
    prisma.emailLead.count({ where: { ndaSignedAt: { not: null }, campaign: campaignFilter } }),
    prisma.emailActivityLog.findMany({
      where: { lead: { campaign: campaignFilter } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { lead: { select: { name: true, campaign: { select: { name: true } } } } }
    }),
    prisma.emailAccount.findMany({ where: { isActive: true }, orderBy: { label: "asc" } })
  ]);

  const sentByDay = bucketByDay(sentRows, days);
  const openedByDay = bucketByDay(openedRows, days);

  const mailboxPerformance = await Promise.all(
    mailboxes.map(async (account) => {
      const sentToday = await prisma.emailActivityLog.count({
        where: { kind: "BRANCH_EMAIL_SENT", emailAccountId: account.id, createdAt: { gte: today } }
      });
      return { id: account.id, label: account.label, country: account.country, dailyLimit: account.dailyLimit, sentToday };
    })
  );

  res.json({
    volumeByDay: days.map((d, i) => ({ day: d.day, sent: sentByDay[i], opened: openedByDay[i] })),
    funnel: [
      { stage: "Total leads", count: totalLeads },
      { stage: "Replied", count: repliedLeads },
      { stage: "Interested", count: interestedLeads },
      { stage: "NDA signed", count: ndaSignedLeads }
    ],
    recentActivity: recentActivity.map((row) => ({
      id: row.id,
      leadName: row.lead.name,
      campaignName: row.lead.campaign.name,
      kind: row.kind,
      title: row.title,
      createdAt: row.createdAt
    })),
    mailboxPerformance
  });
}));

emailCampaignsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campaign = await prisma.emailCampaign.create({
    data: { ...parsed.data, ownerChannelPartnerId: ownerIdForCreate(req) }
  });
  await recordAudit({ req, action: "campaign.created", entityType: "EmailCampaign", entityId: campaign.id, detail: campaign.name });
  res.status(201).json(campaign);
}));

// Only allows deleting an empty campaign (no leads ever enrolled) — mainly
// for cleaning up an accidental duplicate (e.g. from POST /campaigns being
// called twice with the same name before PATCH existed for edits). A
// campaign with real leads/activity attached should be paused, not deleted
// — deleting it would cascade-orphan or block on its Lead/ActivityLog rows.
emailCampaignsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: req.params.id, ...ownerWhereClause(req) },
    include: { _count: { select: { leads: true } } }
  });
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  if (campaign._count.leads > 0) {
    return res.status(409).json({ error: `"${campaign.name}" has ${campaign._count.leads} lead(s) enrolled — pause it instead of deleting.` });
  }
  await prisma.emailCampaign.delete({ where: { id: req.params.id } });
  await recordAudit({ req, action: "campaign.deleted", entityType: "EmailCampaign", entityId: campaign.id, detail: campaign.name });
  res.status(204).end();
}));

const updateCampaignSchema = z.object({
  audience: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  dailyLimit: z.number().int().positive().optional(),
  delayDays: z.number().int().positive().optional(),
  followUpCount: z.number().int().min(0).optional(),
  abTest: z.boolean().optional(),
  autoPause: z.boolean().optional(),
  replyTo: z.preprocess((val) => (val === "" ? null : val), z.string().trim().email().nullable().optional()),
  subject: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional()
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
  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  res.json(campaign);
}));

emailCampaignsRouter.post("/:id/pause", asyncHandler(async (req, res) => {
  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: { status: "SCHEDULED" }
  });
  await recordAudit({ req, action: "campaign.paused", entityType: "EmailCampaign", entityId: campaign.id, detail: campaign.name });
  res.json(campaign);
}));

emailCampaignsRouter.post("/:id/resume", asyncHandler(async (req, res) => {
  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: { status: "SENDING" }
  });
  await recordAudit({ req, action: "campaign.resumed", entityType: "EmailCampaign", entityId: campaign.id, detail: campaign.name });
  res.json(campaign);
}));

const assignAccountSchema = z.object({
  emailAccountId: z.string().nullable() // null explicitly clears it, falling back to the global env provider
});

emailCampaignsRouter.post("/:id/email-account", asyncHandler(async (req, res) => {
  // Phase 1 gives Channel Partners no mailboxes of their own — their
  // campaigns always fall back to the shared global env-configured sender
  // (see channelPartnerScope.js's comment), so assigning one of the real
  // company mailboxes to a partner's campaign isn't offered at all.
  if (req.channelPartner) {
    return res.status(403).json({ error: "Channel Partner campaigns use the shared default sender — mailbox assignment is staff-only." });
  }

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
  await recordAudit({
    req,
    action: "campaign.mailbox_assigned",
    entityType: "EmailCampaign",
    entityId: campaign.id,
    detail: `${campaign.name} → ${parsed.data.emailAccountId ?? "default (global env provider)"}`
  });
  res.json(campaign);
}));

// A campaign's real, per-step follow-up sequence — read by
// scheduleCadenceSteps (routes/emailLeads.js) whenever a lead is added to
// this campaign. Until these routes existed, nothing anywhere could create
// a CadenceStep row outside the seed script, so delayDays/followUpCount on
// the campaign itself only ever drove a cosmetic preview
// (useEmailOutreachState.js's buildAutomationSteps) — no real campaign a
// user created ever actually had a follow-up scheduled.
const cadenceStepSchema = z.object({
  title: z.string().min(1),
  bodyTemplate: z.string().min(1),
  delayDays: z.number().int().min(0)
});

emailCampaignsRouter.get("/:id/cadence-steps", asyncHandler(async (req, res) => {
  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const steps = await prisma.cadenceStep.findMany({ where: { campaignId: req.params.id }, orderBy: { stepIndex: "asc" } });
  res.json(steps);
}));

// stepIndex is assigned here, not accepted from the client — a new step
// always goes at the end of the sequence; reordering isn't supported yet,
// only add/edit/delete.
emailCampaignsRouter.post("/:id/cadence-steps", asyncHandler(async (req, res) => {
  const parsed = cadenceStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const campaign = await loadOwnedCampaignOr404(req, res, req.params.id);
  if (!campaign) return;

  const lastStep = await prisma.cadenceStep.findFirst({ where: { campaignId: req.params.id }, orderBy: { stepIndex: "desc" } });
  const stepIndex = (lastStep?.stepIndex ?? -1) + 1;

  const step = await prisma.cadenceStep.create({ data: { campaignId: req.params.id, stepIndex, ...parsed.data } });
  await recordAudit({ req, action: "campaign.cadence_step_added", entityType: "EmailCampaign", entityId: campaign.id, detail: `Step ${stepIndex}: ${step.title}` });
  res.status(201).json(step);
}));

const updateCadenceStepSchema = cadenceStepSchema.partial();

emailCampaignsRouter.put("/:id/cadence-steps/:stepId", asyncHandler(async (req, res) => {
  const parsed = updateCadenceStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const existing = await prisma.cadenceStep.findUnique({ where: { id: req.params.stepId } });
  if (!existing || existing.campaignId !== req.params.id) {
    return res.status(404).json({ error: "Step not found" });
  }

  const step = await prisma.cadenceStep.update({ where: { id: req.params.stepId }, data: parsed.data });
  res.json(step);
}));

emailCampaignsRouter.delete("/:id/cadence-steps/:stepId", asyncHandler(async (req, res) => {
  if (!(await loadOwnedCampaignOr404(req, res, req.params.id))) return;
  const existing = await prisma.cadenceStep.findUnique({ where: { id: req.params.stepId } });
  if (!existing || existing.campaignId !== req.params.id) {
    return res.status(404).json({ error: "Step not found" });
  }

  await prisma.cadenceStep.delete({ where: { id: req.params.stepId } });
  await recordAudit({ req, action: "campaign.cadence_step_removed", entityType: "EmailCampaign", entityId: req.params.id, detail: existing.title });
  res.status(204).end();
}));

const sendNowSchema = z.object({
  // A manual pick of specific leads by id — takes priority over segmentId
  // below when given (checking any lead in the composer's checklist means
  // "just these", overriding the Send To dropdown).
  leadIds: z.array(z.string()).optional(),
  // Null/omitted = every one of this campaign's own leads (its "List").
  // Given, it narrows that same set via segmentMatching.js's
  // filterMatchingLeads — a segment is used purely as a condition-filter
  // here, independent of that segment's own campaignId (cross-campaign)
  // meaning, so any segment can be reused as a filter against any
  // campaign's leads.
  segmentId: z.string().nullable().optional(),
  // Null/omitted = send to this campaign's own leads (the default). Given,
  // this campaign's composed subject/bodyHtml is instead sent to a
  // DIFFERENT List's leads — lets one composed email be blasted out to any
  // existing List, not just the one it was written in. Still subject to
  // ownership scoping (loadOwnedCampaignOr404-equivalent check below) and
  // can still be narrowed further by segmentId/leadIds on top of it.
  targetCampaignId: z.string().nullable().optional(),
  // One optional one-time future send time — not a recurring/cron
  // schedule. Null/omitted = send immediately.
  scheduledAt: z.string().datetime().nullable().optional(),
  // Only meaningful with the queue enabled — staggers each recipient's
  // send by this many minutes past the previous one. Ignored (can't
  // stagger) in the synchronous no-queue fallback below.
  delayBetweenMinutes: z.number().min(0).default(0)
});

// Sends this campaign's own composed subject/bodyHtml to its own leads
// (optionally narrowed by a Segment) — the real "Send Now" action MailX's
// Campaign composer has and ours never did. Two paths depending on
// whether the cadence queue (BullMQ/Redis) is available, same fallback
// convention as everywhere else in this app that touches the queue.
emailCampaignsRouter.post("/:id/send-now", asyncHandler(async (req, res) => {
  const parsed = sendNowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const campaign = await loadOwnedCampaignOr404(req, res, req.params.id);
  if (!campaign) return;

  if (!campaign.subject || !campaign.bodyHtml) {
    return res.status(400).json({ error: `"${campaign.name}" has no composed email content yet — add a subject and body, then save, before sending.` });
  }

  // Defaults to this campaign's own leads; targetCampaignId (if given and
  // different) redirects the whole send to a different List's leads
  // instead — still scoped to campaigns this user/channel-partner owns.
  let leadsCampaignId = campaign.id;
  if (parsed.data.targetCampaignId && parsed.data.targetCampaignId !== campaign.id) {
    const targetCampaign = await prisma.emailCampaign.findFirst({
      where: { id: parsed.data.targetCampaignId, ...ownerWhereClause(req) }
    });
    if (!targetCampaign) {
      return res.status(404).json({ error: "Target list not found" });
    }
    leadsCampaignId = targetCampaign.id;
  }

  let leads = await prisma.emailLead.findMany({
    where: { campaignId: leadsCampaignId, unsubscribed: false, bounced: false }
  });

  if (parsed.data.leadIds?.length) {
    const idSet = new Set(parsed.data.leadIds);
    leads = leads.filter((lead) => idSet.has(lead.id));
  } else if (parsed.data.segmentId) {
    const segment = await prisma.emailSegment.findUnique({ where: { id: parsed.data.segmentId } });
    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }
    leads = filterMatchingLeads(leads, segment);
  }

  if (leads.length === 0) {
    return res.json({ queued: 0, sentImmediately: 0, failed: 0, message: "No matching leads to send to — nothing was sent." });
  }

  const delayBetweenMs = (parsed.data.delayBetweenMinutes || 0) * 60_000;

  if (isQueueEnabled()) {
    const baseDelayMs = parsed.data.scheduledAt ? Math.max(0, new Date(parsed.data.scheduledAt).getTime() - Date.now()) : 0;
    await Promise.all(
      leads.map((lead, index) =>
        enqueueCampaignBlast({ leadId: lead.id, campaignId: campaign.id, delayMs: baseDelayMs + index * delayBetweenMs })
      )
    );
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
    await recordAudit({ req, action: "campaign.blast_queued", entityType: "EmailCampaign", entityId: campaign.id, detail: `${leads.length} lead(s) queued for "${campaign.name}"` });
    return res.json({ queued: leads.length, sentImmediately: 0, failed: 0, scheduled: Boolean(parsed.data.scheduledAt) });
  }

  // No Redis — send immediately, synchronously, no delay throttle possible
  // (documented existing fallback pattern, same as cadence steps/dashboard
  // no-reply follow-ups elsewhere in this app). One bad/capped lead
  // doesn't stop the rest of the batch.
  let sentImmediately = 0;
  let failed = 0;
  for (const lead of leads) {
    try {
      await sendCampaignBlastEmail(lead.id, campaign.id);
      sentImmediately += 1;
    } catch {
      failed += 1;
    }
  }
  await recordAudit({ req, action: "campaign.blast_sent", entityType: "EmailCampaign", entityId: campaign.id, detail: `${sentImmediately} sent, ${failed} failed for "${campaign.name}"` });
  res.json({ queued: 0, sentImmediately, failed, scheduled: false });
}));

// Real per-recipient status for this campaign's most recent blast sends —
// so the composer can show "did it actually go out" without anyone having
// to dig through a lead's own activity timeline (see sendCampaignBlastEmail:
// the "Sending…" placeholder always resolves to either a "Sent via…" or
// "Failed to send:…" detail, which is all this endpoint needs to read).
emailCampaignsRouter.get("/:id/recent-sends", asyncHandler(async (req, res) => {
  const campaign = await loadOwnedCampaignOr404(req, res, req.params.id);
  if (!campaign) return;

  const rows = await prisma.emailActivityLog.findMany({
    where: { kind: "CAMPAIGN_BLAST_SENT", lead: { campaignId: campaign.id } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { lead: { select: { name: true, email: true } } }
  });

  res.json(
    rows.map((r) => ({
      id: r.id,
      leadName: r.lead.name,
      leadEmail: r.lead.email,
      detail: r.detail,
      createdAt: r.createdAt,
      status: r.detail.startsWith("Sending") ? "pending" : r.detail.startsWith("Failed") ? "failed" : "sent"
    }))
  );
}));
