import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isAiReplyAgentConfigured, generateReplyDraft } from "../lib/aiReplyAgent.js";
import { getAiConfig } from "../lib/aiSettings.js";
import { sendRawEmail } from "../lib/leadSender.js";

export const emailAiAgentRouter = Router();

const leadSelect = { select: { id: true, name: true, company: true, email: true, replyType: true, stage: true } };
const VALID_STATUSES = new Set(["DRAFT", "SENT", "SKIPPED", "FAILED"]);

// Drives the tab's Enabled/Disabled badge and provider/model line for real
// (replacing what used to be a static "Disabled" badge and a hardcoded
// "claude-opus-4-8" string with no backing check at all).
emailAiAgentRouter.get("/status", asyncHandler(async (_req, res) => {
  const configured = await isAiReplyAgentConfigured();
  const { model, source } = await getAiConfig();
  res.json({ configured, provider: "anthropic", model, source });
}));

emailAiAgentRouter.get("/drafts", asyncHandler(async (req, res) => {
  const statusParam = req.query.status ? String(req.query.status).toUpperCase() : null;
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return res.status(400).json({ error: `Invalid status filter "${req.query.status}"` });
  }

  const drafts = await prisma.aiReplyDraft.findMany({
    where: statusParam ? { status: statusParam } : {},
    include: { lead: leadSelect },
    orderBy: { createdAt: "desc" }
  });
  res.json(drafts);
}));

const generateSchema = z.object({ leadId: z.string().min(1) });

// Generates (or, if this lead already has a still-editable DRAFT,
// regenerates it in place) a real Claude-drafted reply grounded in the
// lead's actual most recent inbound message.
emailAiAgentRouter.post("/drafts/generate", asyncHandler(async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const lead = await prisma.emailLead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const latestReply = await prisma.replyEvent.findFirst({
    where: { leadId: lead.id },
    orderBy: { receivedAt: "desc" }
  });

  let drafted;
  try {
    drafted = await generateReplyDraft({
      leadName: lead.name,
      company: lead.company,
      replyType: lead.replyType,
      rawReplyText: latestReply?.rawBody ?? null
    });
  } catch (error) {
    return res.status(422).json({ error: error.message });
  }

  const existingDraft = await prisma.aiReplyDraft.findFirst({
    where: { leadId: lead.id, status: "DRAFT" },
    orderBy: { createdAt: "desc" }
  });

  const data = {
    leadId: lead.id,
    subject: drafted.subject,
    body: drafted.body,
    model: drafted.model,
    status: "DRAFT",
    error: null
  };

  const draft = existingDraft
    ? await prisma.aiReplyDraft.update({ where: { id: existingDraft.id }, data, include: { lead: leadSelect } })
    : await prisma.aiReplyDraft.create({ data, include: { lead: leadSelect } });

  res.status(201).json(draft);
}));

// Sends through the same suppression/cap/tracking pipeline every other real
// send in this app uses (see lib/leadSender.js) — nothing about the AI
// Agent gets a shortcut around unsubscribe/bounce/daily-cap checks.
emailAiAgentRouter.post("/drafts/:id/send", asyncHandler(async (req, res) => {
  const draft = await prisma.aiReplyDraft.findUnique({ where: { id: req.params.id } });
  if (!draft) {
    return res.status(404).json({ error: "Draft not found" });
  }
  if (draft.status === "SENT") {
    return res.status(409).json({ error: "This draft was already sent." });
  }

  try {
    const { activity } = await sendRawEmail(draft.leadId, { subject: draft.subject, body: draft.body });
    const updated = await prisma.aiReplyDraft.update({
      where: { id: draft.id },
      data: { status: "SENT", sentActivityId: activity.id, error: null },
      include: { lead: leadSelect }
    });
    res.json(updated);
  } catch (error) {
    const updated = await prisma.aiReplyDraft.update({
      where: { id: draft.id },
      data: { status: "FAILED", error: error.message },
      include: { lead: leadSelect }
    });
    res.status(error.status ?? 500).json(updated);
  }
}));

emailAiAgentRouter.post("/drafts/:id/skip", asyncHandler(async (req, res) => {
  const draft = await prisma.aiReplyDraft.findUnique({ where: { id: req.params.id } });
  if (!draft) {
    return res.status(404).json({ error: "Draft not found" });
  }
  if (draft.status === "SENT") {
    return res.status(409).json({ error: "This draft was already sent." });
  }

  const updated = await prisma.aiReplyDraft.update({
    where: { id: draft.id },
    data: { status: "SKIPPED" },
    include: { lead: leadSelect }
  });
  res.json(updated);
}));

// Discarding a SENT draft would erase the record of a real email that
// actually went out — blocked the same way emailTemplates.js protects its
// load-bearing keys from deletion.
emailAiAgentRouter.delete("/drafts/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.aiReplyDraft.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Draft not found" });
  }
  if (existing.status === "SENT") {
    return res.status(409).json({ error: "Can't discard a draft that was already sent — it's the real send record." });
  }

  await prisma.aiReplyDraft.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));
