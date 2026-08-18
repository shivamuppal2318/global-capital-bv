import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyNdaToken } from "../lib/ndaSignToken.js";

export const ndaRouter = Router();

// IMPORTANT LIMITATION: this is a lightweight "clickwrap" signature —
// typed name + checkbox + IP + timestamp, the same mechanism as "I agree
// to the Terms of Service." It is NOT a certified e-signature the way
// DocuSign/HelloSign/PandaDoc produce one (no identity verification, no
// cryptographic signing certificate, no audit-grade tamper-evidence). Good
// enough to record that someone with access to the link asserted
// agreement; not a substitute for a real e-signature vendor if the NDA
// needs to hold up as a certified signature in a dispute. Swapping in a
// real provider later means replacing this route's GET/POST pair with
// that provider's embedded-signing flow — the rest of the pipeline
// (unsubscribeUrl-style signed link, lead lookup, activity logging)
// carries over unchanged.
function requireValidToken(req, res, next) {
  if (!verifyNdaToken(req.params.leadId, req.params.token)) {
    return res.status(403).send("<p>Invalid or expired NDA link.</p>");
  }
  next();
}

const NDA_BOILERPLATE = `This Mutual Non-Disclosure Agreement is a placeholder for demonstration purposes.
Replace this text with your actual NDA language before using this flow for a real transaction.

By signing below, the undersigned agrees to keep confidential all information shared in
connection with this potential transaction, and not to disclose it to third parties without
prior written consent.`;

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pageShell(body) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>NDA</title></head>
  <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f7fb;padding:40px;margin:0;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${body}
    </div>
  </body>
</html>`;
}

// The link a lead clicks from the "interested" auto-response email.
ndaRouter.get("/:leadId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
  if (!lead) {
    return res.status(404).send(pageShell("<p>Unknown recipient.</p>"));
  }

  if (lead.ndaSignedAt) {
    return res.send(
      pageShell(
        `<p>This NDA was already signed by ${escapeHtml(lead.ndaSignedName)} on ${lead.ndaSignedAt.toDateString()}. No further action is needed.</p>`
      )
    );
  }

  res.send(
    pageShell(`
      <h1 style="font-size:18px;">Mutual NDA — ${escapeHtml(lead.company)}</h1>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;color:#435471;background:#f8faff;border-radius:8px;padding:16px;">${escapeHtml(NDA_BOILERPLATE)}</pre>
      <form method="POST">
        <label style="display:block;margin:16px 0 8px;font-size:14px;">
          Type your full name to sign:
          <input name="fullName" required style="display:block;margin-top:4px;width:100%;padding:8px;border:1px solid #d6deea;border-radius:8px;box-sizing:border-box;" />
        </label>
        <label style="display:block;margin:16px 0;font-size:14px;">
          <input type="checkbox" name="agree" required /> I have read and agree to the terms above
        </label>
        <button type="submit" style="background:#3046b2;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;">
          Sign NDA
        </button>
      </form>
    `)
  );
}));

const signSchema = z.object({
  fullName: z.string().min(1),
  agree: z.string().min(1)
});

ndaRouter.post("/:leadId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).send(pageShell("<p>Please provide your name and agree to the terms.</p>"));
  }

  const lead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
  if (!lead) {
    return res.status(404).send(pageShell("<p>Unknown recipient.</p>"));
  }
  if (lead.ndaSignedAt) {
    return res.send(pageShell("<p>This NDA has already been signed.</p>"));
  }

  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
  const signedAt = new Date();

  await prisma.lead.update({
    where: { id: lead.id },
    data: { ndaSignedAt: signedAt, ndaSignedName: parsed.data.fullName, ndaSignedIp: ip, stage: "NDA Signed" }
  });

  await prisma.activityLog.create({
    data: {
      leadId: lead.id,
      kind: "NDA_SIGNED",
      title: "NDA signed",
      detail: `Signed by "${parsed.data.fullName}" from ${ip} at ${signedAt.toISOString()}.`
    }
  });

  res.send(pageShell(`<p>Thanks, ${escapeHtml(parsed.data.fullName)} — your NDA has been recorded. Our team will be in touch with next steps.</p>`));
}));
