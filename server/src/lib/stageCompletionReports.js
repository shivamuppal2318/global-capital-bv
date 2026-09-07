import { prisma } from "../db.js";
import { renderStageCompletionReport } from "./signedDocumentRenderer.js";
import { saveGeneratedDocument } from "./fileUpload.js";
import { sendSystemEmail, stageCompletionReportEmail } from "./systemMailer.js";
import { appBaseUrl } from "./appUrl.js";

export const STAGE_REPORT_CATEGORY = "Stage Completion Report";

// Shared by every trigger's `facts` list below -- returns null (not a
// placeholder string) for an unset date, so it's simply left out of the
// report rather than shown as a blank the way the legal-document
// templates in signedDocumentRenderer.js do.
export function fmtFactDate(value) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : null;
}

// Fires the moment any deal stage completes for a lead -- see the call
// sites in routes/ndaRecords.js, ioiRecords.js, documents.js, visitPlans.js
// and dealStages.js (field visit + term sheet). Stores a generated report
// as a real Document (so it shows up everywhere Documents already do --
// Data Room, the CRM Workspace Reports tab, the client portal) and emails
// it to the deal's owner (best-effort name match against a staff User) and
// every admin.
//
// `dedupKey` identifies the one real-world event this report is for --
// "NDA", "IOI", "DATA_ROOM", "FIELD_VISIT" and "TERM_SHEET" happen at most
// once per lead, so the key is just the stage; Visit Planning can happen
// many times per lead, so its callers pass `VISIT:<visitPlanId>` instead,
// one report per actual visit rather than one per lead.
//
// Deliberately not awaited by its callers (fire-and-forget) -- generating
// and emailing a report must never slow down or fail the actual save that
// triggered it, so every failure here is caught and logged, never thrown.
export async function generateStageReport({ leadId, dedupKey, stageLabel, facts, ownerName }) {
  try {
    const marker = `[${dedupKey}]`;
    const existing = await prisma.document.findFirst({
      where: { leadId, category: STAGE_REPORT_CATEGORY, description: { startsWith: marker } }
    });
    if (existing) return existing;

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { company: true, name: true } });
    if (!lead) return null;

    const generatedAt = new Date();
    const html = renderStageCompletionReport({ stageLabel, lead, facts, generatedAt });
    const doc = await saveGeneratedDocument(Buffer.from(html, "utf8"), {
      originalName: `${stageLabel} report — ${lead.company}.html`,
      mimeType: "text/html",
      category: STAGE_REPORT_CATEGORY,
      leadId,
      description: `${marker} ${stageLabel} completed for ${lead.company}.`
    });

    // Best-effort: the owner on a stage record is free text (e.g. "Rahul
    // R"), never a real relation to a User -- if nothing matches, the
    // report still generates and admins still get it, just no DOE copy.
    const recipients = new Set();
    if (ownerName) {
      const match = await prisma.user.findFirst({
        where: { name: { equals: ownerName, mode: "insensitive" } },
        select: { email: true }
      });
      if (match?.email) recipients.add(match.email.toLowerCase());
    }
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
    for (const admin of admins) if (admin.email) recipients.add(admin.email.toLowerCase());

    if (recipients.size) {
      const { subject, html: emailHtml, text } = stageCompletionReportEmail({
        stageLabel,
        company: lead.company,
        facts,
        reportUrl: appBaseUrl()
      });
      for (const to of recipients) {
        await sendSystemEmail({ to, subject, html: emailHtml, text }).catch(() => {});
      }
    }

    return doc;
  } catch (err) {
    console.error(`[stage-completion-report] failed for lead ${leadId} (${dedupKey}):`, err.message);
    return null;
  }
}
