import { Router } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword, verifyPassword, signClientToken } from "../lib/auth.js";
import { verifyClientInviteToken } from "../lib/clientPortalToken.js";
import { hashResetToken } from "../lib/resetTokenHash.js";
import { verifyStaffPreviewToken } from "../lib/staffPreviewToken.js";
import { requireClientAuth, setClientSessionCookie, clearClientSessionCookie } from "../middleware/requireClientAuth.js";
import { authShell, dashboardShell, formField, primaryButton, errorBanner, noteText, escapeHtml } from "../lib/clientPortalPage.js";
import { buildPortalStages, PORTAL_STAGES } from "../lib/clientPortalStages.js";
import { REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";
import { extractText } from "../lib/documentText.js";
import { upload, UPLOAD_DIR, MAX_FILE_BYTES } from "../lib/fileUpload.js";
import { loginRateLimit, forgotPasswordRateLimit } from "../middleware/authRateLimit.js";
import { sendSystemEmail, passwordResetEmail } from "../lib/systemMailer.js";

// Same idiom as routes/leads.js and routes/ndaRecords.js — the client
// portal is server-rendered by this API, not the frontend SPA, so its own
// links (like the reset-password link mailed out below) point at this
// API's own base URL, not the frontend's CORS_ORIGIN.
function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

const RESET_TTL_MINUTES = 60;

export const clientPortalRouter = Router();

// --- Registration ----------------------------------------------------------

function inviteMessagePage({ title, message, note }) {
  return authShell({
    title,
    subtitle: "",
    bodyHtml: `
      <div style="margin-top:24px;">
        <p style="margin:0;font-size:14px;color:#5c6b87;line-height:1.7;text-align:center;">${message}</p>
        ${note ? noteText(note) : ""}
      </div>
    `
  });
}

function registerFormHtml({ lead, error, values = {} }) {
  return authShell({
    title: "Set up your account",
    subtitle: `For ${escapeHtml(lead.company)} — track your NDA, IOI and every step in between.`,
    bodyHtml: `
      <div style="margin-top:24px;">
        ${errorBanner(error)}
        <form method="POST">
          ${formField({ label: "Full name", name: "name", value: values.name ?? lead.name ?? "" })}
          ${formField({ label: "Email", name: "email", type: "email", value: values.email ?? lead.email ?? "" })}
          ${formField({ label: "Phone number", name: "phone", type: "tel", required: false, value: values.phone ?? "" })}
          ${formField({ label: "Password", name: "password", type: "password", placeholder: "At least 8 characters" })}
          ${formField({ label: "Confirm password", name: "confirmPassword", type: "password" })}
          ${primaryButton("Create account")}
        </form>
        ${noteText(`Already registered? <a href="/api/client-portal/login">Sign in</a>`)}
      </div>
    `
  });
}

clientPortalRouter.get(
  "/register/:token",
  asyncHandler(async (req, res) => {
    const leadId = verifyClientInviteToken(req.params.token);
    if (!leadId) {
      return res.status(410).send(inviteMessagePage({ title: "Link expired", message: "This invite link is invalid or has expired. Ask your contact at Global Capital BV to send a new one." }));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { clientUser: true } });
    if (!lead) {
      return res.status(404).send(inviteMessagePage({ title: "Not found", message: "We couldn't find this invite." }));
    }
    if (lead.clientUser) {
      return res.send(
        inviteMessagePage({
          title: "Already registered",
          message: `An account already exists for ${escapeHtml(lead.company)}.`,
          note: `<a href="/api/client-portal/login">Sign in instead</a>`
        })
      );
    }

    res.send(registerFormHtml({ lead }));
  })
);

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim().optional(),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });

clientPortalRouter.post(
  "/register/:token",
  asyncHandler(async (req, res) => {
    const leadId = verifyClientInviteToken(req.params.token);
    if (!leadId) {
      return res.status(410).send(inviteMessagePage({ title: "Link expired", message: "This invite link is invalid or has expired." }));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { clientUser: true } });
    if (!lead) return res.status(404).send(inviteMessagePage({ title: "Not found", message: "We couldn't find this invite." }));
    if (lead.clientUser) {
      return res.send(
        inviteMessagePage({
          title: "Already registered",
          message: `An account already exists for ${escapeHtml(lead.company)}.`,
          note: `<a href="/api/client-portal/login">Sign in instead</a>`
        })
      );
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check the form and try again.";
      return res.status(400).send(registerFormHtml({ lead, error: message, values: req.body }));
    }

    const emailTaken = await prisma.clientUser.findUnique({ where: { email: parsed.data.email } });
    if (emailTaken) {
      return res.status(400).send(registerFormHtml({ lead, error: "That email is already registered.", values: req.body }));
    }

    const clientUser = await prisma.clientUser.create({
      data: {
        leadId: lead.id,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        passwordHash: await hashPassword(parsed.data.password)
      }
    });

    setClientSessionCookie(res, signClientToken(clientUser));
    res.redirect("/api/client-portal/dashboard");
  })
);

// --- Login -------------------------------------------------------------

function loginFormHtml({ error } = {}) {
  return authShell({
    title: "Sign in",
    subtitle: "Track your deal's progress with Global Capital BV.",
    bodyHtml: `
      <div style="margin-top:24px;">
        ${errorBanner(error)}
        <form method="POST">
          ${formField({ label: "Email", name: "email", type: "email" })}
          ${formField({ label: "Password", name: "password", type: "password" })}
          ${primaryButton("Sign in")}
        </form>
        <p style="margin:14px 0 0;text-align:center;">
          <a href="/api/client-portal/forgot-password" style="font-size:13px;font-weight:600;color:#3046b2;text-decoration:none;">Forgot password?</a>
        </p>
        ${noteText("Received an invite email? Use the link in that email to set up your account first.")}
      </div>
    `
  });
}

