// Renders the real NDA/IOI document text -- extracted verbatim from the
// actual NDA PDF / LOI docx into assets/*-template-body.txt -- in two
// forms:
//   - renderSignedNda/Ioi: a downloadable read-only copy with the client's
//     submitted values filled into the blanks as plain text, used when
//     they accepted online (no uploaded file exists to hand back instead).
//   - ndaFillFormFragment/ioiFillFormFragment: the SAME document text, but
//     with the blanks turned into live <input> fields the client edits
//     right there in the client portal, so "fill in your details online"
//     looks like the actual agreement rather than a generic form.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./clientPortalPage.js";
import { LOGO_DATA_URI } from "./brandLogo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "..", "assets");

export function slugify(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "record"
  );
}

function fmtDate(value) {
  if (!value) return "____________";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return "____________";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
}

function fillTokens(text, tokens) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in tokens ? tokens[key] : match));
}

function toParagraphHtml(part, substitute) {
  return part
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^-\s/.test(block)) {
        const items = block.split(/\n(?=-\s)/).map((line) => `<li>${substitute(line.replace(/^-\s*/, ""))}</li>`);
        return `<ul>${items.join("")}</ul>`;
      }
      return `<p>${substitute(block).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
}

function renderBody(rawText) {
  const [mainPart, signaturePart] = rawText.split("===SIGNATURE_BLOCK===");
  const substitute = (block) => escapeHtml(block);
  return { mainHtml: toParagraphHtml(mainPart, substitute), signatureHtml: toParagraphHtml(signaturePart, substitute) };
}

function documentShell({ title, mainHtml, signatureHtml, footerNote }) {
  const logo = LOGO_DATA_URI;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 56px; font-family: Georgia, "Times New Roman", serif; color: #16213e; line-height: 1.6; max-width: 780px; margin: 0 auto; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 28px; letter-spacing: 0.02em; }
  p { margin: 0 0 14px; font-size: 13.5px; text-align: justify; }
  ul { margin: 0 0 14px; padding-left: 22px; }
  li { font-size: 13.5px; margin-bottom: 6px; }
  .header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #21439b; padding-bottom: 14px; margin-bottom: 28px; }
  .header-logo { height: 42px; width: auto; flex-shrink: 0; }
  .header-text { display: flex; flex-direction: column; }
  .brand { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-weight: 700; font-size: 15px; color: #21439b; }
  .tag { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #5c6b87; text-transform: uppercase; letter-spacing: 0.08em; }
  .signature { margin-top: 32px; padding-top: 20px; border-top: 1px solid #d6deea; }
  .footer { margin-top: 40px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #9aa6bd; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <img class="header-logo" src="${logo}" alt="Global Capital BV" />
    <div class="header-text">
      <span class="brand">GLOBAL CAPITAL BV</span>
      <span class="tag">Building Financial Dreams Together</span>
    </div>
  </div>
  ${mainHtml}
  <div class="signature">${signatureHtml}</div>
  <p class="footer">${escapeHtml(footerNote)}</p>
</body>
</html>`;
}

export async function renderSignedNda(nda) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "nda-template-body.txt"), "utf8");
  const signerName = nda.signerName || nda.signatoryName || "the counterparty";
  const filled = fillTokens(raw, {
    AGREEMENT_DATE: fmtDate(nda.agreementDate),
    COUNTERPARTY_NAME: nda.counterpartyLegalName || "[counterparty name not provided]",
    COUNTERPARTY_COUNTRY: nda.counterpartyCountry || "[country not provided]",
    COUNTERPARTY_ADDRESS: nda.counterpartyAddress || "[address not provided]",
    SIGNATORY_NAME: nda.signatoryName || nda.signerName || "[signatory not provided]",
    SIGNATORY_TITLE: nda.signatoryTitle || "",
    SIGNATURE_STATUS: `signed electronically by ${signerName} on ${fmtDateTime(nda.signedAt)}`
  });
  const { mainHtml, signatureHtml } = renderBody(filled);
  return documentShell({
    title: `Signed NDA — ${nda.counterpartyLegalName || nda.lead?.company || "Global Capital BV"}`,
    mainHtml,
    signatureHtml,
    footerNote: `Accepted online via the Global Capital BV client portal by ${nda.signerName ?? "the client"} on ${fmtDateTime(nda.signedAt)}. This copy reflects the details the client submitted at acceptance.`
  });
}

