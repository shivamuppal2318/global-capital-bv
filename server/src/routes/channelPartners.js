import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { STANDARD_COMMISSION_TIERS, computeChannelPartnerCommission, isMaintenanceFeeEligible } from "../lib/channelPartnerCommission.js";
import { signChannelPartnerToken } from "../lib/channelPartnerSignToken.js";

export const channelPartnersRouter = Router();

const STATUSES = ["ACTIVE", "INACTIVE", "PROSPECTIVE"];

// Matched to leads by name (see schema.prisma comment on the model for why
// this isn't a foreign key) — real counts, computed fresh on every request
// rather than a stored/denormalised total that could drift. Also where
// maintenanceFeeEligible (Clause 7.4 of the standard agreement — 10+
// referred clients) gets attached, since it's derived from this same count.
async function withReferredLeads(partners) {
  const counts = await prisma.lead.groupBy({
    by: ["channelPartner"],
    where: { channelPartner: { in: partners.map((p) => p.name) } },
    _count: { _all: true }
  });
  const byName = Object.fromEntries(counts.map((c) => [c.channelPartner, c._count._all]));
  return partners.map((p) => {
    const referredLeads = byName[p.name] ?? 0;
    return { ...p, referredLeads, maintenanceFeeEligible: isMaintenanceFeeEligible(referredLeads) };
  });
}

channelPartnersRouter.get("/", asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const partners = await prisma.channelPartner.findMany({
    where: {
      ...(status && status !== "All" ? { status: String(status) } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: String(q), mode: "insensitive" } },
              { contactName: { contains: String(q), mode: "insensitive" } },
              { region: { contains: String(q), mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: { name: "asc" }
  });
  res.json(await withReferredLeads(partners));
}));

channelPartnersRouter.get("/metrics", asyncHandler(async (_req, res) => {
  const partners = await prisma.channelPartner.findMany();
  const withCounts = await withReferredLeads(partners);
  const totalLeadsReferred = withCounts.reduce((sum, p) => sum + p.referredLeads, 0);
  const top = withCounts.slice().sort((a, b) => b.referredLeads - a.referredLeads)[0];

  res.json({
    totalPartners: partners.length,
    active: partners.filter((p) => p.status === "ACTIVE").length,
    prospective: partners.filter((p) => p.status === "PROSPECTIVE").length,
    totalLeadsReferred,
    topPartner: top && top.referredLeads > 0 ? { name: top.name, referredLeads: top.referredLeads } : null
  });
}));

// The standard incentive schedule itself, for display (e.g. next to the
// "Commission %" override field, so it's clear what a blank value falls
// back to). Registered before /:id-shaped routes below out of habit, though
// none of them currently collide (they're PATCH/DELETE, this is GET).
channelPartnersRouter.get("/commission-tiers", (_req, res) => {
  res.json({ tiers: STANDARD_COMMISSION_TIERS });
});

// A real calculator, not a stored total: given one deal's borrowing amount,
// what commission is actually owed under this partner's rate (their own
// negotiated commissionPct if set, else the standard tiers above). Doesn't
// try to sum this across a partner's real referred leads — Lead.capitalAsk
// is freeform text ("EUR 3M", "Not specified", ...), not a clean number,
// so there's nothing honest to auto-aggregate yet.
channelPartnersRouter.get("/:id/estimate-commission", asyncHandler(async (req, res) => {
  const borrowingAmount = Number(req.query.borrowingAmount);
  if (!Number.isFinite(borrowingAmount) || borrowingAmount < 0) {
    return res.status(400).json({ error: "borrowingAmount must be a non-negative number." });
  }

  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
  if (!partner) {
    return res.status(404).json({ error: "Channel partner not found" });
  }

  const result = computeChannelPartnerCommission(borrowingAmount, partner.commissionPct);
  res.json({ borrowingAmount, ...result });
}));

// Generates the real signed link to the public agreement-signing page (see
// routes/channelPartnerAgreement.js) — an admin copies this and sends it to
// the partner however they want (email, WhatsApp, ...). Deliberately
// doesn't send anything itself: this app has no established channel for a
// one-off message to a channel partner's contact the way it does for
// EmailLead cadence sends, so generating the link and letting a human
// decide how to deliver it is the honest scope for now.
channelPartnersRouter.get("/:id/agreement-link", asyncHandler(async (req, res) => {
  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
  if (!partner) {
    return res.status(404).json({ error: "Channel partner not found" });
  }

  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  const url = `${base}/api/channel-partner-agreement/${partner.id}/${signChannelPartnerToken(partner.id)}`;

  res.json({
    url,
    signed: Boolean(partner.agreementSignedAt),
    signedAt: partner.agreementSignedAt,
    signedName: partner.agreementSignedName
  });
}));

const upsertSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  // A custom negotiated rate overriding the standard tiered schedule (see
  // lib/channelPartnerCommission.js) — null/omitted means this partner is
  // on the standard schedule.
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().nullable().optional()
});

const toText = (v) => (v === undefined ? undefined : v && String(v).trim() ? String(v).trim() : null);

channelPartnersRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, ...rest } = parsed.data;

  const existing = await prisma.channelPartner.findUnique({ where: { name } });
  if (existing) return res.status(409).json({ error: `A partner named "${name}" already exists.` });

  const partner = await prisma.channelPartner.create({
    data: {
      name,
      contactName: toText(rest.contactName),
      contactEmail: toText(rest.contactEmail),
      contactPhone: toText(rest.contactPhone),
      region: toText(rest.region),
      commissionPct: rest.commissionPct ?? null,
      status: rest.status ?? "ACTIVE",
      notes: toText(rest.notes)
    }
  });
  res.status(201).json({ ...partner, referredLeads: 0 });
}));

channelPartnersRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.partial({ name: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.commissionPct !== undefined) data.commissionPct = parsed.data.commissionPct;
  for (const key of ["contactName", "contactEmail", "contactPhone", "region", "notes"]) {
    if (parsed.data[key] !== undefined) data[key] = toText(parsed.data[key]);
  }

  const partner = await prisma.channelPartner.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!partner) return res.status(404).json({ error: "Channel partner not found" });
  const [withCount] = await withReferredLeads([partner]);
  res.json(withCount);
}));

channelPartnersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await prisma.channelPartner.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "Channel partner not found" });
  res.status(204).end();
}));
