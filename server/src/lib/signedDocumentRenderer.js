// Renders a downloadable "signed" NDA/IOI when the client accepted via the
// client portal's "fill in your details online" option rather than
// uploading their own signed copy. In that path there's no real file on
// disk to hand back -- Document.documentId still points at the blank
// company-wide template -- so this fills the template's own text (read
// once from assets/*-template-body.txt, extracted verbatim from the real
// NDA PDF / LOI docx) with the values the client actually submitted, and
// wraps it as a clean, printable HTML page.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./clientPortalPage.js";

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

function renderBody(rawText) {
  const [mainPart, signaturePart] = rawText.split("===SIGNATURE_BLOCK===");
  const toParagraphs = (part) =>
    part
      .trim()
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        if (/^-\s/.test(block)) {
          const items = block.split(/\n(?=-\s)/).map((line) => `<li>${escapeHtml(line.replace(/^-\s*/, ""))}</li>`);
          return `<ul>${items.join("")}</ul>`;
        }
        return `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`;
      })
      .join("\n");

  return { mainHtml: toParagraphs(mainPart), signatureHtml: toParagraphs(signaturePart) };
}

function documentShell({ title, mainHtml, signatureHtml, footerNote }) {
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
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #21439b; padding-bottom: 12px; margin-bottom: 28px; }
  .brand { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-weight: 700; font-size: 15px; color: #21439b; }
  .tag { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #5c6b87; text-transform: uppercase; letter-spacing: 0.08em; }
  .signature { margin-top: 32px; padding-top: 20px; border-top: 1px solid #d6deea; }
  .footer { margin-top: 40px; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #9aa6bd; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <span class="brand">GLOBAL CAPITAL BV</span>
    <span class="tag">Building Financial Dreams Together</span>
  </div>
  ${mainHtml}
  <div class="signature">${signatureHtml}</div>
  <p class="footer">${escapeHtml(footerNote)}</p>
</body>
</html>`;
}

export async function renderSignedNda(nda) {
  const raw = await fs.readFile(path.join(ASSETS_DIR, "nda-template-body.txt"), "utf8");
  const filled = fillTokens(raw, {
    AGREEMENT_DATE: fmtDate(nda.agreementDate),
    COUNTERPARTY_NAME: nda.counterpartyLegalName || "[counterparty name not provided]",
    COUNTERPARTY_COUNTRY: nda.counterpartyCountry || "[country not provided]",
    COUNTERPARTY_ADDRESS: nda.counterpartyAddress || "[address not provided]",
    SIGNATORY_NAME: nda.signatoryName || nda.signerName || "[signatory not provided]",
    SIGNATORY_TITLE: nda.signatoryTitle || "",
    SIGNER_NAME: nda.signerName || nda.signatoryName || "the counterparty",
    SIGNED_AT: fmtDateTime(nda.signedAt)
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
    SIGNED_AT: fmtDateTime(ioi.signedAt)
  });
  const { mainHtml, signatureHtml } = renderBody(filled);
  return documentShell({
    title: `Signed IOI — ${ioi.counterparty || ioi.lead?.company || "Global Capital BV"}`,
    mainHtml,
    signatureHtml,
    footerNote: `Accepted online via the Global Capital BV client portal on ${fmtDateTime(ioi.signedAt)}. This copy reflects the details the client submitted at acceptance.`
  });
}
