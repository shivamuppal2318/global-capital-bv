import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyPassword, hashPassword, signChannelPartnerUserToken } from "../lib/auth.js";
import { requireChannelPartnerAuth } from "../middleware/requireChannelPartnerAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { loginRateLimit, forgotPasswordRateLimit } from "../middleware/authRateLimit.js";
import { hashResetToken } from "../lib/resetTokenHash.js";
import { sendSystemEmail, passwordResetEmail } from "../lib/systemMailer.js";
import { appBaseUrl } from "../lib/appUrl.js";
import { UPLOAD_DIR } from "../lib/fileUpload.js";
import { renderSignedChannelPartnerAgreement, slugify } from "../lib/signedDocumentRenderer.js";
import { buildLeadCreateData } from "../lib/leadCreation.js";
import { computeChannelPartnerCommission } from "../lib/channelPartnerCommission.js";

export const channelPartnerPortalAuthRouter = Router();

const RESET_TTL_MINUTES = 60;

function parseMoneyAmount(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw === "Not specified") return null;
  const lower = raw.toLowerCase();
  const match = lower.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (/\b(bn|billion|b)\b/.test(lower)) amount *= 1_000_000_000;
  else if (/\b(mn|million|m)\b/.test(lower)) amount *= 1_000_000;
  else if (/\b(k|thousand)\b/.test(lower)) amount *= 1_000;
  return amount;
}

function currentReferralStage({ termSheet, ioi, nda, meetings, documents }) {
  if (termSheet?.status === "COMPLETED") return "Termsheet Closed";
  if (termSheet) return "Termsheet";
  if (ioi?.status === "SIGNED") return "IOI Signed";
  if (ioi) return "IOI";
  if (documents > 0) return "Data Room";
  if (meetings > 0) return "Zoom Call";
  if (nda?.status === "SIGNED") return "NDA Signed";
  if (nda) return "NDA";
  return "Referred";
}

const referLeadSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  mobile: z.string().optional(),
  jobTitle: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  revenue: z.string().optional(),
  capitalAsk: z.string().optional(),
  territory: z.string().optional(),
  website: z.string().optional(),
  doe: z.string().optional(),
  notes: z.string().optional()
});

function publicChannelPartnerUser(channelPartnerUser) {
  return {
    id: channelPartnerUser.id,
    name: channelPartnerUser.name,
    email: channelPartnerUser.email,
    status: channelPartnerUser.status,
    permissions: channelPartnerUser.permissions,
    channelPartner: { id: channelPartnerUser.channelPartner.id, name: channelPartnerUser.channelPartner.name }
  };
}

// Mirrors routes/auth.js's staff /login exactly (same generic-error-message
// reasoning: don't let a failed login distinguish "no such email" from
// "wrong password"). There's no equivalent to ClientUser's cookie-based
// portal here — this issues a bearer token, since the partner portal is a
// real SPA (see ChannelPartnerPortalApp.jsx) following the staff app's
// Authorization-header convention.
channelPartnerPortalAuthRouter.post("/login", loginRateLimit, asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const channelPartnerUser = await prisma.channelPartnerUser.findUnique({
    where: { email },
    include: { channelPartner: { select: { id: true, name: true } } }
  });
  const invalid = () => res.status(401).json({ error: "Invalid email or password." });

  if (!channelPartnerUser) return invalid();
  if (channelPartnerUser.status === "SUSPENDED") {
    return res.status(403).json({ error: "This account has been suspended. Contact Global Capital BV." });
  }

  const ok = await verifyPassword(password, channelPartnerUser.passwordHash);
  if (!ok) return invalid();

  await prisma.channelPartnerUser.update({ where: { id: channelPartnerUser.id }, data: { lastLoginAt: new Date() } });

  res.json({ token: signChannelPartnerUserToken(channelPartnerUser), user: publicChannelPartnerUser(channelPartnerUser) });
}));

channelPartnerPortalAuthRouter.get(
  "/me",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const channelPartnerUser = await prisma.channelPartnerUser.findUnique({
      where: { id: req.channelPartner.userId },
      include: { channelPartner: { select: { id: true, name: true } } }
    });
    if (!channelPartnerUser) return res.status(401).json({ error: "Session no longer valid." });
    res.json(publicChannelPartnerUser(channelPartnerUser));
  })
);

