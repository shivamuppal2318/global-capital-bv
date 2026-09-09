import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyUnsubscribeToken } from "../lib/unsubscribeToken.js";

export const unsubscribeRouter = Router();

async function suppress(leadId) {
  const lead = await prisma.emailLead.update({
    where: { id: leadId },
    data: { unsubscribed: true }
  }).catch(() => null);

  if (lead) {
    await prisma.emailActivityLog.create({
      data: {
        leadId: lead.id,
        kind: "MANUAL_NOTE",
        title: "Unsubscribed",
        detail: `${lead.name} opted out via the email unsubscribe link.`
      }
    });
  }

  return lead;
}

// The link carries an HMAC token (see src/lib/unsubscribeToken.js) tied to
// the lead id, so it can't be forged or enumerated — a bare id in the URL
// would let anyone unsubscribe an arbitrary lead just by guessing/iterating
// ids. No auth beyond the token itself: this is a link a lead's mail client
// hits directly, there's no session to authenticate against.
function requireValidToken(req, res, next) {
  if (!verifyUnsubscribeToken(req.params.leadId, req.params.token)) {
    return res.status(403).send("Invalid or expired unsubscribe link.");
  }
  next();
}

// The link a human clicks from an email client. Shows a confirmation page.
unsubscribeRouter.get("/:leadId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const lead = await suppress(req.params.leadId);
  if (!lead) {
    return res.status(404).send("<p>Unknown recipient.</p>");
  }
  res.send(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;">
    <p>You've been unsubscribed and won't receive further emails from this campaign.</p>
  </body></html>`);
}));

// RFC 8058 one-click unsubscribe: mail clients that support List-Unsubscribe
// + List-Unsubscribe-Post (Gmail, Yahoo, Outlook) submit this POST
// automatically when the user hits "Unsubscribe" in their inbox UI — no
// page load, no confirmation click. Same target URL as the GET above, per
// spec. Returns plain 200, no HTML page needed for an automated request.
unsubscribeRouter.post("/:leadId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const lead = await suppress(req.params.leadId);
  res.status(lead ? 200 : 404).end();
}));
