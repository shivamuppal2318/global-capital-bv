import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendRawEmail, sendTemplateEmail } from "../lib/leadSender.js";
import { enqueueCadenceStep, isQueueEnabled } from "../queue/cadenceQueue.js";
import { recordReply } from "../lib/replyRecorder.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const emailLeadsRouter = Router();

// List endpoint the frontend needs before it can stop hardcoding
// repliedLeads/crmWorkspaceData.enquiries as mock arrays. Optional
// ?campaignId= filter mirrors how the Cold Bulk Mailing page scopes leads
// to whichever campaign is selected.
emailLeadsRouter.get("/", asyncHandler(async (req, res) => {
  const where = req.query.campaignId ? { campaignId: String(req.query.campaignId) } : {};
  const leads = await prisma.emailLead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { campaign: { select: { name: true } } }
  });
  res.json(leads);
}));

// Shared by POST /leads (new lead) and POST /:id/schedule-cadence
// (re-schedule an existing one). Each step fires isLeadEligibleForCadenceStep
// at execution time (see queue/cadenceQueue.js), so a step enqueued here for
// "Day 3" only actually sends if the lead is still NO_REPLY/not
// bounced/not unsubscribed when day 3 arrives.
async function scheduleCadenceSteps(lead, cadenceSteps) {
  if (!isQueueEnabled() || cadenceSteps.length === 0) {
    return 0;
  }
  for (const step of cadenceSteps) {
    await enqueueCadenceStep({
      leadId: lead.id,
      campaignId: lead.campaignId,
      stepIndex: step.stepIndex,
      subject: step.title,
      body: step.bodyTemplate,
      delayMs: step.delayDays * 24 * 60 * 60 * 1000
    });
  }
  return cadenceSteps.length;
}

const createLeadSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  email: z.string().email(),
  owner: z.string().min(1),
  campaignId: z.string().min(1)
});

// Adds a lead to a campaign and enrolls them in its no-reply cadence in one
// call — this is the actual entry point for "send the bulk intro, and if
// they don't reply, follow up automatically" (previously nothing created
// leads via the API at all; only the seed script did, with no cadence
// scheduling attached).
emailLeadsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: parsed.data.campaignId },
    include: { cadenceSteps: { orderBy: { stepIndex: "asc" } } }
  });
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  // Same email can legitimately appear in different campaigns (different
  // pitches to the same prospect), so the check is scoped to this campaign
  // — but adding it twice to the SAME one would silently double-enroll
  // them in the cadence, sending the same prospect duplicate follow-ups.
  const existing = await prisma.emailLead.findFirst({
    where: { campaignId: parsed.data.campaignId, email: parsed.data.email }
  });
  if (existing) {
    return res.status(409).json({ error: `${parsed.data.email} is already in this campaign.`, leadId: existing.id });
  }

  const lead = await prisma.emailLead.create({ data: parsed.data });
  const scheduledCount = await scheduleCadenceSteps(lead, campaign.cadenceSteps);

  await prisma.emailActivityLog.create({
    data: {
      leadId: lead.id,
      kind: "BULK_INTRO_SENT",
      title: "Added to campaign",
      detail: scheduledCount > 0
        ? `Enrolled in "${campaign.name}" — ${scheduledCount} cadence step(s) scheduled, each skipped automatically if a reply arrives first.`
        : `Enrolled in "${campaign.name}" — no cadence steps scheduled (queue disabled or campaign has none configured).`
    }
  });

  res.status(201).json({ lead, cadenceScheduled: scheduledCount });
}));

const bulkCreateLeadSchema = z.object({
  campaignId: z.string().min(1),
  leads: z
    .array(
      z.object({
        name: z.string().min(1),
        company: z.string().min(1),
        email: z.string().email(),
        owner: z.string().min(1)
      })
    )
    .min(1)
    .max(500) // sanity cap — a bad CSV paste shouldn't be able to create thousands of rows in one call
});

// CSV import — the frontend parses the pasted CSV into structured rows
// client-side (see src/lib/csvLeads.js) and posts them here as JSON rather
// than this route parsing raw CSV text itself, so validation/preview can
// happen before anything hits the database.
//
// Each row is created independently: one bad row (a duplicate, a DB
// hiccup) doesn't abort the rest of the batch — same "isolate failures,
// don't let one bad item block everything else" principle as the IMAP
// poller's per-message error handling.
emailLeadsRouter.post("/bulk", asyncHandler(async (req, res) => {
  const parsed = bulkCreateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: parsed.data.campaignId },
    include: { cadenceSteps: { orderBy: { stepIndex: "asc" } } }
  });
  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const created = [];
  const failed = [];
  const duplicates = [];
  // Rows within the same CSV paste count against each other too (a pasted
  // list with the same email twice), not just against what's already in
  // the DB — checked in-memory so a duplicate earlier in this same batch
  // is caught without a redundant query.
  const seenInBatch = new Set();

  for (const [index, leadInput] of parsed.data.leads.entries()) {
    const rowNumber = index + 1;
    if (seenInBatch.has(leadInput.email)) {
      duplicates.push({ row: rowNumber, email: leadInput.email, reason: "Duplicate email earlier in this same import." });
      continue;
    }

    try {
      const existing = await prisma.emailLead.findFirst({
        where: { campaignId: campaign.id, email: leadInput.email }
      });
      if (existing) {
        duplicates.push({ row: rowNumber, email: leadInput.email, reason: "Already in this campaign." });
        seenInBatch.add(leadInput.email);
        continue;
      }

      const lead = await prisma.emailLead.create({ data: { ...leadInput, campaignId: campaign.id } });
      const scheduledCount = await scheduleCadenceSteps(lead, campaign.cadenceSteps);

      await prisma.emailActivityLog.create({
        data: {
          leadId: lead.id,
          kind: "BULK_INTRO_SENT",
          title: "Added to campaign (CSV import)",
          detail: scheduledCount > 0
            ? `Enrolled in "${campaign.name}" via bulk CSV import — ${scheduledCount} cadence step(s) scheduled.`
            : `Enrolled in "${campaign.name}" via bulk CSV import — no cadence steps scheduled.`
        }
      });

      seenInBatch.add(leadInput.email);
      created.push({ id: lead.id, email: lead.email });
    } catch (err) {
      seenInBatch.add(leadInput.email);
      failed.push({ row: rowNumber, email: leadInput.email, reason: err.message });
    }
  }

  res.status(201).json({
    createdCount: created.length,
    failedCount: failed.length,
    duplicateCount: duplicates.length,
    created,
    failed,
    duplicates
  });
}));