channelPartnerPortalAuthRouter.get(
  "/agreement",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: req.channelPartner.id },
      include: { agreementDocument: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } } }
    });
    if (!partner) return res.status(404).json({ error: "Channel partner not found." });

    res.json({
      id: partner.id,
      name: partner.name,
      contactEmail: partner.contactEmail,
      region: partner.region,
      status: partner.status,
      commissionPct: partner.commissionPct,
      agreementSignedAt: partner.agreementSignedAt,
      agreementSignedName: partner.agreementSignedName,
      agreementAddress: partner.agreementAddress,
      agreementPaymentSchedule: partner.agreementPaymentSchedule,
      hasSignedAgreement: Boolean(partner.agreementSignedAt),
      uploadedSignedCopy: Boolean(partner.agreementDocumentId),
      document: partner.agreementDocument
    });
  })
);

channelPartnerPortalAuthRouter.get(
  "/agreement/download",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: req.channelPartner.id },
      include: { agreementDocument: true }
    });
    if (!partner) return res.status(404).json({ error: "Channel partner not found." });
    if (!partner.agreementSignedAt) {
      return res.status(400).json({ error: "This Channel Partner Agreement hasn't been signed yet." });
    }

    if (partner.agreementDocument) {
      const filePath = path.join(UPLOAD_DIR, partner.agreementDocument.storedName);
      if (!(await fs.stat(filePath).catch(() => null))) {
        return res.status(410).json({ error: "The stored agreement file is missing on disk." });
      }
      res.setHeader("Content-Type", partner.agreementDocument.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(partner.agreementDocument.originalName)}"`);
      return res.sendFile(path.resolve(filePath));
    }

    const html = await renderSignedChannelPartnerAgreement(partner);
    const filename = `Signed-Channel-Partner-Agreement-${slugify(partner.name)}.html`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(html);
  })
);

channelPartnerPortalAuthRouter.get(
  "/doe-options",
  requireChannelPartnerAuth,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true }
    });
    res.json(users.map((user) => ({ id: user.id, name: user.name, email: user.email, label: `${user.name} (${user.role})` })));
  })
);

channelPartnerPortalAuthRouter.get(
  "/referral-metrics",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const partnerName = req.channelPartner.businessName;
    const leadWhere = { channelPartner: partnerName };
    const [leadReferred, ndaSigned, ioiSigned, termSheetClosed] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.ndaRecord.count({ where: { status: "SIGNED", lead: leadWhere } }),
      prisma.ioiRecord.count({ where: { status: "SIGNED", lead: leadWhere } }),
      prisma.dealStageRecord.count({ where: { stage: "TERM_SHEET", status: "COMPLETED", lead: leadWhere } })
    ]);
    res.json({ leadReferred, ndaSigned, ioiSigned, termSheetClosed });
  })
);

channelPartnerPortalAuthRouter.get(
  "/latest-referral",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { channelPartner: req.channelPartner.businessName },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        mobile: true,
        capitalAsk: true,
        territory: true,
        industry: true,
        doe: true,
        owner: true,
        notes: true,
        createdAt: true
      }
    });
    if (!lead) return res.json(null);

    const details = {};
    const freeNotes = [];
    for (const line of String(lead.notes ?? "").split(/\r?\n/).filter(Boolean)) {
      const match = /^([^:]+):\s*(.*)$/.exec(line);
      if (!match) {
        freeNotes.push(line);
        continue;
      }
      details[match[1].trim().toLowerCase()] = match[2].trim();
    }

    res.json({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      mobile: lead.mobile,
      capitalAsk: lead.capitalAsk,
      territory: lead.territory,
      industry: lead.industry,
      doe: lead.doe || lead.owner,
      jobTitle: details["job title"] ?? "",
      companySize: details["company size"] ?? "",
      revenue: details.revenue ?? "",
      website: details.website ?? "",
      notes: details.notes ?? freeNotes.join("\n"),
      submittedAt: lead.createdAt
    });
  })
);

channelPartnerPortalAuthRouter.get(
  "/referrals",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const partner = await prisma.channelPartner.findUnique({
      where: { id: req.channelPartner.id },
      select: { id: true, name: true, commissionPct: true }
    });
    if (!partner) return res.status(404).json({ error: "Channel partner not found." });

    const leads = await prisma.lead.findMany({
      where: { channelPartner: req.channelPartner.businessName },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        mobile: true,
        capitalAsk: true,
        doe: true,
        owner: true,
        createdAt: true,
        ndaRecord: { select: { status: true } },
        ioiRecord: { select: { status: true } },
        _count: { select: { meetings: true, documents: true } },
        dealStages: {
          where: { stage: "TERM_SHEET" },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { status: true, amount: true, completedAt: true }
        }
      }
    });

    const referrals = leads.map((lead) => {
      const termSheet = lead.dealStages[0] ?? null;
      const closed = termSheet?.status === "COMPLETED";
      const borrowingAmount = parseMoneyAmount(termSheet?.amount) ?? parseMoneyAmount(lead.capitalAsk);
      const commission = closed && borrowingAmount != null ? computeChannelPartnerCommission(borrowingAmount, partner.commissionPct) : null;
      return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        contact: lead.email || lead.mobile || null,
        doe: lead.doe || lead.owner || null,
        referredAt: lead.createdAt,
        currentStage: currentReferralStage({
          termSheet,
          ioi: lead.ioiRecord,
          nda: lead.ndaRecord,
          meetings: lead._count.meetings,
          documents: lead._count.documents
        }),
        amountText: termSheet?.amount || lead.capitalAsk || null,
        commissionEligible: Boolean(closed && commission?.commissionAmount != null),
        commissionAmount: commission?.commissionAmount ?? null,
        commissionPct: commission?.pct ?? null
      };
    });

    res.json({
      referrals,
      summary: {
        total: referrals.length,
        commissionEligible: referrals.filter((row) => row.commissionEligible).length,
        estimatedCommission: referrals.reduce((sum, row) => sum + (row.commissionAmount ?? 0), 0)
      }
    });
  })
);