clientPortalRouter.get("/login", (_req, res) => res.send(loginFormHtml()));

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

clientPortalRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(loginFormHtml({ error: "Enter your email and password." }));

    // Identical response whether the email doesn't exist or the password is
    // wrong — same no-enumeration reasoning as the staff forgot-password
    // flow, applied here to login itself since this form has no separate
    // "does this email exist" step to protect.
    const clientUser = await prisma.clientUser.findUnique({ where: { email: parsed.data.email } });
    const valid = clientUser ? await verifyPassword(parsed.data.password, clientUser.passwordHash) : false;
    if (!valid || clientUser.status === "SUSPENDED") {
      return res.status(401).send(loginFormHtml({ error: "Incorrect email or password." }));
    }

    await prisma.clientUser.update({ where: { id: clientUser.id }, data: { lastLoginAt: new Date() } });
    setClientSessionCookie(res, signClientToken(clientUser));
    res.redirect("/api/client-portal/dashboard");
  })
);

clientPortalRouter.get("/logout", (_req, res) => {
  clearClientSessionCookie(res);
  res.redirect("/api/client-portal/login");
});

// --- Password reset (public — no session, same reasoning as the staff
// flow in routes/auth.js: this has to work for someone who's locked out) --

function forgotPasswordFormHtml({ sent } = {}) {
  return authShell({
    title: "Reset your password",
    subtitle: "Enter the email you signed up with and we'll send you a reset link.",
    bodyHtml: sent
      ? `
        <div style="margin-top:24px;">
          <p style="margin:0;font-size:14px;color:#5c6b87;line-height:1.7;">If that email has an account, a reset link is on its way — check your inbox.</p>
          ${noteText(`<a href="/api/client-portal/login">Back to sign in</a>`)}
        </div>`
      : `
        <div style="margin-top:24px;">
          <form method="POST">
            ${formField({ label: "Email", name: "email", type: "email" })}
            ${primaryButton("Send reset link")}
          </form>
          ${noteText(`<a href="/api/client-portal/login">Back to sign in</a>`)}
        </div>`
  });
}

clientPortalRouter.get("/forgot-password", (_req, res) => res.send(forgotPasswordFormHtml()));

const forgotPasswordSchema = z.object({ email: z.string().trim().email() });

clientPortalRouter.post(
  "/forgot-password",
  forgotPasswordRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    // Always the same "sent" response whether the parse fails, the email
    // doesn't exist, or the account is suspended — same no-enumeration
    // reasoning as the staff flow (routes/auth.js).
    if (!parsed.success) return res.send(forgotPasswordFormHtml({ sent: true }));

    const clientUser = await prisma.clientUser.findUnique({ where: { email: parsed.data.email } });
    if (clientUser && clientUser.status !== "SUSPENDED") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await prisma.clientPasswordResetToken.create({
        data: {
          clientUserId: clientUser.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000)
        }
      });

      const resetUrl = `${apiBaseUrl()}/api/client-portal/reset-password/${rawToken}`;
      const mail = passwordResetEmail({ name: clientUser.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES });
      const result = await sendSystemEmail({ to: clientUser.email, ...mail });
      if (!result.sent) {
        // Surfaced in the server log only — same reasoning as the staff
        // flow: telling the caller would leak both that the account exists
        // and details of the mail setup.
        console.error(`Client portal password reset email to ${clientUser.email} failed: ${result.reason}`);
      }
    }

    res.send(forgotPasswordFormHtml({ sent: true }));
  })
);

function resetPasswordFormHtml({ error } = {}) {
  return authShell({
    title: "Choose a new password",
    subtitle: "",
    bodyHtml: `
      <div style="margin-top:24px;">
        ${errorBanner(error)}
        <form method="POST">
          ${formField({ label: "New password", name: "newPassword", type: "password", placeholder: "At least 8 characters" })}
          ${formField({ label: "Confirm password", name: "confirmPassword", type: "password" })}
          ${primaryButton("Update password")}
        </form>
      </div>
    `
  });
}

clientPortalRouter.get("/reset-password/:token", (_req, res) => res.send(resetPasswordFormHtml()));

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string()
  })
  .refine((data) => data.newPassword === data.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });

clientPortalRouter.post(
  "/reset-password/:token",
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Please check the form and try again.";
      return res.status(400).send(resetPasswordFormHtml({ error: message }));
    }

    const record = await prisma.clientPasswordResetToken.findUnique({
      where: { tokenHash: hashResetToken(req.params.token) }
    });

    const invalid = () =>
      res.status(400).send(resetPasswordFormHtml({ error: "This reset link is invalid or has expired. Request a new one." }));
    if (!record || record.usedAt || record.expiresAt < new Date()) return invalid();

    await prisma.$transaction([
      prisma.clientUser.update({
        where: { id: record.clientUserId },
        data: { passwordHash: await hashPassword(parsed.data.newPassword) }
      }),
      prisma.clientPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Any other outstanding links for this account become useless too —
      // same reasoning as the staff flow.
      prisma.clientPasswordResetToken.deleteMany({ where: { clientUserId: record.clientUserId, usedAt: null } })
    ]);

    res.send(
      inviteMessagePage({
        title: "Password updated",
        message: "Your password has been changed.",
        note: `<a href="/api/client-portal/login">Sign in now</a>`
      })
    );
  })
);

// --- Dashboard -------------------------------------------------------------

