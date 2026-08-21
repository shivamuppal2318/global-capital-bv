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
