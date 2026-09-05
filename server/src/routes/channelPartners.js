import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { STANDARD_COMMISSION_TIERS, computeChannelPartnerCommission, isMaintenanceFeeEligible } from "../lib/channelPartnerCommission.js";
import { signChannelPartnerToken } from "../lib/channelPartnerSignToken.js";
import { hashPassword } from "../lib/auth.js";
import { getEmailProvider } from "../lib/emailProvider.js";
import { plainTextToHtml } from "../lib/leadSender.js";
import { CHANNEL_PARTNER_OPTIONAL_MODULES, CHANNEL_PARTNER_OPTIONAL_MODULE_IDS } from "../lib/channelPartnerPermissions.js";

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
// routes/channelPartnerAgreement.js) and, by default, emails it straight to
// the partner's own contact address too — an admin can still copy/share it
// manually (e.g. over WhatsApp) from the response, but doesn't have to.
// Uses the single global env-configured provider (no per-partner mailbox
// concept exists), and skips the send entirely — rather than failing the
// whole request — when there's no contactEmail on file or the agreement is
// already signed (nothing left to invite them to).
channelPartnersRouter.get("/:id/agreement-link", asyncHandler(async (req, res) => {
  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
  if (!partner) {
    return res.status(404).json({ error: "Channel partner not found" });
  }

  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  const url = `${base}/api/channel-partner-agreement/${partner.id}/${signChannelPartnerToken(partner.id)}`;
  const signed = Boolean(partner.agreementSignedAt);

  let emailSent = false;
  let emailError = null;
  if (!signed && partner.contactEmail) {
    const body = `Hi ${partner.contactName || partner.name},\n\nPlease review and sign your Channel Partner Agreement with Global Capital BV here:\n\n${url}\n\nLet us know if you have any questions.\n\nBest regards,\nGlobal Capital BV`;
    try {
      await getEmailProvider().send({
        to: partner.contactEmail,
        subject: "Your Channel Partner Agreement — Global Capital BV",
        body,
        html: plainTextToHtml(body)
      });
      emailSent = true;
    } catch (err) {
      emailError = err.message;
    }
  }

  res.json({
    url,
    signed,
    signedAt: partner.agreementSignedAt,
    signedName: partner.agreementSignedName,
    contactEmail: partner.contactEmail ?? null,
    emailSent,
    emailError
  });
}));

// Real Channel Partner Portal activity — distinct from withReferredLeads'
// Lead.channelPartner free-text match above (CRM Workspace referrals this
// partner brought in manually). This is the partner's own separate portal
// data (EmailCampaign.ownerChannelPartnerId, see lib/channelPartnerScope.js)
// — how much they've actually done with their own login, computed fresh
// rather than a stored total that could drift.
channelPartnersRouter.get("/:id/activity", asyncHandler(async (req, res) => {
  const partner = await prisma.channelPartner.findUnique({
    where: { id: req.params.id },
    include: { portalUser: { select: { email: true, status: true, lastLoginAt: true, createdAt: true } } }
  });
  if (!partner) {
    return res.status(404).json({ error: "Channel partner not found" });
  }

  const [campaignCount, leadCount, lastSent, campaigns, recentActivity] = await Promise.all([
    prisma.emailCampaign.count({ where: { ownerChannelPartnerId: partner.id } }),
    prisma.emailLead.count({ where: { campaign: { ownerChannelPartnerId: partner.id } } }),
    prisma.emailActivityLog.findFirst({
      where: {
        kind: { in: ["BULK_INTRO_SENT", "BRANCH_EMAIL_SENT", "CAMPAIGN_BLAST_SENT"] },
        lead: { campaign: { ownerChannelPartnerId: partner.id } }
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    prisma.emailCampaign.findMany({
      where: { ownerChannelPartnerId: partner.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { leads: true } } }
    }),
    prisma.emailActivityLog.findMany({
      where: { lead: { campaign: { ownerChannelPartnerId: partner.id } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { lead: { select: { name: true, email: true, campaign: { select: { name: true } } } } }
    })
  ]);

  res.json({
    hasPortalAccount: Boolean(partner.portalUser),
    portalAccount: partner.portalUser,
    campaignCount,
    leadCount,
    lastSentAt: lastSent?.createdAt ?? null,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      leadCount: campaign._count.leads,
      updatedAt: campaign.updatedAt
    })),
    recentActivity: recentActivity.map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      title: activity.title,
      detail: activity.detail,
      createdAt: activity.createdAt,
      leadName: activity.lead.name,
      leadEmail: activity.lead.email,
      campaignName: activity.lead.campaign.name
    }))
  });
}));

function publicPortalUser(portalUser) {
  return {
    id: portalUser.id,
    name: portalUser.name,
    email: portalUser.email,
    status: portalUser.status,
    permissions: portalUser.permissions,
    lastLoginAt: portalUser.lastLoginAt,
    createdAt: portalUser.createdAt,
    channelPartnerId: portalUser.channelPartnerId,
    channelPartnerName: portalUser.channelPartner.name
  };
}

function generatePortalPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

// Served from the backend so the Admin Panel's checkbox list can't drift
// from what app.js actually enforces -- same reasoning as admin.js's
// GET /modules for staff.
channelPartnersRouter.get("/optional-modules", (_req, res) => res.json(CHANNEL_PARTNER_OPTIONAL_MODULES));

// Every Channel Partner Portal login, for Admin Panel -> Channel Partners
// (the same home Employees has for staff logins) -- a partner may only
// exist for one ChannelPartner (1:1, see schema), so this is also a
// company-wide list of every portal account that exists.
channelPartnersRouter.get("/portal-users", asyncHandler(async (_req, res) => {
  const portalUsers = await prisma.channelPartnerUser.findMany({
    include: { channelPartner: { select: { name: true } } },
    orderBy: { createdAt: "asc" }
  });
  res.json(portalUsers.map(publicPortalUser));
}));

const updatePortalUserSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: z.array(z.enum(CHANNEL_PARTNER_OPTIONAL_MODULE_IDS)).optional()
});

channelPartnersRouter.patch("/portal-users/:id", asyncHandler(async (req, res) => {
  const parsed = updatePortalUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const portalUser = await prisma.channelPartnerUser
    .update({ where: { id: req.params.id }, data: parsed.data, include: { channelPartner: { select: { name: true } } } })
    .catch(() => null);
  if (!portalUser) return res.status(404).json({ error: "Portal account not found" });
  res.json(publicPortalUser(portalUser));
}));

// Admin-driven counterpart to the self-service flow a partner doesn't have
// (there's no forgot-password page for this tier yet) -- same
// generate-once-and-reveal pattern as admin.js's employee reset-password.
channelPartnersRouter.post("/portal-users/:id/reset-password", asyncHandler(async (req, res) => {
  const temporaryPassword = generatePortalPassword();
  const portalUser = await prisma.channelPartnerUser
    .update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(temporaryPassword) },
      include: { channelPartner: { select: { name: true } } }
    })
    .catch(() => null);
  if (!portalUser) return res.status(404).json({ error: "Portal account not found" });
  res.json({ ...publicPortalUser(portalUser), temporaryPassword });
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
