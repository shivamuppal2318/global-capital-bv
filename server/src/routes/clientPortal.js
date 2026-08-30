import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword, verifyPassword, signClientToken } from "../lib/auth.js";
import { verifyClientInviteToken } from "../lib/clientPortalToken.js";
import { requireClientAuth, setClientSessionCookie, clearClientSessionCookie } from "../middleware/requireClientAuth.js";
import { authShell, dashboardShell, formField, primaryButton, errorBanner, noteText, escapeHtml } from "../lib/clientPortalPage.js";
import { buildPortalStages } from "../lib/clientPortalStages.js";
import { REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";

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
        ${noteText("Received an invite email? Use the link in that email to set up your account first.")}
      </div>
    `
  });
}

clientPortalRouter.get("/login", (_req, res) => res.send(loginFormHtml()));

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

clientPortalRouter.post(
  "/login",
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

// The NDA row is the only stage a client can act on directly — it's the
// gate everything else waits behind, and the same typed-name-plus-checkbox
// "clickwrap" the old cold-email NDA link used (see routes/nda.js), just
// reached through the portal instead of a one-off signing link.
function ndaSignFormHtml({ error, doeName } = {}) {
  return `
    <div class="gc-sign-box">
      ${doeName ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">Your Global Capital BV contact: <strong style="color:#334463;">${escapeHtml(doeName)}</strong></p>` : ""}
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}
      <form method="POST" action="/api/client-portal/nda/sign">
        <label class="gc-field" style="margin-bottom:12px;">
          <span class="gc-label">Type your full name to sign</span>
          <input name="fullName" required class="gc-input" />
        </label>
        <label class="gc-checkbox-row">
          <input type="checkbox" name="agree" required />
          I have read and agree to the terms of this NDA
        </label>
        <button type="submit" class="gc-btn-primary" style="width:auto;padding:10px 22px;border-radius:12px;">Accept &amp; sign</button>
      </form>
    </div>`;
}

clientPortalRouter.get(
  "/dashboard",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;

    const [nda, meetings, ioi, visits, fieldVisit, termSheet, documentCategories] = await Promise.all([
      prisma.ndaRecord.findUnique({ where: { leadId } }),
      prisma.meeting.findMany({ where: { leadId } }),
      prisma.ioiRecord.findUnique({ where: { leadId } }),
      prisma.visitPlan.findMany({ where: { leadId } }),
      prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "FIELD_VISIT" } } }),
      prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "TERM_SHEET" } } }),
      prisma.document.findMany({ select: { category: true }, distinct: ["category"] })
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

    const completedCount = stages.filter((s) => s.status === "completed").length;

    // Only SENT/REMINDER_1/REMINDER_2 are actually awaiting the client's
    // signature — DRAFT hasn't reached them yet, and SIGNED/DECLINED/
    // EXPIRED are already resolved, so the form only appears in the one
    // state where signing is a real, available action.
    const ndaSignable = nda && ["SENT", "REMINDER_1", "REMINDER_2"].includes(nda.status);
    const ndaError = req.query.ndaError ? String(req.query.ndaError) : null;

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

    const sidebarStages = stages.map((s) => ({
      key: s.key,
      label: s.label,
      dotColor: s.status === "not_started" ? "#5c6b9a" : STATUS_STYLE[s.status].fg
    }));

    res.send(
      dashboardShell({
        title: "Your deal",
        clientName: req.clientUser.name,
        companyName: req.clientUser.lead.company,
        stages: sidebarStages,
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
                .map((s) =>
                  stageRowHtml(s, s.key === "nda" && ndaSignable ? ndaSignFormHtml({ error: ndaError, doeName: nda.owner }) : "")
                )
                .join("")}
            </div>
          </div>
        `
      })
    );
  })
);

// --- NDA signing (client-side) ---------------------------------------

const ndaSignSchema = z.object({ fullName: z.string().trim().min(1), agree: z.string().min(1) });

clientPortalRouter.post(
  "/nda/sign",
  requireClientAuth,
  asyncHandler(async (req, res) => {
    const leadId = req.clientUser.leadId;
    const parsed = ndaSignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("Enter your name and confirm you agree to the terms.")}`);
    }

    const nda = await prisma.ndaRecord.findUnique({ where: { leadId } });
    // Re-checked server-side, not just hidden by the dashboard's own
    // conditional rendering — someone could POST here directly after the
    // NDA had already moved to SIGNED/DECLINED/EXPIRED in the meantime.
    if (!nda || !["SENT", "REMINDER_1", "REMINDER_2"].includes(nda.status)) {
      return res.redirect(`/api/client-portal/dashboard?ndaError=${encodeURIComponent("This NDA isn't awaiting a signature right now.")}`);
    }

    await prisma.ndaRecord.update({
      where: { leadId },
      data: { status: "SIGNED", signedAt: new Date(), signerName: parsed.data.fullName, signerEmail: req.clientUser.email }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);