channelPartnerPortalAuthRouter.post(
  "/refer-lead",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const parsed = referLeadSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    if (!data.email && !data.mobile) {
      return res.status(400).json({ error: "At least one contact method is required (email or mobile)." });
    }

    const details = [
      data.jobTitle ? `Job title: ${data.jobTitle}` : null,
      data.companySize ? `Company size: ${data.companySize}` : null,
      data.revenue ? `Revenue: ${data.revenue}` : null,
      data.website ? `Website: ${data.website}` : null,
      data.notes ? `Notes: ${data.notes}` : null
    ].filter(Boolean);

    const lead = await prisma.lead.create({
      data: {
        ...buildLeadCreateData({
          name: data.name,
          company: data.company,
          email: data.email || null,
          mobile: data.mobile || null,
          capitalAsk: data.capitalAsk || "Not specified",
          owner: data.doe || null,
          leadSource: "Channel Partner Referral",
          territory: data.territory || null,
          notes: details.join("\n") || null,
          doe: data.doe || null,
          channelPartner: req.channelPartner.businessName
        }),
        industry: data.industry || null,
        status: "INTERESTED"
      }
    });

    res.status(201).json(lead);
  })
);

// --- Password reset (public — no session, that's the whole point) --------
// Mirrors routes/auth.js's staff flow exactly, one level down — same
// generic-response/no-enumeration reasoning, same one-time-use/expiry
// token mechanics (see ChannelPartnerPasswordResetToken), just against
// ChannelPartnerUser instead of User. Before this, a partner who forgot
// their password had no self-service option at all — only an admin could
// reset it (see routes/channelPartners.js POST /portal-users/:id/reset-password).

channelPartnerPortalAuthRouter.post(
  "/forgot-password",
  forgotPasswordRateLimit,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    const genericOk = () =>
      res.json({ ok: true, message: "If that email has an account, a reset link is on its way." });

    if (!email) return genericOk();

    const channelPartnerUser = await prisma.channelPartnerUser.findUnique({ where: { email } });
    if (!channelPartnerUser || channelPartnerUser.status === "SUSPENDED") return genericOk();

    const rawToken = crypto.randomBytes(32).toString("hex");
    await prisma.channelPartnerPasswordResetToken.create({
      data: {
        channelPartnerUserId: channelPartnerUser.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000)
      }
    });

    const resetUrl = `${appBaseUrl()}/partner?reset=${rawToken}`;
    const mail = passwordResetEmail({ name: channelPartnerUser.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES });
    const result = await sendSystemEmail({ to: channelPartnerUser.email, ...mail });

    if (!result.sent) {
      // Surfaced in the server log only — same reasoning as the staff
      // flow: telling the caller would leak both that the account exists
      // and details of the mail setup.
      console.error(`Channel partner password reset email to ${channelPartnerUser.email} failed: ${result.reason}`);
    }

    genericOk();
  })
);

channelPartnerPortalAuthRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const rawToken = String(req.body?.token ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }

    const record = await prisma.channelPartnerPasswordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
      include: { channelPartnerUser: true }
    });

    const invalid = () => res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    if (!record || record.usedAt || record.expiresAt < new Date()) return invalid();

    await prisma.$transaction([
      prisma.channelPartnerUser.update({
        where: { id: record.channelPartnerUserId },
        data: { passwordHash: await hashPassword(newPassword) }
      }),
      prisma.channelPartnerPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Any other outstanding links for this account become useless too —
      // resetting the password should close every pending reset, not just
      // the one that was clicked.
      prisma.channelPartnerPasswordResetToken.deleteMany({ where: { channelPartnerUserId: record.channelPartnerUserId, usedAt: null } })
    ]);

    res.json({ ok: true, message: "Password updated — you can sign in now." });
  })
);
