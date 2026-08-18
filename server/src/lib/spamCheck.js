// Advisory only — these heuristics catch obvious spam-filter triggers, they
// don't guarantee inbox placement (that depends on domain reputation, SPF/
// DKIM/DMARC, and recipient engagement history, none of which content
// alone controls). Non-blocking by design: a send is logged with these
// warnings attached rather than rejected, so an operator can see the
// pattern building up without every send failing on a false positive.
const SPAM_PHRASES = [
  "free money",
  "click here now",
  "act now",
  "100% free",
  "risk-free",
  "no cost to you",
  "guaranteed",
  "buy now",
  "limited time offer"
];

export function checkSpamSignals({ subject, body }) {
  const warnings = [];

  const letters = subject.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6 && letters === letters.toUpperCase()) {
    warnings.push("Subject is all caps");
  }

  const exclamationCount = (subject.match(/!/g) ?? []).length;
  if (exclamationCount >= 2) {
    warnings.push("Subject has multiple exclamation marks");
  }

  const lowerBody = body.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  for (const phrase of SPAM_PHRASES) {
    if (lowerBody.includes(phrase) || lowerSubject.includes(phrase)) {
      warnings.push(`Contains spam-trigger phrase: "${phrase}"`);
    }
  }

  if (!/\{\{\s*unsubscribeUrl\s*\}\}/.test(body) && !body.toLowerCase().includes("unsubscribe")) {
    // Not fatal — renderTemplate.js always injects an unsubscribe link into
    // the HTML part regardless — but a text-only body with no opt-out
    // mention at all is itself a spam-filter signal on some providers.
    warnings.push("Body has no unsubscribe mention (HTML part still gets one automatically)");
  }

  return warnings;
}