// Same hexes as src/components/ui.jsx's noteToneClass (green/amber/red/slate)
// — the badges here should read as the exact same "Badge" component used
// everywhere else in the app, not a lookalike.
const STATUS_STYLE = {
  completed: { bg: "#dff5e7", fg: "#2b9b60", label: "Completed" },
  in_progress: { bg: "#ffe9d0", fg: "#f29c38", label: "In progress" },
  declined: { bg: "#ffe3e3", fg: "#e0483f", label: "Declined" },
  not_started: { bg: "#edf1f6", fg: "#748096", label: "Not started" }
};

function stageRowHtml(stage, extraHtml = "") {
  const style = STATUS_STYLE[stage.status];
  return `
    <div class="gc-stage-row" id="stage-${escapeHtml(stage.key)}">
      <div class="gc-stage-dot" style="background:${stage.status === "not_started" ? "#d6deea" : style.fg};"></div>
      <div style="flex:1;min-width:0;">
        <div class="gc-stage-head">
          <span class="gc-stage-label">${escapeHtml(stage.label)}</span>
          <span class="gc-badge" style="background:${style.bg};color:${style.fg};">${style.label}</span>
        </div>
        <p class="gc-stage-detail">${escapeHtml(stage.detail)}</p>
        ${extraHtml}
      </div>
    </div>`;
}

// Same hexes as ui.jsx's noteToneClass blue/violet — matching the StatCard
// note pills used across the SPA's own dashboards.
const STAT_TONE = {
  green: { bg: "#dff5e7", fg: "#2b9b60" },
  blue: { bg: "#eef1ff", fg: "#4766cc" },
  violet: { bg: "#efe5ff", fg: "#8853d0" }
};

function statCardHtml(card) {
  const tone = STAT_TONE[card.tone];
  return `
    <div class="gc-stat-card">
      <p class="gc-stat-label">${escapeHtml(card.label)}</p>
      <p class="gc-stat-value">${escapeHtml(card.value)}</p>
      <span class="gc-stat-note" style="background:${tone.bg};color:${tone.fg};">${escapeHtml(card.note)}</span>
    </div>`;
}

// Reshapes an NdaRecord's stored counterparty-details fields into what
// ndaSignFormHtml's inputs expect — mainly formatting agreementDate as
// yyyy-mm-dd, the only shape an <input type="date"> value will accept.
function ndaFilledValues(nda) {
  return {
    counterpartyLegalName: nda?.counterpartyLegalName ?? "",
    counterpartyCountry: nda?.counterpartyCountry ?? "",
    counterpartyAddress: nda?.counterpartyAddress ?? "",
    agreementDate: nda?.agreementDate ? new Date(nda.agreementDate).toISOString().slice(0, 10) : "",
    signatoryName: nda?.signatoryName ?? "",
    signatoryTitle: nda?.signatoryTitle ?? ""
  };
}

