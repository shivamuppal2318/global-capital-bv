import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyInterestToken } from "../lib/interestToken.js";
import { sendTemplateEmail } from "../lib/leadSender.js";
import { LOGO_DATA_URI } from "../lib/brandLogo.js";

export const interestedRouter = Router();

// One-click "I'm Interested" — see leadSender.js's interestButtonHtml,
// embedded in every cadence email. A click here is a much more reliable
// interest signal than classifyReply.js's keyword match against a
// free-text reply (which only fires if the lead happens to type a
// matching word), so it goes straight to the same next step a matching
// reply would trigger: the real Calendly-scheduling email.
function requireValidToken(req, res, next) {
  if (!verifyInterestToken(req.params.leadId, req.params.token)) {
    return res.status(403).send(pageShell(noticeCard({
      icon: "!",
      iconBg: "#fdeceb",
      iconColor: "#e0483f",
      title: "Invalid link",
      body: "This link is invalid or has expired."
    })));
  }
  next();
}

function pageShell(body) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Global Capital BV</title>
  </head>
  <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f7f9fc;padding:48px 20px;margin:0;color:#12213a;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <div style="width:44px;height:44px;border-radius:16px;background:#ebf6ef;display:flex;align-items:center;justify-content:center;">
          <img src="${LOGO_DATA_URI}" alt="Global Capital BV" style="width:32px;height:32px;object-fit:contain;" />
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

function noticeCard({ icon, iconBg, iconColor, title, body }) {
  return `
    <div style="text-align:center;padding:12px 0;">
      <div style="width:56px;height:56px;border-radius:999px;background:${iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:26px;color:${iconColor};">${icon}</div>
      <h1 style="font-size:20px;font-weight:600;color:#102246;margin:0 0 12px;">${title}</h1>
      <div style="font-size:14px;line-height:1.7;color:#4f6181;">${body}</div>
    </div>`;
}

interestedRouter.get("/:leadId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const lead = await prisma.emailLead.findUnique({ where: { id: req.params.leadId } });
  if (!lead) {
    return res.status(404).send(pageShell(noticeCard({
      icon: "!",
      iconBg: "#fdeceb",
      iconColor: "#e0483f",
      title: "Unknown recipient",
      body: "This link doesn't match any lead on file."
    })));
  }

  if (lead.unsubscribed) {
    return res.send(pageShell(noticeCard({
      icon: "i",
      iconBg: "#eef2ff",
      iconColor: "#3046b2",
      title: "Already unsubscribed",
      body: "This address has opted out of emails from us, so we can't follow up automatically. Reach out to us directly if you'd still like to talk."
    })));
  }

  await prisma.emailActivityLog.create({
    data: { leadId: lead.id, kind: "LINK_CLICKED", title: "Clicked \"I'm Interested\"", detail: "Marked as interested via the one-click button." }
  });

  // Doesn't overwrite a reply-type that's already further along (e.g. they
  // separately emailed back asking about the NDA) — only fills in the gap
  // for a lead who hasn't replied by any other channel yet.
  if (lead.replyType === "NO_REPLY") {
    await prisma.emailLead.update({ where: { id: lead.id }, data: { replyType: "INTERESTED" } });
  }

  // Same non-fatal pattern as autoRespond.js — a suppressed/capped send
  // shouldn't turn a real click into a broken page; the click itself is
  // still worth recording even if the follow-up email couldn't go out.
  let sendFailed = false;
  try {
    await sendTemplateEmail(lead.id, "zoom-request");
  } catch (err) {
    sendFailed = true;
    console.error(`[interested] follow-up send failed for lead ${lead.id}:`, err.message);
  }

  res.send(pageShell(noticeCard({
    icon: "✓",
    iconBg: "#dff5e7",
    iconColor: "#2b9b60",
    title: "Thanks for letting us know",
    body: sendFailed
      ? "We've noted your interest — someone from our team will follow up with you directly."
      : "A scheduling link just went out to your inbox so we can find time for a quick intro call."
  })));
}));