export async function renderSignedIoi(ioi) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "ioi-template-body.txt"), "utf8");
  const investmentAmount = ioi.value ? `${ioi.valueCurrency ?? "USD"} ${Number(ioi.value).toLocaleString("en-US")}` : "____________";
  const filled = fillTokens(raw, {
    COUNTERPARTY_NAME: ioi.counterparty || ioi.lead?.company || "[borrower name not provided]",
    JURISDICTION: ioi.counterpartyJurisdiction || "[jurisdiction not provided]",
    PROJECT_COST: ioi.totalProjectCost || "[amount not provided]",
    BORROWER_EQUITY: ioi.borrowerEquity || "[amount not provided]",
    INVESTMENT_AMOUNT: investmentAmount,
    ISSUE_DATE: fmtDate(ioi.agreementDate ?? ioi.generatedAt),
    SIGNATORY_NAME: ioi.signatoryName || "[signatory not provided]",
    SIGNATORY_ADDRESS: ioi.signatoryAddress || "[address not provided]",
    SIGNATORY_PHONE: ioi.signatoryPhone || "[phone not provided]",
    SIGNATORY_EMAIL: ioi.signatoryEmail || "[email not provided]",
    SIGNATURE_STATUS: `signed electronically on ${fmtDateTime(ioi.signedAt)}`
  });
  const { mainHtml, signatureHtml } = renderBody(filled);
  return documentShell({
    title: `Signed IOI — ${ioi.counterparty || ioi.lead?.company || "Global Capital BV"}`,
    mainHtml,
    signatureHtml,
    footerNote: `Accepted online via the Global Capital BV client portal on ${fmtDateTime(ioi.signedAt)}. This copy reflects the details the client submitted at acceptance.`
  });
}

// --- Interactive "fill in your details online" document, embedded in the
// client portal's Option 1 (see clientPortal.js's ndaSignFormHtml /
// ioiRespondFormHtml) -----------------------------------------------------

// A token that appears more than once in the source text (a company name
// named both in the opening paragraph and again in the signature block,
// say) gets ONE real <input> at its first occurrence and a read-only
// mirror <span> at every later one, kept in sync client-side by a tiny
// generated <script> -- so the document still reads naturally without a
// second form field fighting the first over what value actually submits.
function renderInteractiveBody(rawText, fieldSpecs) {
  const seen = new Map();
  const mirrors = [];

  function substitute(block) {
    return escapeHtml(block).replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const spec = fieldSpecs[key];
      if (!spec) return match;
      if (!spec.editable) return escapeHtml(spec.text ?? "");

      if (!seen.has(key)) {
        seen.set(key, true);
        const type = spec.type ?? "text";
        return `<input type="${type}" id="gcf-${key}" name="${escapeHtml(spec.name)}" value="${escapeHtml(spec.value ?? "")}" placeholder="${escapeHtml(spec.placeholder ?? "")}" required class="gc-doc-input" />`;
      }
      const mirrorId = `gcf-mirror-${key}-${mirrors.length}`;
      mirrors.push({ key, mirrorId });
      return `<span id="${mirrorId}" class="gc-doc-mirror">${escapeHtml(spec.value ?? "") || "…"}</span>`;
    });
  }

  const [mainPart, signaturePart] = rawText.split("===SIGNATURE_BLOCK===");
  const mainHtml = toParagraphHtml(mainPart, substitute);
  const signatureHtml = toParagraphHtml(signaturePart, substitute);

  const script = mirrors.length
    ? `<script>${mirrors
        .map(
          ({ key, mirrorId }) =>
            `document.getElementById('gcf-${key}')?.addEventListener('input', function (e) { var el = document.getElementById('${mirrorId}'); if (el) el.textContent = e.target.value || '…'; });`
        )
        .join("\n")}</script>`
    : "";

  return { mainHtml, signatureHtml, script };
}

function fillFormShell({ mainHtml, signatureHtml, script }) {
  const logo = LOGO_DATA_URI;
  return `
    <div class="gc-doc-frame">
      <div class="gc-doc-scroll">
        <div class="gc-doc-header">
          <img src="${logo}" alt="Global Capital BV" />
          <div>
            <span class="gc-doc-header-brand">GLOBAL CAPITAL BV</span>
            <span class="gc-doc-header-tag">Building Financial Dreams Together</span>
          </div>
        </div>
        ${mainHtml}
        <div class="gc-doc-signature">${signatureHtml}</div>
      </div>
    </div>
    ${script}`;
}

