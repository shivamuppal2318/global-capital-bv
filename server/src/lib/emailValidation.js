import dns from "node:dns";

const dnsPromises = dns.promises;

const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLACEHOLDER_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "test.com", "invalid", "domain.com", "email.com", "yourdomain.com"
]);

export function isValidEmailSyntax(email) {
  return EMAIL_SYNTAX_RE.test(String(email ?? "").trim());
}

export function getEmailDomain(email) {
  return String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
}

export function isPlaceholderDomain(domain) {
  return PLACEHOLDER_DOMAINS.has(domain);
}

// Confirms a domain is actually configured to receive mail — MX records,
// or an A/AAAA fallback per RFC 5321 when no MX exists — without a live
// SMTP mailbox probe. Deliberately stops at DNS: outbound port 25 is
// blocked by default on most cloud/VPS hosts (including where this app is
// deployed), and even where it isn't, major providers (Gmail, Outlook)
// accept-all at RCPT TO and only bounce later, so a live probe would be
// unreliable for exactly the domains most leads use, while adding real
// abuse-risk to our sending IP for no reliable gain.
export async function verifyEmailDeliverability(email) {
  const trimmed = String(email ?? "").trim().toLowerCase();

  if (!isValidEmailSyntax(trimmed)) {
    return { valid: false, reason: "Invalid email format." };
  }

  const domain = getEmailDomain(trimmed);
  if (isPlaceholderDomain(domain)) {
    return { valid: false, reason: "This looks like a placeholder domain, not a real mailbox." };
  }

  try {
    const mxRecords = await dnsPromises.resolveMx(domain);
    if (mxRecords.length > 0) {
      return { valid: true, reason: "Domain has valid mail servers (MX records)." };
    }
  } catch {
    // No MX record (or lookup failed) — fall through to the A/AAAA check
    // rather than failing here, since a domain can legally receive mail via
    // its address record alone (RFC 5321 §5.1).
  }

  try {
    await dnsPromises.resolve4(domain);
    return { valid: true, reason: "Domain resolves but has no MX records — deliverability isn't guaranteed." };
  } catch {
    // fall through to IPv6
  }

  try {
    await dnsPromises.resolve6(domain);
    return { valid: true, reason: "Domain resolves (IPv6) but has no MX records — deliverability isn't guaranteed." };
  } catch {
    return { valid: false, reason: `No mail-related DNS records found for "${domain}" — this domain likely can't receive email.` };
  }
}

// Batch helper for CSV preview / bulk import — validates unique domains
// once each (a CSV of 50 leads from the same company shouldn't trigger 50
// DNS lookups against the same domain) and sequentially, not in parallel,
// since a burst of concurrent DNS lookups from one process risks hitting
// the resolver's own rate limits on a large paste.
export async function verifyEmailsDeliverability(emails) {
  const cache = new Map();
  const results = [];
  for (const email of emails) {
    const domain = getEmailDomain(email);
    const cacheKey = isValidEmailSyntax(email) ? domain : `__invalid__:${email}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, await verifyEmailDeliverability(email));
    }
    results.push({ email, ...cache.get(cacheKey) });
  }
  return results;
}
