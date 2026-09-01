import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { decryptSecret } from "./credentialCrypto.js";

// Transactional mail the app sends about itself (password resets, new
// account handoffs) — separate from the campaign mailboxes in
// EmailAccount, which are per-salesperson and get paused/rotated. A
// password reset must not stop working because someone paused their
// outreach mailbox.

export function getSystemEmailSettings() {
  return prisma.systemEmailSettings.findFirst();
}

function buildTransport(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUser, pass: decryptSecret(settings.smtpPassEncrypted) }
  });
}

// Connects and authenticates without sending anything.
export async function verifySystemEmail(settings) {
  try {
    await buildTransport(settings).verify();
    return { success: true, message: "Connected — SMTP credentials are valid." };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Returns { sent: false, reason } rather than throwing when no system
// mailbox is configured yet, so callers (e.g. creating an employee) can
// carry on and report "account created, but no email sent" instead of
// failing the whole operation.
export async function sendSystemEmail({ to, subject, html, text }) {
  const settings = await getSystemEmailSettings();
  if (!settings) {
    return { sent: false, reason: "No system email (SMTP) is configured in Admin Panel → System Email." };
  }

  try {
    const info = await buildTransport(settings).sendMail({
      from: `"${settings.fromName}" <${settings.fromAddress}>`,
      to,
      subject,
      text,
      html
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

const shell = (title, bodyHtml) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f7fb;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d6deea;border-radius:16px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#102246">${title}</h1>
    ${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#8592ab">Global Capital BV · Investment OS</p>
  </div>
</div>`;

export function passwordResetEmail({ name, resetUrl, expiresMinutes }) {
  return {
    subject: "Reset your Global Capital BV password",
    text: `Hi ${name},\n\nReset your password using this link (valid for ${expiresMinutes} minutes):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password stays unchanged.`,
    html: shell(
      "Reset your password",
      `<p style="font-size:15px;color:#334463;line-height:1.6">Hi ${name},</p>
       <p style="font-size:15px;color:#334463;line-height:1.6">Click below to choose a new password. This link is valid for <strong>${expiresMinutes} minutes</strong> and can only be used once.</p>
       <p style="margin:24px 0"><a href="${resetUrl}" style="background:#3046b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;display:inline-block">Reset password</a></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">Didn't request this? Ignore this email — your password stays unchanged.</p>`
    )
  };
}

export function welcomeEmail({ name, email, temporaryPassword, appUrl }) {
  return {
    subject: "Your Global Capital BV account",
    text: `Hi ${name},\n\nAn account has been created for you.\n\nSign in: ${appUrl}\nEmail: ${email}\nTemporary password: ${temporaryPassword}\n\nPlease change your password after your first sign-in (Admin Panel → My Account).`,
    html: shell(
      "Your account is ready",
      `<p style="font-size:15px;color:#334463;line-height:1.6">Hi ${name}, an account has been created for you.</p>
       <table style="font-size:15px;color:#334463;border-collapse:collapse;margin:18px 0">
         <tr><td style="padding:6px 16px 6px 0;color:#8592ab">Email</td><td><strong>${email}</strong></td></tr>
         <tr><td style="padding:6px 16px 6px 0;color:#8592ab">Password</td><td><strong style="font-family:ui-monospace,Menlo,Consolas,monospace">${temporaryPassword}</strong></td></tr>
       </table>
       <p style="margin:24px 0"><a href="${appUrl}" style="background:#3046b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;display:inline-block">Sign in</a></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">Please change this temporary password after your first sign-in, under Admin Panel → My Account.</p>`
    )
  };
}

export function zoomMeetingInviteEmail({ contactName, company, topic, startTime, durationMinutes, joinUrl, hostName }) {
  const when = new Date(startTime).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
  return {
    subject: `Zoom call scheduled — ${topic}`,
    text: `Hi ${contactName},\n\n${hostName} has scheduled a Zoom call with you.\n\nTopic: ${topic}\nWhen: ${when}\nDuration: ${durationMinutes} minutes\n\nJoin: ${joinUrl}`,
    html: shell(
      "Zoom call scheduled",
      `<p style="font-size:15px;color:#334463;line-height:1.6">Hi ${contactName},</p>
       <p style="font-size:15px;color:#334463;line-height:1.6">${hostName} has scheduled a Zoom call with you${company ? ` regarding ${company}` : ""}.</p>
       <table style="font-size:15px;color:#334463;border-collapse:collapse;margin:18px 0">
         <tr><td style="padding:6px 16px 6px 0;color:#8592ab">Topic</td><td><strong>${topic}</strong></td></tr>
         <tr><td style="padding:6px 16px 6px 0;color:#8592ab">When</td><td><strong>${when}</strong></td></tr>
         <tr><td style="padding:6px 16px 6px 0;color:#8592ab">Duration</td><td><strong>${durationMinutes} minutes</strong></td></tr>
       </table>
       <p style="margin:24px 0"><a href="${joinUrl}" style="background:#3046b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;display:inline-block">Join Zoom call</a></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${joinUrl}</span></p>`
    )
  };
}

export function clientPortalInviteEmail({ contactName, company, registerUrl }) {
  return {
    subject: `${company} — set up your Global Capital BV client portal`,
    text: `Hi ${contactName},\n\nYou can track the status of this deal — NDA, IOI and every other step — from your own portal.\n\nSet up your account: ${registerUrl}\n\nThis link is valid for 30 days.`,
    html: shell(
      "Track your deal, step by step",
      `<p style="font-size:15px;color:#334463;line-height:1.6">Hi ${contactName},</p>
       <p style="font-size:15px;color:#334463;line-height:1.6">You can follow ${company}'s progress with us directly — NDA, calls, the data room, IOI and every step after it — from your own client portal.</p>
       <p style="margin:24px 0"><a href="${registerUrl}" style="background:#3046b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;display:inline-block">Set up your account</a></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">This link is valid for 30 days. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${registerUrl}</span></p>`
    )
  };
}

// isNewAccount picks the button's destination and wording — a client who
// already has a portal account gets sent to sign in, not asked to
// register again; one who doesn't gets an invite link that lands them on
// registration first, then the NDA once they're in.
export function ndaReadyToSignEmail({ contactName, company, doeName, portalUrl, isNewAccount }) {
  const contactLine = doeName ? `Your Global Capital BV contact, <strong>${doeName}</strong>, has` : "We've";
  return {
    subject: `${company} — NDA ready for signature`,
    text: `Hi ${contactName},\n\n${doeName ? `Your Global Capital BV contact, ${doeName}, has` : "We've"} sent over an NDA for ${company} to review and sign.\n\n${isNewAccount ? "Set up your client portal account, then sign it there:" : "Sign in to your client portal to review and sign it:"}\n${portalUrl}`,
    html: shell(
      "NDA ready for your signature",
      `<p style="font-size:15px;color:#334463;line-height:1.6">Hi ${contactName},</p>
       <p style="font-size:15px;color:#334463;line-height:1.6">${contactLine} sent over an NDA for ${company} to review and sign.</p>
       <p style="margin:24px 0"><a href="${portalUrl}" style="background:#3046b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;display:inline-block">${isNewAccount ? "Set up your account & sign" : "Sign in to sign"}</a></p>
       <p style="font-size:13px;color:#8592ab;line-height:1.6">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${portalUrl}</span></p>`
    )
  };
}
