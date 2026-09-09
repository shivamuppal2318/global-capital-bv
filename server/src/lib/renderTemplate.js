const BRAND = {
  companyName: "Global Capital BV",
  footerText: "Global Capital BV · Amsterdam · Funding & Investment OS"
};

// {{fieldName}} substitution. Unknown placeholders are left as-is (visible
// in preview/testing) rather than silently dropped, so a typo'd merge field
// is obvious instead of quietly sending "Hi ," to a lead.
export function fillMergeFields(text, variables) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in variables ? String(variables[key]) : match));
}

// A lead's name is stored as one combined string (see EmailLead.name) even
// when it was entered via separate First Name/Last Name fields — this just
// takes the first word of it, so {{firstName}} gives a more natural-sounding
// greeting ("Hi Jane,") than {{leadName}}'s full name ("Hi Jane Doe,").
export function firstNameOf(fullName) {
  return String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Every plain-text template gets wrapped in this by default so real sends
// always carry company identity + an unsubscribe link, not raw text. The
// unsubscribe URL is filled in afterwards along with the rest of the merge
// fields, so it still works even though this function runs before merge.
function wrapPlainTextAsHtml(body) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f7fb;padding:24px;margin:0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6a7790;margin:0 0 24px;">${BRAND.companyName}</p>
      ${paragraphs}
      <hr style="border:none;border-top:1px solid #e7edf5;margin:32px 0 16px;" />
      <p style="font-size:12px;color:#9aa6ba;margin:0;">
        ${BRAND.footerText} · <a href="{{unsubscribeUrl}}" style="color:#9aa6ba;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

// Appended to the plain-text part so mail clients that only render text
// (and some spam filters that only scan text) see an opt-out too — without
// this, only the HTML part carried one, which is a real compliance gap on
// any client/filter that ignores HTML.
function withPlainTextFooter(body, variables) {
  if (!("unsubscribeUrl" in variables)) {
    return body;
  }
  return `${body}\n\n--\n${BRAND.footerText}\nUnsubscribe: {{unsubscribeUrl}}`;
}

// template: { subject, body, html? }
// variables: e.g. { leadName, company, unsubscribeUrl }
export function renderEmail(template, variables) {
  const subject = fillMergeFields(template.subject, variables);
  const body = fillMergeFields(withPlainTextFooter(template.body, variables), variables);
  const htmlSource = template.html ?? wrapPlainTextAsHtml(template.body);
  const html = fillMergeFields(htmlSource, variables);
  return { subject, body, html };
}
