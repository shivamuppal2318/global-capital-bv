import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword, verifyPassword, signClientToken } from "../lib/auth.js";
import { verifyClientInviteToken } from "../lib/clientPortalToken.js";
import { requireClientAuth, setClientSessionCookie, clearClientSessionCookie } from "../middleware/requireClientAuth.js";
import { authShell, dashboardShell, formField, primaryButton, errorBanner, noteText, escapeHtml } from "../lib/clientPortalPage.js";
import { buildPortalStages, PORTAL_STAGES } from "../lib/clientPortalStages.js";
import { REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";
import { extractText } from "../lib/documentText.js";
import { upload, UPLOAD_DIR, MAX_FILE_BYTES } from "../lib/fileUpload.js";

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
// gate everything else waits behind. Two ways to clear it: accept in the
// portal using the identity they're already authenticated as (no re-typed
// name — that's what the old cold-email NDA link needed, but this client
// is already signed in), or upload their own signed copy, which counts as
// acceptance in its own right and is kept as the record.
function ndaSignFormHtml({ error, doeName, alreadySigned } = {}) {
  return `
    <div class="gc-sign-box">
      ${doeName ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">Your Global Capital BV contact: <strong style="color:#334463;">${escapeHtml(doeName)}</strong></p>` : ""}
      ${
        alreadySigned
          ? `<p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">You've already accepted this NDA. You can still upload a copy for your own records, or accept again if needed.</p>`
          : ""
      }
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;">
        <form method="POST" action="/api/client-portal/nda/sign" style="margin:0;">
          <label class="gc-checkbox-row">
            <input type="checkbox" name="agree" required />
            I have read and agree to the terms of this NDA
          </label>
          <button type="submit" class="gc-btn-primary" style="width:auto;padding:10px 22px;border-radius:12px;">I Am Accept It</button>
        </form>
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
    </div>`;
}

// The Data Room stage's real upload form — previously this stage's page
// showed only "X of Y documents received" with no way for the client to
// actually send one. Same shared Document model and upload pipeline as a
// staff upload (see routes/documents.js) and the NDA upload above; the
// category picker is the same REQUIRED_DOCUMENT_LABELS checklist the
// received-count itself is computed from, so a client can only tag an
// upload as one of the things actually being asked for.
function dataRoomUploadFormHtml({ error, uploadedCategories }) {
  const options = REQUIRED_DOCUMENTS.map(
    (doc) =>
      `<option value="${escapeHtml(doc.label)}">${uploadedCategories.has(doc.label) ? "✓ " : ""}${escapeHtml(doc.label)}</option>`
  ).join("");

  return `
    <div class="gc-sign-box">
      <p style="margin:0 0 12px;font-size:13px;color:#5c6b87;">
        Upload a document for one of the items on our request list. Already-received items are marked with a check —
        uploading again replaces it with your new file.
      </p>
      ${error ? `<p class="gc-error" style="margin-bottom:12px;">${escapeHtml(error)}</p>` : ""}
      <form method="POST" action="/api/client-portal/documents/upload" enctype="multipart/form-data" style="margin:0;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;">
        <select name="category" required class="gc-input" style="width:auto;min-width:220px;">
          ${options}
        </select>
        <label class="gc-btn-secondary">
          Choose file to upload
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

  return { nda, stages, uploadedCategories };
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
    const { nda, stages, uploadedCategories } = await loadPortalData(leadId);

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
                    extraHtml = ndaSignFormHtml({ error: ndaError, doeName: nda.owner, alreadySigned: nda.status === "SIGNED" });
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
    const { nda, stages, uploadedCategories } = await loadPortalData(leadId);
    const stage = stages.find((s) => s.key === stageMeta.key);

    const ndaActionable = nda && Boolean(nda.sentAt) && !["DECLINED", "EXPIRED"].includes(nda.status);
    const ndaError = req.query.ndaError ? String(req.query.ndaError) : null;
    const docError = req.query.docError ? String(req.query.docError) : null;

    let stageExtraHtml = "";
    if (stage.key === "nda" && ndaActionable) {
      stageExtraHtml = ndaSignFormHtml({ error: ndaError, doeName: nda.owner, alreadySigned: nda.status === "SIGNED" });
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
        uploadedById: null
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
    // The description is the only place this records WHO uploaded it (see
    // schema note on the Document model — there's no per-lead relation),
    // same convention the NDA upload above already uses.
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
        uploadedById: null
      }
    });

    res.redirect("/api/client-portal/dashboard");
  })
);