// The NDA row is the only stage a client can act on directly — it's the
// gate everything else waits behind. Three ways to clear it: fill in the
// template's actual blanks (counterparty details, signatory) right here in
// a form, download the template (assets/nda-template.pdf) and upload a
// signed/scanned copy back, or upload an NDA of their own instead of ours
// — the last two share the same upload control, since the system can't
// tell (and doesn't need to) which one a given file is.
function ndaSignFormHtml({ error, doeName, alreadySigned, companyName, filled } = {}) {
  const f = filled ?? {};
  return `
    <div class="gc-sign-box">
      ${doeName ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">Your Global Capital BV contact: <strong style="color:#334463;">${escapeHtml(doeName)}</strong></p>` : ""}
      ${
        alreadySigned
          ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">You've already accepted this NDA. You can fill in the form again to update the details, or upload a copy for your own records.</p>`
          : ""
      }
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}

      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#102246;">Option 1 — Fill in your details online</p>
      <form method="POST" action="/api/client-portal/nda/fill-details" style="margin:0 0 22px;display:grid;gap:12px;max-width:480px;">
        ${formField({ label: "Your company's legal name", name: "counterpartyLegalName", value: f.counterpartyLegalName ?? companyName ?? "" })}
        ${formField({ label: "Country of registration", name: "counterpartyCountry", value: f.counterpartyCountry ?? "" })}
        ${formField({ label: "Registered office address", name: "counterpartyAddress", value: f.counterpartyAddress ?? "" })}
        ${formField({ label: "Agreement date", name: "agreementDate", type: "date", value: f.agreementDate ?? "" })}
        ${formField({ label: "Signatory name", name: "signatoryName", value: f.signatoryName ?? "" })}
        ${formField({ label: "Signatory title", name: "signatoryTitle", value: f.signatoryTitle ?? "" })}
        <label class="gc-checkbox-row">
          <input type="checkbox" name="agree" required />
          I have read and agree to the terms of this NDA
        </label>
        <button type="submit" class="gc-btn-primary" style="width:auto;padding:10px 22px;border-radius:12px;">Submit &amp; Accept</button>
      </form>

      <div style="border-top:1px solid #e7edf5;padding-top:16px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#102246;">Prefer a document instead?</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5c6b87;line-height:1.6;">
          Option 2 — download our template, sign it by hand, then upload it back. Option 3 — already have your own NDA? Upload that instead.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;">
          <a href="/api/client-portal/nda/template" class="gc-btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">Download NDA Template</a>
          <form method="POST" action="/api/client-portal/nda/upload" enctype="multipart/form-data" style="margin:0;">
            <label class="gc-btn-secondary">
              Upload My NDA
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                required
                class="gc-visually-hidden"
                onchange="this.form.requestSubmit()"
              />
            </label>
          </form>
        </div>
      </div>
    </div>`;
}

// Same reshaping as ndaFilledValues — yyyy-mm-dd for the date input.
function ioiFilledValues(ioi) {
  return {
    counterpartyJurisdiction: ioi?.counterpartyJurisdiction ?? "",
    totalProjectCost: ioi?.totalProjectCost ?? "",
    borrowerEquity: ioi?.borrowerEquity ?? "",
    agreementDate: ioi?.agreementDate ? new Date(ioi.agreementDate).toISOString().slice(0, 10) : "",
    signatoryName: ioi?.signatoryName ?? "",
    signatoryAddress: ioi?.signatoryAddress ?? "",
    signatoryPhone: ioi?.signatoryPhone ?? "",
    signatoryEmail: ioi?.signatoryEmail ?? ""
  };
}

// Same two-option shape as ndaSignFormHtml, minus its third option (nothing
// here corresponds to "upload your own IOI" — an IOI is Global Capital's
// own offer, not something a client would independently produce): fill in
// the LOI template's actual blanks (assets/ioi-template.docx) right here,
// or download it, sign by hand, and upload the scanned/completed copy.
function ioiRespondFormHtml({ error, doeName, alreadySigned, companyName, filled } = {}) {
  const f = filled ?? {};
  return `
    <div class="gc-sign-box">
      ${doeName ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">Your Global Capital BV contact: <strong style="color:#334463;">${escapeHtml(doeName)}</strong></p>` : ""}
      ${
        alreadySigned
          ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">You've already accepted this IOI. You can fill in the form again to update the details, or upload a copy for your own records.</p>`
          : ""
      }
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}

      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#102246;">Option 1 — Fill in your details online</p>
      <form method="POST" action="/api/client-portal/ioi/fill-details" style="margin:0 0 22px;display:grid;gap:12px;max-width:480px;">
        ${formField({ label: "Your company's legal name", name: "counterpartyLegalName", value: companyName ?? "" })}
        ${formField({ label: "Jurisdiction of domicile", name: "counterpartyJurisdiction", value: f.counterpartyJurisdiction ?? "" })}
        ${formField({ label: "Total acquisition / project cost (USD)", name: "totalProjectCost", value: f.totalProjectCost ?? "" })}
        ${formField({ label: "Equity to be provided by the borrower (USD)", name: "borrowerEquity", value: f.borrowerEquity ?? "" })}
        ${formField({ label: "Agreement date", name: "agreementDate", type: "date", value: f.agreementDate ?? "" })}
        ${formField({ label: "Signatory name", name: "signatoryName", value: f.signatoryName ?? "" })}
        ${formField({ label: "Signatory address", name: "signatoryAddress", value: f.signatoryAddress ?? "" })}
        ${formField({ label: "Signatory phone", name: "signatoryPhone", type: "tel", value: f.signatoryPhone ?? "" })}
        ${formField({ label: "Signatory email", name: "signatoryEmail", type: "email", value: f.signatoryEmail ?? "" })}
        <label class="gc-checkbox-row">
          <input type="checkbox" name="agree" required />
          I have read and agree to the terms of this IOI
        </label>
        <button type="submit" class="gc-btn-primary" style="width:auto;padding:10px 22px;border-radius:12px;">Submit &amp; Accept</button>
      </form>

      <div style="border-top:1px solid #e7edf5;padding-top:16px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#102246;">Prefer a document instead?</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5c6b87;line-height:1.6;">
          Option 2 — download our template, sign it by hand, then upload it back.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;">
          <a href="/api/client-portal/ioi/template" class="gc-btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">Download IOI Template</a>
          <form method="POST" action="/api/client-portal/ioi/upload" enctype="multipart/form-data" style="margin:0;">
            <label class="gc-btn-secondary">
              Upload My IOI
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                required
                class="gc-visually-hidden"
                onchange="this.form.requestSubmit()"
              />
            </label>
          </form>
        </div>
      </div>
    </div>`;
}

// The Data Room stage's real upload UI — previously this stage's page
// showed only "X of Y documents received" with no way for the client to
// actually send one, then (before this) a single dropdown that hid the
// full checklist behind one collapsed select. Mirrors the admin Data
// Room's own "Required documents checklist" (DataRoomModule.jsx) instead:
// every item as its own row with a real tick once received, and its own
// upload/replace control — so a client sees the whole list at a glance,
// not just whichever one item the dropdown happened to have selected.
// Same shared Document model and upload pipeline as a staff upload (see
// routes/documents.js) and the NDA upload above; each row's category is
// fixed to that exact REQUIRED_DOCUMENT_LABELS entry, so a client can't
// tag an upload as something the checklist isn't actually asking for.
function dataRoomUploadFormHtml({ error, uploadedCategories }) {
  const rows = REQUIRED_DOCUMENTS.map((doc) => {
    const received = uploadedCategories.has(doc.label);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid ${received ? "#c7ead8" : "#e7edf5"};background:${received ? "#f3fbf6" : "#fbfcfe"};border-radius:12px;padding:10px 14px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="display:grid;place-items:center;width:22px;height:22px;border-radius:999px;font-size:12px;font-weight:700;flex-shrink:0;background:${received ? "#2b9b60" : "#d6deea"};color:${received ? "#ffffff" : "#748096"};">${received ? "✓" : ""}</span>
          <span style="font-size:13px;color:#102246;font-weight:500;">${escapeHtml(doc.label)}</span>
        </div>
        <form method="POST" action="/api/client-portal/documents/upload" enctype="multipart/form-data" style="margin:0;flex-shrink:0;">
          <input type="hidden" name="category" value="${escapeHtml(doc.label)}" />
          <label class="gc-btn-secondary" style="font-size:12px;padding:7px 16px;">
            ${received ? "Replace" : "Upload"}
            <input
              type="file"
              name="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              required
              class="gc-visually-hidden"
              onchange="this.form.requestSubmit()"
            />
          </label>
        </form>
      </div>`;
  }).join("");

  return `
    <div class="gc-sign-box">
      <p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">
        Upload a document for each item on our request list. Already-received items are marked with a check —
        uploading again replaces it with your new file.
      </p>
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}
      <div>${rows}</div>
    </div>`;
}

