// Mirrors the mock data hardcoded in the email-outreach frontend modules, so
// a freshly provisioned backend tells the same demo story the frontend
// already shows standalone. Named "seedEmail" (not "seed") and uses the
// Email-prefixed models — the WhatsApp-domain seed.js already owns the
// plain "seed" name and the un-prefixed models.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campaign = await prisma.emailCampaign.upsert({
    where: { id: "seed-q3-renewables" },
    update: {},
    create: {
      id: "seed-q3-renewables",
      name: "Q3 Renewables Founders — Benelux",
      status: "SENDING",
      audience: "Renewables founders",
      template: "Cold intro — Renewables founder",
      dailyLimit: 2000,
      delayDays: 3,
      followUpCount: 3,
      abTest: true,
      autoPause: true
    }
  });

  await prisma.cadenceStep.upsert({
    where: { campaignId_stepIndex: { campaignId: campaign.id, stepIndex: 0 } },
    update: {},
    create: {
      campaignId: campaign.id,
      stepIndex: 0,
      title: "Day 0 · Intro email",
      bodyTemplate: "Q3 Renewables Founders intro with mandate fit and one-line credibility proof.",
      delayDays: 0
    }
  });
  await prisma.cadenceStep.upsert({
    where: { campaignId_stepIndex: { campaignId: campaign.id, stepIndex: 1 } },
    update: {},
    create: {
      campaignId: campaign.id,
      stepIndex: 1,
      title: "Day 3 · Follow-up 1",
      bodyTemplate: "Follow-up with sector teaser and CTA for interest.",
      delayDays: 3
    }
  });

  const leadsSeed = [
    {
      id: "deepa-paul",
      name: "Deepa Paul",
      company: "Nordwind Energy",
      email: "deepa.paul@nordwind.de",
      owner: "Rahul R",
      replyType: "INTERESTED",
      stage: "NDA Sent",
      replyBody: "Looks aligned. Please send the NDA and next steps."
    },
    {
      id: "harsha-pillai",
      name: "Harsha Pillai",
      company: "Agrivolt SA",
      email: "harsha.pillai@agrivolt.example",
      owner: "Vijay Kumar",
      replyType: "ZOOM_REQUEST",
      stage: "Zoom 1 Pending",
      replyBody: "Can we first do a short Zoom next week before paperwork?"
    },
    {
      id: "ritu-kapoor",
      name: "Ritu Kapoor",
      company: "CircuLoop Materials",
      email: "ritu.kapoor@circuloop.example",
      owner: "Rahul R",
      replyType: "INFO_REQUEST",
      stage: "Info Shared",
      replyBody: "Please share the brochure and a bit more detail on cheque size."
    }
  ];

  for (const seed of leadsSeed) {
    const lead = await prisma.emailLead.upsert({
      where: { id: seed.id },
      update: {},
      create: {
        id: seed.id,
        name: seed.name,
        company: seed.company,
        email: seed.email,
        owner: seed.owner,
        campaignId: campaign.id,
        replyType: seed.replyType,
        stage: seed.stage
      }
    });

    await prisma.emailActivityLog.create({
      data: {
        leadId: lead.id,
        kind: "BULK_INTRO_SENT",
        title: "Bulk intro sent",
        detail: `Initial campaign email delivered from ${campaign.name}.`
      }
    });
    await prisma.emailActivityLog.create({
      data: {
        leadId: lead.id,
        kind: "REPLY_RECEIVED",
        title: "Reply received",
        detail: seed.replyBody
      }
    });
  }

  // Matches the default templateDrafts hardcoded in the email-outreach
  // frontend module exactly, so a freshly seeded backend and a
  // never-touched frontend agree on subject/body by default. html left
  // null so each renders through the default branded wrapper in
  // src/lib/renderTemplate.js.
  const templatesSeed = [
    {
      key: "interested",
      subject: "NDA & next steps — {{company}}",
      body: "Hi {{leadName}},\n\nThank you for the quick response — glad to hear {{company}} is aligned with the mandate.\n\nTo move forward, please review and sign our NDA here: {{ndaSignUrl}}\n\nOnce we have your signature on file, we'll unlock the next stage of diligence and share our data-room request checklist so we can move efficiently from here.\n\nHappy to jump on a call in parallel if that's useful — just let us know.\n\nBest regards,\nGlobal Capital BV"
    },
    {
      key: "zoom-request",
      subject: "Let's find time for an intro call",
      body: "Hi {{leadName}},\n\nThanks for getting back to us — happy to start with a quick call before any paperwork.\n\nYou can pick a time that works for you here: https://calendly.com/globalcapitalbv/intro-call\n\nOn the call, we'll cover mandate fit, where {{company}} sits versus our current thesis, and next steps if it looks like a good match. It should take about 20–30 minutes.\n\nLooking forward to speaking.\n\nBest regards,\nGlobal Capital BV"
    },
    {
      key: "info-request",
      subject: "Teaser, overview, and next steps for {{company}}",
      body: "Hi {{leadName}},\n\nThanks for your interest — please find our teaser and company overview attached for your review.\n\nIf the mandate looks like a fit once you've had a look, there are two ways to move forward from here: sign our NDA to unlock the full diligence materials, or schedule a short introductory call first to walk through fit and answer any questions.\n\nLet us know which works better and we'll get it set up right away.\n\nBest regards,\nGlobal Capital BV"
    },
    {
      key: "no-reply",
      subject: "Following up — still worth a look?",
      body: "Hi {{leadName}},\n\nJust circling back on my note below in case it slipped through — wanted to check whether this is still worth a look for {{company}}.\n\nHappy to re-share the teaser, answer any quick questions, or simply close the loop if the timing isn't right at the moment.\n\nEither way, thanks for taking a look.\n\nBest regards,\nGlobal Capital BV"
    }
  ];

  for (const seed of templatesSeed) {
    await prisma.emailTemplate.upsert({
      where: { key: seed.key },
      update: {},
      create: seed
    });
  }

  console.log(`Seeded email campaign "${campaign.name}" with ${leadsSeed.length} leads and ${templatesSeed.length} templates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
