import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { renderEmail } from "../lib/renderTemplate.js";
import { appendInterestButton } from "../lib/leadSender.js";

export const emailTemplatesRouter = Router();

emailTemplatesRouter.get("/", asyncHandler(async (_req, res) => {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { key: "asc" } });
  res.json(templates);
}));

// Sample-data render so the UI can show "here's what this email actually
// looks like" — merge fields filled with placeholders, HTML wrapped/branded
// exactly as a real send would — before anything goes to a real lead.
// Placed before "/:key" isn't necessary (different path shape), but kept
// near it since it's conceptually a variant read of the same resource.
emailTemplatesRouter.get("/:key/preview", asyncHandler(async (req, res) => {
  const template = await prisma.emailTemplate.findUnique({ where: { key: req.params.key } });
  if (!template) {
    return res.status(404).json({ error: `Template "${req.params.key}" not found` });
  }

  const rendered = renderEmail(template, {
    leadName: "Sample Lead",
    company: "Sample Company Ltd",
    unsubscribeUrl: "https://example.com/unsubscribe/sample-preview",
    ndaSignUrl: "https://example.com/nda/sample-preview"
  });

  // Every real send of this template also appends the "I'm Interested"
  // button (see leadSender.js's sendTemplateEmail) — included here too so
  // the preview honestly shows what a recipient actually sees, not a
  // stripped-down version of it.
  res.json({ ...rendered, html: appendInterestButton(rendered.html, "sample-preview") });
}));

emailTemplatesRouter.get("/:key", asyncHandler(async (req, res) => {
  const template = await prisma.emailTemplate.findUnique({ where: { key: req.params.key } });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }
  res.json(template);
}));

const upsertTemplateSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  html: z.string().optional()
});

// Upsert by key rather than requiring a create-then-update dance — the
// frontend's editable draft per reply-type (interested/zoom-request/...)
// maps naturally onto "there is exactly one template per key".
emailTemplatesRouter.put("/:key", asyncHandler(async (req, res) => {
  const parsed = upsertTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const template = await prisma.emailTemplate.upsert({
    where: { key: req.params.key },
    update: parsed.data,
    create: { key: req.params.key, ...parsed.data }
  });

  res.json(template);
}));

// These four keys are load-bearing: autoRespond.js maps classified replies
// straight to them (see REPLY_TYPE_TO_TEMPLATE_KEY there). Deleting one
// wouldn't error loudly — the next auto-response for that reply type would
// just silently fail to send (caught, logged as a non-fatal "not sent"
// outcome) — so this blocks deleting them rather than letting that happen
// by accident.
const PROTECTED_TEMPLATE_KEYS = new Set(["interested", "zoom-request", "info-request", "no-reply"]);

emailTemplatesRouter.delete("/:key", asyncHandler(async (req, res) => {
  if (PROTECTED_TEMPLATE_KEYS.has(req.params.key)) {
    return res.status(409).json({
      error: `"${req.params.key}" is used by the auto-responder for real replies — deleting it would silently break auto-sending for that reply type.`
    });
  }

  const template = await prisma.emailTemplate.findUnique({ where: { key: req.params.key } });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  await prisma.emailTemplate.delete({ where: { key: req.params.key } });
  res.status(204).end();
}));