// Both /dashboard (the overview) and /stage/:key (one stage on its own
// page) need the exact same underlying records and the same 8-stage
// computation — the only difference is how much of it gets rendered.
// Kept in one place so the two routes can't quietly drift apart.
async function loadPortalData(leadId) {
  const [nda, meetings, ioi, visits, fieldVisit, termSheet, documentCategories] = await Promise.all([
    prisma.ndaRecord.findUnique({ where: { leadId } }),
    prisma.meeting.findMany({ where: { leadId } }),
    prisma.ioiRecord.findUnique({ where: { leadId } }),
    prisma.visitPlan.findMany({ where: { leadId } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "FIELD_VISIT" } } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "TERM_SHEET" } } }),
    // Scoped to this lead's own uploads — unscoped before, which meant any
    // client's portal could show a checklist item "received" just because
    // some OTHER lead's (or an unrelated admin general-library) document
    // happened to share that category tag.
    prisma.document.findMany({ where: { leadId }, select: { category: true }, distinct: ["category"] })
  ]);

  const uploadedCategories = new Set(documentCategories.map((d) => d.category));
  const receivedCount = REQUIRED_DOCUMENT_LABELS.filter((label) => uploadedCategories.has(label)).length;

  const stages = buildPortalStages({
    nda,
    meetings,
    dataRoom: { receivedCount, totalRequired: REQUIRED_DOCUMENT_LABELS.length },
    ioi,
    visits,
    fieldVisit,
    termSheet
  });

  return { nda, ioi, stages, uploadedCategories };
}

function sidebarStagesFrom(stages) {
  return stages.map((s) => ({
    key: s.key,
    label: s.label,
    dotColor: s.status === "not_started" ? "#5c6b9a" : STATUS_STYLE[s.status].fg
  }));
}

clientPortalRouter.get(
  "/dashboard",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const { nda, ioi, stages, uploadedCategories } = await loadPortalData(leadId);

    const completedCount = stages.filter((s) => s.status === "completed").length;

    // Available any time the NDA has actually been sent — DRAFT hasn't
    // reached the client yet, so there's nothing to act on, but once it's
    // out there the client can accept or (re-)upload their copy at any
    // point, including after it's already marked SIGNED: they may want to
    // attach their own signed PDF after clicking "I Am Accept It" earlier,
    // or replace an upload with a better copy. DECLINED/EXPIRED stay
    // excluded — those are a deliberate call made on the staff side, not
    // something the client should be able to override from the portal.
    const ndaActionable = nda && Boolean(nda.sentAt) && !["DECLINED", "EXPIRED"].includes(nda.status);
    const ndaError = req.query.ndaError ? String(req.query.ndaError) : null;
    const docError = req.query.docError ? String(req.query.docError) : null;
    // Same gate as ndaActionable — sent and not a deliberate staff-side
    // decline/expiry — mirrored for IOI rather than reused, since the two
    // records' status enums and sentAt semantics are independent.
    const ioiActionable = ioi && Boolean(ioi.sentAt) && !["DECLINED", "EXPIRED"].includes(ioi.status);
    const ioiError = req.query.ioiError ? String(req.query.ioiError) : null;

    // Mirrors the SPA's own StatCard row (see e.g. MeetingsModule's five
    // cards) — a quick-read summary above the full stage-by-stage list,
    // not just decoration.
    const nextStage = stages.find((s) => s.status !== "completed");
    const stats = [
      {
        label: "Steps Completed",
        value: `${completedCount}/${stages.length}`,
        note: `${Math.round((completedCount / stages.length) * 100)}% complete`,
        tone: "green"
      },
      {
        label: "Current Stage",
        value: nextStage ? nextStage.label : "All done",
        note: nextStage ? nextStage.detail : "Every step is complete",
        tone: "blue"
      },
      {
        label: "Your Contact",
        value: nda?.owner || "—",
        note: "Global Capital BV",
        tone: "violet"
      }
    ];

    res.send(
      dashboardShell({
        title: "Your deal",
        clientName: req.clientUser.name,
        companyName: req.clientUser.lead.company,
        stages: sidebarStagesFrom(stages),
        bodyHtml: `
          <span class="gc-badge-pill">Your Deal</span>
          <h1 class="gc-heading">${escapeHtml(req.clientUser.lead.company)}</h1>
          <p class="gc-subheading">Welcome back, ${escapeHtml(req.clientUser.name)} — track your NDA, IOI and every step in between, right here.</p>

          <div class="gc-stats">${stats.map(statCardHtml).join("")}</div>

          <div class="gc-card">
            <div class="gc-card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="#3046b2" stroke-width="2" width="20" height="20" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Deal Progress
            </div>
            <p class="gc-card-subtitle">Every step of your deal with Global Capital BV, in order.</p>
            <div style="margin-top:8px;">
              ${stages
                .map((s) => {
                  let extraHtml = "";
                  if (s.key === "nda" && ndaActionable) {
                    extraHtml = ndaSignFormHtml({
                      error: ndaError,
                      doeName: nda.owner,
                      alreadySigned: nda.status === "SIGNED",
                      companyName: req.clientUser.lead.company,
                      filled: ndaFilledValues(nda)
                    });
                  } else if (s.key === "ioi" && ioiActionable) {
                    extraHtml = ioiRespondFormHtml({
                      error: ioiError,
                      doeName: ioi.owner,
                      alreadySigned: ioi.status === "SIGNED",
                      companyName: req.clientUser.lead.company,
                      filled: ioiFilledValues(ioi)
                    });
                  } else if (s.key === "dataRoom") {
                    extraHtml = dataRoomUploadFormHtml({ error: docError, uploadedCategories });
                  }
                  return stageRowHtml(s, extraHtml);
                })
                .join("")}
            </div>
          </div>
        `
      })
    );
  })
);

