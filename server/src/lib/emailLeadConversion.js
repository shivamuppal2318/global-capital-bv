import { prisma } from "./prisma.js";
import { buildLeadCreateData } from "./leadCreation.js";

// Auto-tracks a cold-outreach EmailLead in CRM Workspace the moment their
// reply is classified INTERESTED (see replyRecorder.js) — so a rep sees it
// in the pipeline without having to notice the reply and click "Convert to
// Lead" themselves first. Deliberately does NOT also fire the client portal
// invite email the manual "Convert to Lead" button sends (see
// routes/leads.js's sendPortalInviteForLead / POST /from-email-lead/:id):
// keyword-based reply classification can misfire, and unlike creating a
// row for a rep to review, emailing a real prospect isn't something to do
// on an unreviewed guess — that stays a deliberate action a rep takes from
// the new CRM lead once they've looked at it.
export async function autoTrackInterestedEmailLead(emailLead) {
  if (emailLead.convertedToLeadId) {
    return null;
  }

  const lead = await prisma.lead.create({
    data: buildLeadCreateData({
      name: emailLead.name,
      company: emailLead.company,
      email: emailLead.email,
      owner: emailLead.owner,
      leadSource: "Cold outreach reply (interested)",
      status: "INTERESTED"
    })
  });

  // Guards against two replies from the same lead landing close enough
  // together (e.g. an IMAP poll processing a backlog) that both calls read
  // convertedToLeadId as still null before either writes it — only the
  // caller that actually flips it from null wins; the other's freshly
  // created (and now orphaned) Lead row is removed instead of leaving a
  // duplicate CRM entry behind.
  const { count } = await prisma.emailLead.updateMany({
    where: { id: emailLead.id, convertedToLeadId: null },
    data: { convertedToLeadId: lead.id, convertedAt: new Date() }
  });
  if (count === 0) {
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {});
    return null;
  }

  await prisma.emailActivityLog.create({
    data: {
      leadId: emailLead.id,
      kind: "MANUAL_NOTE",
      title: "Auto-tracked in CRM Workspace",
      detail: `Reply classified as interested — added to CRM Workspace as "${lead.name}" (${lead.company}) for follow-up. No invite email was sent automatically.`
    }
  });

  return lead;
}
