import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword, verifyPassword, signClientToken } from "../lib/auth.js";
import { verifyClientInviteToken } from "../lib/clientPortalToken.js";
import { requireClientAuth, setClientSessionCookie, clearClientSessionCookie } from "../middleware/requireClientAuth.js";
import { portalShell, formField, primaryButton, errorBanner, noteText, escapeHtml } from "../lib/clientPortalPage.js";
import { buildPortalStages } from "../lib/clientPortalStages.js";
import { REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";

export const clientPortalRouter = Router();

// --- Registration ----------------------------------------------------------

function registerFormHtml({ lead, error, values = {} }) {
  return portalShell({
    title: "Set up your account",
    bodyHtml: `
      <h1 style="margin:0 0 6px;font-size:20px;color:#0f2042;">Set up your account</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#5c6b87;">For ${escapeHtml(lead.company)} — track your NDA, IOI and every step in between.</p>
      ${errorBanner(error)}
      <form method="POST">
        ${formField({ label: "Full name", name: "name", value: values.name ?? lead.name ?? "" })}
        ${formField({ label: "Email", name: "email", type: "email", value: values.email ?? lead.email ?? "" })}
        ${formField({ label: "Phone number", name: "phone", type: "tel", required: false, value: values.phone ?? "" })}
        ${formField({ label: "Password", name: "password", type: "password", placeholder: "At least 8 characters" })}
        ${formField({ label: "Confirm password", name: "confirmPassword", type: "password" })}
        ${primaryButton("Create account")}
      </form>
      ${noteText(`Already registered? <a href="/api/client-portal/login" style="color:#3046b2;">Sign in</a>`)}
    `
  });
}

clientPortalRouter.get(
  "/register/:token",
  asyncHandler(async (req, res) => {
    const leadId = verifyClientInviteToken(req.params.token);
    if (!leadId) {
      return res
        .status(410)
        .send(portalShell({ title: "Link expired", bodyHtml: `<p style="font-size:14px;color:#5c6b87;">This invite link is invalid or has expired. Ask your contact at Global Capital BV to send a new one.</p>` }));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { clientUser: true } });
    if (!lead) {
      return res.status(404).send(portalShell({ title: "Not found", bodyHtml: `<p style="font-size:14px;color:#5c6b87;">We couldn't find this invite.</p>` }));
    }
    if (lead.clientUser) {
      return res.send(
        portalShell({
          title: "Already registered",
          bodyHtml: `<p style="font-size:14px;color:#5c6b87;">An account already exists for ${escapeHtml(lead.company)}.</p>${noteText(`<a href="/api/client-portal/login" style="color:#3046b2;">Sign in instead</a>`)}`
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
      return res.status(410).send(portalShell({ title: "Link expired", bodyHtml: `<p style="font-size:14px;color:#5c6b87;">This invite link is invalid or has expired.</p>` }));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { clientUser: true } });
    if (!lead) return res.status(404).send(portalShell({ title: "Not found", bodyHtml: `<p>We couldn't find this invite.</p>` }));
    if (lead.clientUser) {
      return res.send(
        portalShell({ title: "Already registered", bodyHtml: `<p>An account already exists for ${escapeHtml(lead.company)}.</p>${noteText('<a href="/api/client-portal/login" style="color:#3046b2;">Sign in instead</a>')}` })
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
  return portalShell({
    title: "Sign in",
    bodyHtml: `
      <h1 style="margin:0 0 6px;font-size:20px;color:#0f2042;">Sign in</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#5c6b87;">Track your deal's progress with Global Capital BV.</p>
      ${errorBanner(error)}
      <form method="POST">
        ${formField({ label: "Email", name: "email", type: "email" })}
        ${formField({ label: "Password", name: "password", type: "password" })}
        ${primaryButton("Sign in")}
      </form>
      ${noteText("Received an invite email? Use the link in that email to set up your account first.")}
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

const STATUS_STYLE = {
  completed: { bg: "#dff5e7", fg: "#2a9c60", label: "Completed" },
  in_progress: { bg: "#fff4e0", fg: "#c47f1a", label: "In progress" },
  declined: { bg: "#fdecea", fg: "#e0483f", label: "Declined" },
  not_started: { bg: "#eef1f6", fg: "#748096", label: "Not started" }
};

function stageRowHtml(stage, isLast, extraHtml = "") {
  const style = STATUS_STYLE[stage.status];
  return `
    <div style="display:flex;gap:16px;padding:18px 0;${isLast ? "" : "border-bottom:1px solid #eef1f6;"}">
      <div style="width:14px;height:14px;border-radius:50%;margin-top:4px;flex-shrink:0;background:${stage.status === "not_started" ? "#d6deea" : style.fg};"></div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span style="font-size:15px;font-weight:600;color:#102246;">${escapeHtml(stage.label)}</span>
          <span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:${style.bg};color:${style.fg};white-space:nowrap;">${style.label}</span>
        </div>
        <p style="margin:4px 0 0;font-size:13px;color:#5c6b87;">${escapeHtml(stage.detail)}</p>
        ${extraHtml}
      </div>
    </div>`;
}

// The NDA row is the only stage a client can act on directly — it's the
// gate everything else waits behind, and the same typed-name-plus-checkbox
// "clickwrap" the old cold-email NDA link used (see routes/nda.js), just
// reached through the portal instead of a one-off signing link.
function ndaSignFormHtml({ error, doeName } = {}) {
  return `
    <div style="margin-top:14px;padding:16px;background:#fbfcfe;border:1px solid #e7edf5;border-radius:14px;">
      ${doeName ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">Your Global Capital BV contact: <strong style="color:#334463;">${escapeHtml(doeName)}</strong></p>` : ""}
      ${error ? `<p style="margin:0 0 12px;padding:10px 14px;background:#fdecea;color:#e0483f;border-radius:10px;font-size:13px;">${escapeHtml(error)}</p>` : ""}
      <form method="POST" action="/api/client-portal/nda/sign">
        <label style="display:block;margin:0 0 12px;">
          <span style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#334463;">Type your full name to sign</span>
          <input name="fullName" required style="display:block;width:100%;padding:10px 14px;border:1px solid #d6deea;border-radius:10px;font-size:14px;color:#102246;box-sizing:border-box;outline:none;" />
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;color:#334463;">
          <input type="checkbox" name="agree" required />
          I have read and agree to the terms of this NDA
        </label>
        <button type="submit" style="background:#3046b2;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">Accept &amp; sign</button>
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

    res.send(
      portalShell({
        title: "Your deal",
        wide: true,
        bodyHtml: `
          <div style="display:flex;align-items:start;justify-content:space-between;gap:16px;margin-bottom:8px;">
            <div>
              <h1 style="margin:0 0 4px;font-size:22px;color:#0f2042;">${escapeHtml(req.clientUser.lead.company)}</h1>
              <p style="margin:0;font-size:14px;color:#5c6b87;">Welcome back, ${escapeHtml(req.clientUser.name)}</p>
            </div>
            <a href="/api/client-portal/logout" style="font-size:13px;color:#8592ab;text-decoration:none;white-space:nowrap;">Sign out</a>
          </div>
          <p style="margin:0 0 24px;font-size:13px;color:#8592ab;">${completedCount} of ${stages.length} steps completed</p>
          <div>
            ${stages
              .map((s, i) =>
                stageRowHtml(
                  s,
                  i === stages.length - 1,
                  s.key === "nda" && ndaSignable ? ndaSignFormHtml({ error: ndaError, doeName: nda.owner }) : ""
                )
              )
              .join("")}
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