// One stage on its own page — reached from the sidebar's per-stage links.
// Reuses stageRowHtml unchanged, so a stage looks identical here and on
// the Overview; only how much of the page it takes up differs.
clientPortalRouter.get(
  "/stage/:key",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const stageMeta = PORTAL_STAGES.find((s) => s.key === req.params.key);
    if (!stageMeta) return res.redirect("/api/client-portal/dashboard");

    const leadId = req.clientUser.leadId;
    const { nda, ioi, stages, uploadedCategories } = await loadPortalData(leadId);
    const stage = stages.find((s) => s.key === stageMeta.key);

    const ndaActionable = nda && Boolean(nda.sentAt) && !["DECLINED", "EXPIRED"].includes(nda.status);
    const ndaError = req.query.ndaError ? String(req.query.ndaError) : null;
    const ioiActionable = ioi && Boolean(ioi.sentAt) && !["DECLINED", "EXPIRED"].includes(ioi.status);
    const ioiError = req.query.ioiError ? String(req.query.ioiError) : null;
    const docError = req.query.docError ? String(req.query.docError) : null;

    let stageExtraHtml = "";
    if (stage.key === "nda" && ndaActionable) {
      stageExtraHtml = ndaSignFormHtml({
        error: ndaError,
        doeName: nda.owner,
        alreadySigned: nda.status === "SIGNED",
        companyName: req.clientUser.lead.company,
        filled: ndaFilledValues(nda)
      });
    } else if (stage.key === "ioi" && ioiActionable) {
      stageExtraHtml = ioiRespondFormHtml({
        error: ioiError,
        doeName: ioi.owner,
        alreadySigned: ioi.status === "SIGNED",
        companyName: req.clientUser.lead.company,
        filled: ioiFilledValues(ioi)
      });
    } else if (stage.key === "dataRoom") {
      stageExtraHtml = dataRoomUploadFormHtml({ error: docError, uploadedCategories });
    }

    res.send(
      dashboardShell({
        title: stage.label,
        clientName: req.clientUser.name,
        companyName: req.clientUser.lead.company,
        stages: sidebarStagesFrom(stages),
        activeKey: stage.key,
        bodyHtml: `
          <span class="gc-badge-pill">Deal Stage</span>
          <h1 class="gc-heading">${escapeHtml(stage.label)}</h1>
          <p class="gc-subheading">Part of your deal with ${escapeHtml(req.clientUser.lead.company)}.</p>

          <div class="gc-card">
            ${stageRowHtml(stage, stageExtraHtml)}
          </div>

          <p style="margin-top:16px;">
            <a href="/api/client-portal/dashboard" style="font-size:13px;font-weight:600;color:#3046b2;text-decoration:none;">← Back to full overview</a>
          </p>
        `
      })
    );
  })
);

// --- Staff preview (read-only "view as client") -----------------------

// Opened from CRM Workspace in a new tab (see routes/leads.js's
// POST /:id/client-portal-preview-link) — a normal <a>/window.open can't
// carry the staff Authorization header, so this is gated by its own
// short-lived signed token instead of requireAuth/requireClientAuth. Reuses
// the exact same dashboard content as GET /dashboard, minus the NDA/Data
// Room action forms (those POST to routes only a real client session can
// use, and this isn't one — signing or uploading on the client's behalf
// from here would be misleading even if it happened to work).
clientPortalRouter.get(
  "/preview/:leadId",
  asyncHandler(async (req, res) => {
    const leadId = verifyStaffPreviewToken(String(req.query.token ?? ""));
    if (!leadId || leadId !== req.params.leadId) {
      return res.status(401).send(
        inviteMessagePage({ title: "Preview link expired", message: "This staff preview link is invalid or has expired. Open it again from the lead's CRM Workspace panel." })
      );
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { clientUser: true } });
    if (!lead || !lead.clientUser) {
      return res.status(404).send(inviteMessagePage({ title: "Not found", message: "This lead no longer has a client portal account." }));
    }

    const { nda, stages } = await loadPortalData(leadId);
    const completedCount = stages.filter((s) => s.status === "completed").length;
    const nextStage = stages.find((s) => s.status !== "completed");
    const stats = [
      { label: "Steps Completed", value: `${completedCount}/${stages.length}`, note: `${Math.round((completedCount / stages.length) * 100)}% complete`, tone: "green" },
      { label: "Current Stage", value: nextStage ? nextStage.label : "All done", note: nextStage ? nextStage.detail : "Every step is complete", tone: "blue" },
      { label: "Your Contact", value: nda?.owner || "—", note: "Global Capital BV", tone: "violet" }
    ];

    res.send(
      dashboardShell({
        title: "Staff preview",
        clientName: lead.clientUser.name,
        companyName: lead.company,
        stages: sidebarStagesFrom(stages),
        bodyHtml: `
          <div style="display:flex;align-items:center;gap:10px;background:#fff4e0;border:1px solid #f4d9a8;color:#8a5a12;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:20px;">
            <span aria-hidden="true">👁</span>
            Staff preview — read-only. This is exactly what ${escapeHtml(lead.clientUser.name)} sees, but nothing here can be clicked to act on their behalf.
          </div>

          <span class="gc-badge-pill">Your Deal</span>
          <h1 class="gc-heading">${escapeHtml(lead.company)}</h1>
          <p class="gc-subheading">Client portal account: ${escapeHtml(lead.clientUser.email)}</p>

          <div class="gc-stats">${stats.map(statCardHtml).join("")}</div>

          <div class="gc-card">
            <div class="gc-card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="#3046b2" stroke-width="2" width="20" height="20" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Deal Progress
            </div>
            <p class="gc-card-subtitle">Every step of this lead's deal with Global Capital BV, in order.</p>
            <div style="margin-top:8px;">
              ${stages.map((s) => stageRowHtml(s)).join("")}
            </div>
          </div>
        `
      })
    );
  })
);

