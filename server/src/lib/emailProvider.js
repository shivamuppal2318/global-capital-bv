import nodemailer from "nodemailer";
import { decryptSecret } from "./credentialCrypto.js";

// Common interface every provider implements:
//   send({ to, subject, body, html?, unsubscribeUrl? }) -> Promise<{ providerMessageId: string }>
// `html` is optional on the interface itself (a caller can send plain text
// only), but src/lib/renderTemplate.js always produces one so real sends
// through the routes carry branding + an unsubscribe link. `unsubscribeUrl`,
// when present, gets attached as a List-Unsubscribe header (RFC 8058) —
// Gmail and Yahoo have required this since Feb 2024 for any sender doing
// >5000 msgs/day to them, and it materially helps inbox placement even
// below that threshold since its absence is itself a spam signal.
//
// Swap providers by setting EMAIL_PROVIDER in .env — nothing else in the
// codebase should import a provider SDK directly. Multiple *SMTP* accounts
// are supported via the EmailAccount model (see routes/emailAccounts.js) —
// getEmailProvider(account) builds a provider bound to that account's own
// credentials instead of the single global env-configured one.

function listUnsubscribeHeaders(unsubscribeUrl) {
  if (!unsubscribeUrl) {
    return {};
  }
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

function devProvider() {
  return {
    name: "dev",
    async send({ to, subject, body, html, unsubscribeUrl, replyTo }) {
      const providerMessageId = `dev-${Date.now()}`;
      console.log(
        `[dev-email] -> ${to}\n  subject: ${subject}\n  body: ${body.slice(0, 200)}${body.length > 200 ? "…" : ""}\n  html: ${html ? `${html.length} chars` : "(none)"}\n  list-unsubscribe: ${unsubscribeUrl ?? "(none)"}\n  reply-to: ${replyTo ?? "(none)"}\n  id: ${providerMessageId}`
      );
      return { providerMessageId };
    }
  };
}

// Cached per credential set (env-configured default uses key "env"; each
// EmailAccount uses its own id) — was previously a single module-level
// variable, which meant only one SMTP identity could ever exist in the
// process at a time. Multiple accounts need genuinely separate connections,
// each capable of being reused across sends rather than reconnecting every
// time.
const smtpTransporters = new Map();

function getOrCreateTransporter(cacheKey, { host, port, secure, user, pass, dkimDomain, dkimSelector, dkimPrivateKey }) {
  if (smtpTransporters.has(cacheKey)) {
    return smtpTransporters.get(cacheKey);
  }

  const dkim =
    dkimDomain && dkimSelector && dkimPrivateKey
      ? { domainName: dkimDomain, keySelector: dkimSelector, privateKey: dkimPrivateKey.replace(/\\n/g, "\n") }
      : undefined;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(dkim ? { dkim } : {})
  });

  smtpTransporters.set(cacheKey, transporter);
  return transporter;
}

function smtpProviderFromCredentials(cacheKey, credentials) {
  return {
    name: "smtp",
    async send({ to, subject, body, html, unsubscribeUrl, replyTo }) {
      const transporter = getOrCreateTransporter(cacheKey, credentials);
      const info = await transporter.sendMail({
        from: credentials.fromAddress,
        to,
        subject,
        text: body,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
        ...(html ? { html } : {}),
        ...(replyTo ? { replyTo } : {})
      });
      return { providerMessageId: info.messageId };
    }
  };
}

function smtpProvider() {
  // The single global env-configured account — unchanged behavior from
  // before EmailAccount existed. Works with any SMTP-compatible service: a
  // real mailbox, your own Postfix/Exim relay, or a provider's SMTP
  // endpoint (SES, Postmark, Mailgun, SendGrid, Office365, Gmail app
  // passwords, etc. all expose one).
  // Required env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_ADDRESS.
  // Optional: SMTP_SECURE ("true" for implicit TLS on port 465), and
  // DKIM_DOMAIN/DKIM_SELECTOR/DKIM_PRIVATE_KEY for signing (the matching
  // public key must ALSO be published as a DNS TXT record for this to
  // actually help deliverability — that DNS step is outside what this
  // codebase can do for you).
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return {
      name: "smtp",
      async send() {
        throw new Error(`SMTP provider is missing required env vars: ${missing.join(", ")}`);
      }
    };
  }

  return smtpProviderFromCredentials("env", {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromAddress: process.env.SMTP_FROM_ADDRESS,
    dkimDomain: process.env.DKIM_DOMAIN,
    dkimSelector: process.env.DKIM_SELECTOR,
    dkimPrivateKey: process.env.DKIM_PRIVATE_KEY
  });
}

// A specific mailbox from the EmailAccount table — this is what makes
// "many SMTP connections" real rather than aspirational: each account gets
// its own cached transporter, so campaigns assigned to different accounts
// send through genuinely separate SMTP connections/identities at the same
// time, not one shared global connection.
export function smtpProviderFromAccount(account) {
  return smtpProviderFromCredentials(account.id, {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    user: account.smtpUser,
    pass: decryptSecret(account.smtpPassEncrypted),
    fromAddress: account.fromAddress
    // Per-account DKIM isn't modeled yet — every account currently shares
    // the single global DKIM_* env config (or none). Fine while accounts
    // are on the same sending domain; a real multi-domain setup would need
    // per-account DKIM fields added to the schema.
  });
}

function sesProvider() {
  // Deliberately not wired up: needs @aws-sdk/client-sesv2 as a dependency
  // plus AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / SES_FROM_ADDRESS.
  // (SES also exposes an SMTP endpoint — the "smtp" provider above works
  // against it directly if you'd rather not add the SDK dependency.)
  return {
    name: "ses",
    async send() {
      throw new Error(
        "SES provider is not implemented yet. Install @aws-sdk/client-sesv2, " +
          "verify the sending domain (SPF/DKIM/DMARC), then implement send() here " +
          "— or use EMAIL_PROVIDER=smtp against SES's SMTP endpoint instead."
      );
    }
  };
}

function postmarkProvider() {
  // Deliberately not wired up: needs POSTMARK_SERVER_TOKEN / POSTMARK_FROM_ADDRESS
  // and a plain fetch() call to https://api.postmarkapp.com/email.
  // (Postmark also exposes an SMTP endpoint — "smtp" provider works there too.)
  return {
    name: "postmark",
    async send() {
      throw new Error(
        "Postmark provider is not implemented yet. Set POSTMARK_SERVER_TOKEN, " +
          "verify the sending domain, then implement send() here — or use " +
          "EMAIL_PROVIDER=smtp against Postmark's SMTP endpoint instead."
      );
    }
  };
}

// Pass an EmailAccount record to send through that specific mailbox instead
// of the single global env-configured provider.
export function getEmailProvider(account = null) {
  if (account) {
    return smtpProviderFromAccount(account);
  }

  const providerName = process.env.EMAIL_PROVIDER ?? "dev";
  switch (providerName) {
    case "smtp":
      return smtpProvider();
    case "ses":
      return sesProvider();
    case "postmark":
      return postmarkProvider();
    case "dev":
    default:
      return devProvider();
  }
}