export async function ndaFillFormFragment(filled, companyName) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "nda-template-body.txt"), "utf8");
  const specs = {
    AGREEMENT_DATE: { editable: true, name: "agreementDate", type: "date", value: filled.agreementDate ?? "" },
    COUNTERPARTY_NAME: {
      editable: true,
      name: "counterpartyLegalName",
      value: filled.counterpartyLegalName || companyName || "",
      placeholder: "Your company's legal name"
    },
    COUNTERPARTY_COUNTRY: { editable: true, name: "counterpartyCountry", value: filled.counterpartyCountry ?? "", placeholder: "Country of registration" },
    COUNTERPARTY_ADDRESS: { editable: true, name: "counterpartyAddress", value: filled.counterpartyAddress ?? "", placeholder: "Registered office address" },
    SIGNATORY_NAME: { editable: true, name: "signatoryName", value: filled.signatoryName ?? "", placeholder: "Signatory name" },
    SIGNATORY_TITLE: { editable: true, name: "signatoryTitle", value: filled.signatoryTitle ?? "", placeholder: "Signatory title" },
    SIGNATURE_STATUS: { editable: false, text: "will be recorded electronically upon submission" }
  };
  return fillFormShell(renderInteractiveBody(raw, specs));
}

// Same pattern one level down for the Channel Partner Agreement (see
// routes/channelPartnerAgreement.js) — previously a read-only <pre> block
// of the full text followed by a generic "type your name to sign" form,
// leaving every real blank ([Partner's Address], [monthly/quarterly])
// unresolved in the actual signed record. PARTNER_NAME is pre-filled and
// non-editable here (unlike NDA's COUNTERPARTY_NAME): ChannelPartner.name
// is already the canonical identity used everywhere else in the app
// (lead-matching, campaign ownership), so letting it diverge here would
// just create a second, disconnected name for the same partner.
export async function channelPartnerAgreementFillFormFragment(partner) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "channel-partner-agreement-template-body.txt"), "utf8");
  const specs = {
    AGREEMENT_DATE: { editable: false, text: fmtDate(new Date()) },
    PARTNER_NAME: { editable: false, text: partner.name },
    PARTNER_ADDRESS: { editable: true, name: "partnerAddress", value: partner.agreementAddress ?? "", placeholder: "Your company's principal office address" },
    TERRITORY: { editable: true, name: "territory", value: partner.region ?? "", placeholder: "e.g. worldwide, or specific countries/regions" },
    PAYMENT_SCHEDULE: { editable: true, name: "paymentSchedule", value: partner.agreementPaymentSchedule ?? "", placeholder: "Monthly or Quarterly" },
    SIGNATURE_STATUS: { editable: false, text: "will be recorded electronically upon submission" }
  };
  return fillFormShell(renderInteractiveBody(raw, specs));
}

export async function ioiFillFormFragment(filled, companyName, ioi) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "ioi-template-body.txt"), "utf8");
  const investmentAmount = ioi?.value ? `${ioi.valueCurrency ?? "USD"} ${Number(ioi.value).toLocaleString("en-US")}` : "to be confirmed";
  const specs = {
    COUNTERPARTY_NAME: { editable: true, name: "counterpartyLegalName", value: filled.counterpartyLegalName || companyName || "", placeholder: "Your company's legal name" },
    JURISDICTION: { editable: true, name: "counterpartyJurisdiction", value: filled.counterpartyJurisdiction ?? "", placeholder: "Jurisdiction of domicile" },
    PROJECT_COST: { editable: true, name: "totalProjectCost", value: filled.totalProjectCost ?? "", placeholder: "Total acquisition / project cost (USD)" },
    BORROWER_EQUITY: { editable: true, name: "borrowerEquity", value: filled.borrowerEquity ?? "", placeholder: "Equity provided by borrower (USD)" },
    INVESTMENT_AMOUNT: { editable: false, text: investmentAmount },
    ISSUE_DATE: { editable: true, name: "agreementDate", type: "date", value: filled.agreementDate ?? "" },
    SIGNATORY_NAME: { editable: true, name: "signatoryName", value: filled.signatoryName ?? "", placeholder: "Signatory name" },
    SIGNATORY_ADDRESS: { editable: true, name: "signatoryAddress", value: filled.signatoryAddress ?? "", placeholder: "Signatory address" },
    SIGNATORY_PHONE: { editable: true, name: "signatoryPhone", type: "tel", value: filled.signatoryPhone ?? "", placeholder: "Signatory phone" },
    SIGNATORY_EMAIL: { editable: true, name: "signatoryEmail", type: "email", value: filled.signatoryEmail ?? "", placeholder: "Signatory email" },
    SIGNATURE_STATUS: { editable: false, text: "will be recorded electronically upon submission" }
  };
  return fillFormShell(renderInteractiveBody(raw, specs));
}