// --- NDA signing (client-side) ---------------------------------------

// No typed name anymore — the client is already authenticated, so their
// account's own name/email is the signature, not a free-text field they
// could type anything into.
const ndaSignSchema = z.object({ agree: z.string().min(1) });

clientPortalRouter.post(
  "/nda/sign",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const parsed = ndaSignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("Confirm you agree to the terms first.")}`);
    }

    const nda = await prisma.ndaRecord.findUnique({ where: { leadId } });
    // Re-checked server-side, not just hidden by the dashboard's own
    // conditional rendering. Allowed any time it's been sent, including
    // re-accepting an already-SIGNED one — DECLINED/EXPIRED are the only
    // states blocked, since those are a deliberate staff-side call.
    if (!nda || !nda.sentAt || ["DECLINED", "EXPIRED"].includes(nda.status)) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("This NDA isn't available to accept right now.")}`);
    }

    await prisma.ndaRecord.update({
      where: { leadId },
      data: { status: "SIGNED", signedAt: new Date(), signerName: req.clientUser.name, signerEmail: req.clientUser.email }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);

// --- NDA fill-in-details (Option 1 — see ndaSignFormHtml) ----------------

const ndaFillDetailsSchema = z.object({
  agree: z.string().min(1),
  counterpartyLegalName: z.string().trim().min(1, "Enter your company's legal name."),
  counterpartyCountry: z.string().trim().min(1, "Enter the country of registration."),
  counterpartyAddress: z.string().trim().min(1, "Enter the registered office address."),
  agreementDate: z.string().trim().min(1, "Choose the agreement date."),
  signatoryName: z.string().trim().min(1, "Enter the signatory's name."),
  signatoryTitle: z.string().trim().min(1, "Enter the signatory's title.")
});

clientPortalRouter.post(
  "/nda/fill-details",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const parsed = ndaFillDetailsSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Fill in every field and confirm you agree.";
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent(message)}`);
    }

    const nda = await prisma.ndaRecord.findUnique({ where: { leadId } });
    if (!nda || !nda.sentAt || ["DECLINED", "EXPIRED"].includes(nda.status)) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("This NDA isn't available to accept right now.")}`);
    }

    await prisma.ndaRecord.update({
      where: { leadId },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
        signerName: req.clientUser.name,
        signerEmail: req.clientUser.email,
        counterpartyLegalName: parsed.data.counterpartyLegalName,
        counterpartyCountry: parsed.data.counterpartyCountry,
        counterpartyAddress: parsed.data.counterpartyAddress,
        agreementDate: new Date(parsed.data.agreementDate),
        signatoryName: parsed.data.signatoryName,
        signatoryTitle: parsed.data.signatoryTitle
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);

// --- NDA template download (Options 2 & 3 start here) ---------------------

const NDA_TEMPLATE_PATH = path.join(import.meta.dirname, "..", "..", "assets", "nda-template.pdf");

clientPortalRouter.get(
  "/nda/template",
  requireClientAuth,
  (_req, res) => {
    res.download(NDA_TEMPLATE_PATH, "Global-Capital-BV-Reciprocal-NDA-Template.pdf");
  }
);

// --- NDA upload (client-side alternative to typing/clicking accept) ------

// multer's own middleware form doesn't let us redirect-with-a-friendly-
// message on failure (a bad file just 500s), so it's invoked manually and
// its error caught here, same query-param error convention the rest of
// this router already uses.
function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

clientPortalRouter.post(
  "/nda/upload",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const nda = await prisma.ndaRecord.findUnique({ where: { leadId } });
    if (!nda || !nda.sentAt || ["DECLINED", "EXPIRED"].includes(nda.status)) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("This NDA isn't available to accept right now.")}`);
    }

    try {
      await runUpload(req, res);
    } catch (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? `That file is too large. The limit is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
          : "Could not upload that file. Try again.";
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent(message)}`);
    }

    if (!req.file) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("Choose a file to upload.")}`);
    }

    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    // Extraction failures are captured as a note rather than thrown — a
    // scanned PDF or a photo of a signature page should still upload fine.
    const { text, note } = await extractText(filePath, req.file.mimetype, req.file.originalname);

    // Filed the same way a staff upload would be (see routes/documents.js)
    // so it shows up in the Data Room and is searchable by the AI
    // assistant like any other document — uploadedById is null because a
    // ClientUser isn't a staff User, the two identity systems don't cross.
    const doc = await prisma.document.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        category: "NDA",
        description: `Uploaded by ${req.clientUser.name} via the client portal`,
        extractedText: text,
        extractionNote: note,
        uploadedById: null,
        leadId: req.clientUser.leadId
      }
    });

    // Uploading their own signed copy IS acceptance — same end state as
    // the "I Am Accept It" button, just with the client's own document
    // kept as the record instead of a typed clickwrap.
    await prisma.ndaRecord.update({
      where: { leadId },
      data: {
        documentId: doc.id,
        status: "SIGNED",
        signedAt: new Date(),
        signerName: req.clientUser.name,
        signerEmail: req.clientUser.email
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);

// --- IOI fill-in-details (Option 1 — see ioiRespondFormHtml) --------------

const ioiFillDetailsSchema = z.object({
  agree: z.string().min(1),
  counterpartyLegalName: z.string().trim().min(1, "Enter your company's legal name."),
  counterpartyJurisdiction: z.string().trim().min(1, "Enter the jurisdiction of domicile."),
  totalProjectCost: z.string().trim().min(1, "Enter the total acquisition / project cost."),
  borrowerEquity: z.string().trim().min(1, "Enter the equity to be provided by the borrower."),
  agreementDate: z.string().trim().min(1, "Choose the agreement date."),
  signatoryName: z.string().trim().min(1, "Enter the signatory's name."),
  signatoryAddress: z.string().trim().min(1, "Enter the signatory's address."),
  signatoryPhone: z.string().trim().min(1, "Enter the signatory's phone number."),
  signatoryEmail: z.string().trim().email("Enter a valid signatory email.")
});

clientPortalRouter.post(
  "/ioi/fill-details",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const parsed = ioiFillDetailsSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Fill in every field and confirm you agree.";
      return res.redirect(`/api/client-portal/dashboard?ioiError=${encodeURIComponent(message)}`);
    }

    const ioi = await prisma.ioiRecord.findUnique({ where: { leadId } });
    if (!ioi || !ioi.sentAt || ["DECLINED", "EXPIRED"].includes(ioi.status)) {
      return res.redirect(`/api/client-portal/dashboard?ioiError=${encodeURIComponent("This IOI isn't available to accept right now.")}`);
    }

    await prisma.ioiRecord.update({
      where: { leadId },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
        counterparty: parsed.data.counterpartyLegalName,
        counterpartyJurisdiction: parsed.data.counterpartyJurisdiction,
        totalProjectCost: parsed.data.totalProjectCost,
        borrowerEquity: parsed.data.borrowerEquity,
        agreementDate: new Date(parsed.data.agreementDate),
        signatoryName: parsed.data.signatoryName,
        signatoryAddress: parsed.data.signatoryAddress,
        signatoryPhone: parsed.data.signatoryPhone,
        signatoryEmail: parsed.data.signatoryEmail
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);

// --- IOI template download (Option 2 starts here) -------------------------

const IOI_TEMPLATE_PATH = path.join(import.meta.dirname, "..", "..", "assets", "ioi-template.docx");

clientPortalRouter.get(
  "/ioi/template",
  requireClientAuth,
  (_req, res) => {
    res.download(IOI_TEMPLATE_PATH, "Global-Capital-BV-LOI-Template.docx");
  }
);

// --- IOI upload (client-side alternative to filling in the form) ---------

clientPortalRouter.post(
  "/ioi/upload",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const ioi = await prisma.ioiRecord.findUnique({ where: { leadId } });
    if (!ioi || !ioi.sentAt || ["DECLINED", "EXPIRED"].includes(ioi.status)) {
      return res.redirect(`/api/client-portal/dashboard?ioiError=${encodeURIComponent("This IOI isn't available to accept right now.")}`);
    }

    try {
      await runUpload(req, res);
    } catch (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? `That file is too large. The limit is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
          : "Could not upload that file. Try again.";
      return res.redirect(`/api/client-portal/dashboard?ioiError=${encodeURIComponent(message)}`);
    }

    if (!req.file) {
      return res.redirect(`/api/client-portal/dashboard?ioiError=${encodeURIComponent("Choose a file to upload.")}`);
    }

    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    const { text, note } = await extractText(filePath, req.file.mimetype, req.file.originalname);

    const doc = await prisma.document.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        category: "IOI",
        description: `Uploaded by ${req.clientUser.name} via the client portal`,
        extractedText: text,
        extractionNote: note,
        uploadedById: null,
        leadId: req.clientUser.leadId
      }
    });

    // Uploading a signed copy IS acceptance — same end state as filling in
    // the online form, just with the client's own document kept as record.
    await prisma.ioiRecord.update({
      where: { leadId },
      data: {
        documentId: doc.id,
        status: "SIGNED",
        signedAt: new Date()
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);

// --- Data Room upload (client-side) ---------------------------------------

clientPortalRouter.post(
  "/documents/upload",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    try {
      await runUpload(req, res);
    } catch (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? `That file is too large. The limit is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
          : "Could not upload that file. Try again.";
      return res.redirect(`/api/client-portal/dashboard?docError=${encodeURIComponent(message)}`);
    }

    if (!req.file) {
      return res.redirect(`/api/client-portal/dashboard?docError=${encodeURIComponent("Choose a file to upload.")}`);
    }

    // Only one of the real checklist items — a client can't invent a
    // category the Data Room stage isn't actually asking for, since
    // deriveDataRoomStage's completion % only counts these labels anyway.
    const category = REQUIRED_DOCUMENT_LABELS.includes(req.body?.category) ? req.body.category : null;
    if (!category) {
      return res.redirect(`/api/client-portal/dashboard?docError=${encodeURIComponent("Choose which document this is from the list.")}`);
    }

    const filePath = path.join(UPLOAD_DIR, req.file.filename);
    // Extraction failures are captured as a note rather than thrown — a
    // scanned PDF or a photo should still upload fine.
    const { text, note } = await extractText(filePath, req.file.mimetype, req.file.originalname);

    // Filed the same way a staff upload would be (see routes/documents.js)
    // so it shows up in the Data Room and is searchable by the AI
    // assistant like any other document — uploadedById is null because a
    // ClientUser isn't a staff User, the two identity systems don't cross.
    // leadId scopes it to this client's own deal (previously there was no
    // structured lead link at all — description was the only place WHO
    // uploaded it was recorded, which is how a different lead's upload
    // could silently count toward this lead's checklist).
    await prisma.document.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        category,
        description: `Uploaded by ${req.clientUser.name} (${req.clientUser.lead.company}) via the client portal`,
        extractedText: text,
        extractionNote: note,
        uploadedById: null,
        leadId: req.clientUser.leadId
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);