emailLeadsRouter.get("/:id/activity", asyncHandler(async (req, res) => {
  const activity = await prisma.emailActivityLog.findMany({
    where: { leadId: req.params.id },
    orderBy: { createdAt: "desc" }
  });
  res.json(activity);
}));

function sendErrorResponse(res, err) {
  res.status(err.status ?? 500).json({ error: err.message });
}

const sendSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  html: z.string().optional()
});

// Immediate send with an explicit subject/body (e.g. the user hand-edited
// the draft in the UI before sending — this is what src/App.jsx's
// handleSendNextEmail calls today).
emailLeadsRouter.post("/:id/send", asyncHandler(async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { activity, warnings } = await sendRawEmail(req.params.id, parsed.data);
    res.status(201).json({ ...activity, warnings });
  } catch (err) {
    sendErrorResponse(res, err);
  }
}));

const sendTemplateSchema = z.object({
  templateKey: z.string().min(1)
});

// Immediate send resolved from a saved Template (see /templates), with the
// lead's own name/company/unsubscribe link merged in automatically. This is
// the path that actually uses the Template model instead of requiring the
// caller to already have final subject/body text.
emailLeadsRouter.post("/:id/send-template", asyncHandler(async (req, res) => {
  const parsed = sendTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { activity, warnings } = await sendTemplateEmail(req.params.id, parsed.data.templateKey);
    res.status(201).json({ ...activity, warnings });
  } catch (err) {
    sendErrorResponse(res, err);
  }
}));

const simulateReplySchema = z.object({
  textBody: z.string().min(1)
});

// Same classification logic as POST /webhooks/inbound-email, but gated by
// the normal API key instead of the webhook secret — this is what the
// frontend's "Simulate reply" button should call for testing, since shipping
// the webhook secret to the browser would defeat its purpose (it exists to
// keep the *public internet* from posting fake replies; this route is for
// an already-authenticated CRM user deliberately testing the flow).
//
// This now also triggers the real auto-response (see replyRecorder.js /
// autoRespond.js) — clicking "Simulate reply" sends a real email through
// whatever EMAIL_PROVIDER is configured, exactly like a genuine inbound
// reply would. That's intentional (it's meant to prove the full loop), but
// worth knowing before clicking it against a live SMTP provider.
emailLeadsRouter.post("/:id/simulate-reply", asyncHandler(async (req, res) => {
  const parsed = simulateReplySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const lead = await prisma.emailLead.findUnique({ where: { id: req.params.id } });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const { replyType, matchedRule, autoResponse } = await recordReply(lead, parsed.data.textBody);
  res.status(201).json({ leadId: lead.id, replyType, matchedRule: matchedRule?.id ?? null, autoResponse });
}));

// Calendly's webhook (see routes/calendlyWebhook.js) reports a call was
// *booked*, never whether the invitee actually showed up — that has to be
// a human confirming it, hence this manual endpoint rather than something
// automatic.
emailLeadsRouter.post("/:id/mark-call-completed", asyncHandler(async (req, res) => {
  const lead = await prisma.emailLead.findUnique({ where: { id: req.params.id } });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const completedAt = new Date();
  await prisma.$transaction([
    prisma.emailLead.update({ where: { id: lead.id }, data: { callCompletedAt: completedAt } }),
    prisma.emailActivityLog.create({
      data: { leadId: lead.id, kind: "CALL_COMPLETED", title: "Call marked completed", detail: `Manually confirmed at ${completedAt.toISOString()}.` }
    })
  ]);

  res.status(200).json({ leadId: lead.id, callCompletedAt: completedAt });
}));

// Re-schedules the cadence for a lead that already exists (e.g. moved to a
// different campaign, or the first attempt was before REDIS_URL was set).
// New leads get this automatically via POST /leads — this route is for the
// re-schedule case specifically.
emailLeadsRouter.post("/:id/schedule-cadence", asyncHandler(async (req, res) => {
  if (!isQueueEnabled()) {
    return res.status(503).json({ error: "Cadence queue disabled: set REDIS_URL to enable scheduling." });
  }

  const lead = await prisma.emailLead.findUnique({
    where: { id: req.params.id },
    include: { campaign: { include: { cadenceSteps: { orderBy: { stepIndex: "asc" } } } } }
  });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const scheduledCount = await scheduleCadenceSteps(lead, lead.campaign.cadenceSteps);
  res.status(202).json({ scheduled: scheduledCount });
}));
