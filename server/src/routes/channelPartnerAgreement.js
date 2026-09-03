import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyChannelPartnerToken } from "../lib/channelPartnerSignToken.js";
import { hashPassword } from "../lib/auth.js";
import { channelPartnerAgreementFillFormFragment } from "../lib/signedDocumentRenderer.js";

export const channelPartnerAgreementRouter = Router();

// Same limitation as routes/nda.js's clickwrap flow: typed name + checkbox +
// IP + timestamp, not a certified e-signature (no identity verification, no
// signing certificate). Good enough to record that whoever held this link
// asserted agreement; not a substitute for a real e-signature vendor if this
// needs to hold up as a certified signature in a dispute.
function requireValidToken(req, res, next) {
  if (!verifyChannelPartnerToken(req.params.partnerId, req.params.token)) {
    return res.status(403).send("<p>Invalid or expired agreement link.</p>");
  }
  next();
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Matches the real app's own branding (LoginPage.jsx's split-screen shell:
// green circle badge + "Global Capital BV", #1b295f accents) — this page is
// a channel partner's first real contact with the product, before they've
// ever seen the SPA itself, so it shouldn't look like a bare unstyled form.
function pageShell(body) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Channel Partner Agreement</title>
    <style>
      /* Same interactive-document classes as clientPortalPage.js's NDA/IOI
         fill-in-details flow (lib/signedDocumentRenderer.js's renderInteractiveBody) —
         duplicated here since this page has its own standalone shell, not
         the client portal's. */
      .gc-doc-frame { border: 1px solid #d6deea; border-radius: 14px; background: #fffefb; box-shadow: inset 0 1px 0 #fff; margin-bottom: 16px; overflow: hidden; }
      .gc-doc-scroll { max-height: 420px; overflow-y: auto; padding: 22px 24px; font-family: Georgia, "Times New Roman", serif; color: #16213e; line-height: 1.6; }
      .gc-doc-scroll p { margin: 0 0 12px; font-size: 13px; text-align: justify; }
      .gc-doc-scroll ul { margin: 0 0 12px; padding-left: 20px; }
      .gc-doc-scroll li { font-size: 13px; margin-bottom: 5px; }
      .gc-doc-signature { margin-top: 20px; padding-top: 16px; border-top: 1px dashed #d6deea; }
      .gc-doc-input { font: inherit; font-size: 13px; color: #102246; border: none; border-bottom: 1.5px solid #3046b2; background: #eef1ff; padding: 1px 5px; outline: none; min-width: 120px; border-radius: 3px 3px 0 0; }
      .gc-doc-input:focus { background: #dfe5ff; }
      .gc-doc-input:invalid { border-bottom-color: #e0483f; }
      .gc-doc-mirror { font-weight: 600; color: #21439b; border-bottom: 1px dotted #b7c2dd; }
    </style>
  </head>
  <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f9fc;padding:48px 20px;margin:0;color:#12213a;">
    <div style="max-width:760px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <div style="width:44px;height:44px;border-radius:16px;background:#ebf6ef;display:flex;align-items:center;justify-content:center;">
          <div style="width:28px;height:28px;border-radius:999px;background:#ffffff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#2b9b60;">GC</div>
        </div>
        <p style="font-size:14px;font-weight:600;color:#102246;margin:0;">Global Capital BV</p>
      </div>
      <div style="background:#ffffff;border:1px solid #e7edf5;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(30,48,87,0.06);">
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

// A short, centered confirmation card (success, already-signed, or an
// error) — distinct from the wide agreement/form layout above, since these
// have no long document or fields to fit.
function noticeCard({ icon, iconBg, iconColor, title, body }) {
  return `
    <div style="text-align:center;padding:12px 0;">
      <div style="width:56px;height:56px;border-radius:999px;background:${iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:26px;color:${iconColor};">${icon}</div>
      <h1 style="font-size:20px;font-weight:600;color:#102246;margin:0 0 12px;">${title}</h1>
      <div style="font-size:14px;line-height:1.7;color:#4f6181;">${body}</div>
    </div>`;
}

function unknownRecipientNotice() {
  return pageShell(
    noticeCard({
      icon: "!",
      iconBg: "#fdeceb",
      iconColor: "#e0483f",
      title: "Unknown recipient",
      body: "This link doesn't match any channel partner on file. Ask whoever sent it for a fresh link."
    })
  );
}

// The link an admin generates and sends from ChannelPartnerModule.jsx (see
// POST /api/channel-partners/:id/agreement-link).
channelPartnerAgreementRouter.get("/:partnerId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.partnerId } });
  if (!partner) {
    return res.status(404).send(unknownRecipientNotice());
  }

  if (partner.agreementSignedAt) {
    return res.send(
      pageShell(
        noticeCard({
          icon: "✓",
          iconBg: "#dff5e7",
          iconColor: "#2b9b60",
          title: "Already signed",
          body: `This Channel Partner Agreement was already signed by <strong>${escapeHtml(partner.agreementSignedName)}</strong> on ${partner.agreementSignedAt.toDateString()}. No further action is needed.`
        })
      )
    );
  }

  const agreementDocHtml = await channelPartnerAgreementFillFormFragment(partner);

  const signError = req.query.error ? String(req.query.error) : null;

  const inputStyle =
    "display:block;margin-top:6px;width:100%;padding:10px 12px;border:1px solid #d6deea;border-radius:10px;box-sizing:border-box;font-size:14px;color:#102246;font-family:inherit;";
  const labelStyle = "display:block;margin:0 0 14px;font-size:13px;font-weight:600;color:#334463;";

  res.send(
    pageShell(`
      <span style="display:inline-block;background:#eef2ff;color:#3046b2;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Channel Partner Agreement</span>
      <h1 style="font-size:24px;font-weight:600;color:#102246;margin:14px 0 4px;letter-spacing:-0.01em;">${escapeHtml(partner.name)}</h1>
      <p style="font-size:13px;color:#8592ab;margin:0 0 20px;">Fill in the highlighted blanks directly in the agreement below, then sign it and set up your portal login.</p>

      <form method="POST">
        ${agreementDocHtml}

        ${signError ? `<p style="background:#fdeceb;color:#e0483f;font-size:13px;font-weight:500;padding:10px 14px;border-radius:10px;margin:0 0 16px;">${escapeHtml(signError)}</p>` : ""}

        <label style="${labelStyle}">
          Type your full name to sign
          <input name="fullName" required style="${inputStyle}font-weight:400;" />
        </label>
        <label style="display:flex;align-items:flex-start;gap:8px;margin:0 0 24px;font-size:13px;color:#4f6181;font-weight:400;">
          <input type="checkbox" name="agree" required style="margin-top:2px;" />
          I have read and agree to the terms of this Channel Partner Agreement
        </label>

        <div style="border-top:1px solid #e7edf5;padding-top:20px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#102246;">Set up your portal login</p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#8592ab;">
            Signing creates your Channel Partner Portal account, where you can add your own leads and run your own
            outreach campaigns.
          </p>
          <label style="${labelStyle}">
            Email
            <input type="email" name="email" required style="${inputStyle}font-weight:400;" placeholder="you@partner.com" />
          </label>
          <label style="${labelStyle.replace("margin:0 0 14px", "margin:0 0 24px")}">
            Password (at least 8 characters)
            <input type="password" name="password" required minlength="8" style="${inputStyle}font-weight:400;" placeholder="••••••••" />
          </label>
        </div>

        <button type="submit" style="width:100%;background:#1b295f;color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:15px;font-weight:600;cursor:pointer;">
          Sign Agreement &amp; Create Portal Account
        </button>
      </form>
    `)
  );
}));

const signSchema = z.object({
  fullName: z.string().min(1),
  agree: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  // Typed directly into the agreement's own blanks (see
  // channelPartnerAgreementFillFormFragment) rather than a separate form.
  partnerAddress: z.string().min(1),
  territory: z.string().min(1),
  paymentSchedule: z.string().min(1)
});

channelPartnerAgreementRouter.post("/:partnerId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues.some((i) => i.path[0] === "password")
      ? "Password must be at least 8 characters."
      : parsed.error.issues.some((i) => i.path[0] === "email")
        ? "Enter a valid email address."
        : ["partnerAddress", "territory", "paymentSchedule"].includes(parsed.error.issues[0]?.path[0])
          ? "Fill in every highlighted field in the agreement before signing."
          : "Please provide your name and agree to the terms.";
    return res.redirect(
      `/api/channel-partner-agreement/${req.params.partnerId}/${req.params.token}?error=${encodeURIComponent(message)}`
    );
  }

  const partner = await prisma.channelPartner.findUnique({ where: { id: req.params.partnerId } });
  if (!partner) {
    return res.status(404).send(unknownRecipientNotice());
  }
  if (partner.agreementSignedAt) {
    return res.send(
      pageShell(
        noticeCard({
          icon: "✓",
          iconBg: "#dff5e7",
          iconColor: "#2b9b60",
          title: "Already signed",
          body: "This Channel Partner Agreement has already been signed. No further action is needed."
        })
      )
    );
  }

  // A ChannelPartnerUser's email is globally unique (see schema.prisma) —
  // checked explicitly so a collision comes back as a normal form error
  // instead of a raw 500 from the create() below.
  const emailTaken = await prisma.channelPartnerUser.findUnique({ where: { email: parsed.data.email } });
  if (emailTaken) {
    return res.redirect(
      `/api/channel-partner-agreement/${req.params.partnerId}/${req.params.token}?error=${encodeURIComponent("That email is already registered to a portal account.")}`
    );
  }

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
  const signedAt = new Date();
  const passwordHash = await hashPassword(parsed.data.password);

  // Signing the agreement and creating the portal login happen together,
  // atomically — there's no separate invite-email step (see the plan's
  // Phase 1 scope note: no established "send a real email to a channel
  // partner contact" pathway exists yet), so this is the one moment a
  // ChannelPartnerUser can ever be created.
  await prisma.$transaction([
    prisma.channelPartner.update({
      where: { id: partner.id },
      data: {
        agreementSignedAt: signedAt,
        agreementSignedName: parsed.data.fullName,
        agreementSignedIp: ip,
        agreementAddress: parsed.data.partnerAddress,
        agreementPaymentSchedule: parsed.data.paymentSchedule,
        // region already means "Territory" everywhere else in the app —
        // the partner confirming (or correcting) it here, in the same
        // document that names it, is the real value, not a second field.
        region: parsed.data.territory
      }
    }),
    prisma.channelPartnerUser.create({
      data: { channelPartnerId: partner.id, name: parsed.data.fullName, email: parsed.data.email, passwordHash }
    })
  ]);

  res.send(
    pageShell(
      noticeCard({
        icon: "✓",
        iconBg: "#dff5e7",
        iconColor: "#2b9b60",
        title: "You're all set",
        body: `Thanks, ${escapeHtml(parsed.data.fullName)} — your Channel Partner Agreement has been recorded and your portal account is ready.
          <a href="/partner/login" style="display:inline-block;margin-top:20px;background:#1b295f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;">Log in to the Channel Partner Portal →</a>`
      })
    )
  );
}));
