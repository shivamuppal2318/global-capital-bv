// Local-only demo data for exercising every module built this session —
// NDA, Zoom Call, Data Room, IOI, Visit Planning, Field Visit, Term Sheet,
// Universal Filters, Executive Dashboard, Outreach/DOE, Ageing Report.
// Never run against production: it inserts fabricated rows with made-up
// document content, wired only to the 5 leads already in the base seed.
//
// Run with: node prisma/seedDemoData.js

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function main() {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
  if (leads.length < 5) throw new Error("Run `npm run db:seed` first — expected the 5 base leads to exist.");

  // Looked up by name rather than positional destructuring — the base
  // seed's insertion order isn't part of its contract, and getting this
  // wrong silently attaches one lead's demo data to a different lead's
  // name (exactly what happened the first time this script ran).
  const byName = (name) => {
    const lead = leads.find((l) => l.name === name);
    if (!lead) throw new Error(`Expected a base-seeded lead named "${name}" — did the base seed change?`);
    return lead;
  };
  const bhakthi = byName("Bhakthi Nair");
  const ritu = byName("Ritu Kapoor");
  const deepa = byName("Deepa Paul");
  const nitin = byName("Nitin Das");
  const harsha = byName("Harsha Pillai");

  // --- Lead attributes (Universal Filters / DOE / Outreach coverage) -----
  await prisma.lead.update({
    where: { id: bhakthi.id },
    data: { industry: "Renewables", channelPartner: "Meridian Partners", temperature: "HOT", teamLeader: "Rahul R", manager: "Anika T", doe: "Rahul R" }
  });
  await prisma.lead.update({
    where: { id: ritu.id },
    data: { industry: "Materials", channelPartner: "Solstice Advisors", temperature: "WARM", teamLeader: "Rahul R", manager: "Anika T", doe: "Vijay Kumar" }
  });
  await prisma.lead.update({
    where: { id: deepa.id },
    data: { industry: "Renewables", channelPartner: "Meridian Partners", temperature: "WARM", teamLeader: "Meera S", manager: "Anika T", doe: "Rahul R" }
  });
  await prisma.lead.update({
    where: { id: nitin.id },
    data: { industry: "Logistics", channelPartner: "Solstice Advisors", temperature: "COLD", teamLeader: "Meera S", manager: "Vijay K", doe: "Vijay Kumar" }
  });
  await prisma.lead.update({
    where: { id: harsha.id },
    data: { industry: "Agritech", channelPartner: null, temperature: "HOT", teamLeader: "Rahul R", manager: "Anika T", doe: "Rahul R" }
  });
  console.log("✔ Lead attributes set (industry, channel partner, temperature, team leader, manager, DOE)");

  // --- NDA records ---------------------------------------------------------
  // skipDuplicates: true -- NdaRecord.leadId is unique, and a lead already
  // signed/tested for real (e.g. via the client portal) keeps its real
  // record instead of this failing the whole batch or clobbering it.
  await prisma.ndaRecord.createMany({
    data: [
      { leadId: bhakthi.id, status: "SIGNED", sentAt: daysAgo(20), reminder1At: daysAgo(14), signedAt: daysAgo(10), owner: "Rahul R", signerName: "B. Nair", signerEmail: bhakthi.email ?? "b.nair@heliogrid.nl" },
      { leadId: deepa.id, status: "REMINDER_1", sentAt: daysAgo(12), reminder1At: daysAgo(4), owner: "Meera S" },
      { leadId: harsha.id, status: "SENT", sentAt: daysAgo(3), owner: "Rahul R" },
      { leadId: nitin.id, status: "DECLINED", sentAt: daysAgo(30), owner: "Meera S", notes: "Counterparty walked away after term discussion." }
    ],
    skipDuplicates: true
  });
  console.log("✔ 4 NDA records (signed, reminded, sent, declined) — existing real ones kept as-is");

  // --- Zoom calls (Meeting) -------------------------------------------------
  // Meeting has no unique constraint to skipDuplicates against, so this
  // guards against re-running the script and doubling up every call.
  const existingMeetings = await prisma.meeting.count();
  if (existingMeetings > 0) {
    console.log(`✔ ${existingMeetings} Zoom call(s) already exist — skipped`);
  } else {
  await prisma.meeting.createMany({
    data: [
      {
        leadId: bhakthi.id,
        topic: "Mandate fit call — Helio Grid BV",
        startTime: daysAgo(9),
        durationMinutes: 30,
        status: "Completed",
        clientAttendees: "Bhakthi Nair, CFO",
        ourAttendees: "Rahul R",
        actualDurationMinutes: 42,
        notes: "Strong fit — asked for data room access and a term sheet timeline. Wants IOI within 2 weeks.",
        aiSummary: "Client confirmed mandate fit and requested data room access plus an indicative timeline to term sheet.",
        aiSummaryUpdatedAt: daysAgo(9),
        nextAction: "Share data room access and schedule IOI review",
        nextActionDueAt: daysAgo(2),
        nextMeetingScheduled: true,
        clientSatisfaction: 5
      },
      {
        leadId: deepa.id,
        topic: "Diligence follow-up — Nordwind Energy",
        startTime: daysAgo(6),
        durationMinutes: 30,
        status: "Completed",
        clientAttendees: "Deepa Paul",
        ourAttendees: "Meera S",
        actualDurationMinutes: 25,
        notes: "Discussed FY26 growth numbers. Wants a follow-up with the CFO before proceeding.",
        nextAction: "Book CFO follow-up call",
        nextActionDueAt: daysFromNow(3),
        clientSatisfaction: 4
      },
      {
        leadId: harsha.id,
        topic: "Intro call — Agrivolt SA",
        startTime: daysFromNow(2),
        durationMinutes: 30,
        status: "Scheduled"
      },
      {
        leadId: nitin.id,
        topic: "Intro call — PortLogic Rotterdam",
        startTime: daysAgo(15),
        durationMinutes: 30,
        status: "Cancelled"
      }
    ]
  });
  console.log("✔ 4 Zoom calls (2 completed with full capture, 1 scheduled, 1 cancelled)");
  }

  // --- Data Room documents ---------------------------------------------------
  const requiredLabels = [
    "Certificate of Incorporation",
    "Company Profile",
    "Audited Financial Statements",
    "Bank Statements"
  ];
  // Guarded the same way as the Meeting block above — Document has no
  // unique constraint to skipDuplicates against.
  const existingDemoDocs = await prisma.document.count({ where: { leadId: null, storedName: { startsWith: "demo-" } } });
  if (existingDemoDocs > 0) {
    console.log(`✔ ${existingDemoDocs} company-wide Data Room document(s) already exist — skipped`);
  } else {
    const documents = [];
    for (const [i, label] of requiredLabels.entries()) {
      documents.push(
        await prisma.document.create({
          data: {
            originalName: `${label.replace(/\s+/g, "_")}.pdf`,
            storedName: `demo-${Date.now()}-${i}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: 240_000 + i * 10_000,
            category: label,
            description: `Demo ${label.toLowerCase()} for local testing.`,
            verified: i < 2,
            verifiedAt: i < 2 ? daysAgo(5) : null
          }
        })
      );
    }
    console.log(`✔ ${documents.length} Data Room documents (4 of 10 required categories, 2 verified)`);
  }

  // --- Lead-scoped Data Room documents (Bhakthi Nair) -----------------------
  // The block above is company-wide (leadId: null) reference material, so
  // it never shows up on any one lead's own client-portal checklist (that
  // view is strictly scoped to prisma.document.findMany({ where: { leadId
  // } }) -- see clientPortal.js's loadPortalData). Guarded by an existence
  // check rather than skipDuplicates: Document has no unique constraint to
  // skip against, so re-running this without the guard would just keep
  // duplicating rows.
  const existingBhakthiDocs = await prisma.document.count({ where: { leadId: bhakthi.id } });
  if (existingBhakthiDocs === 0) {
    const bhakthiDocRows = [
      { label: "Certificate of Incorporation", verified: true, verifiedDaysAgo: 6 },
      { label: "Company Profile", verified: true, verifiedDaysAgo: 6 },
      { label: "Audited Financial Statements", verified: false },
      { label: "Bank Statements", verified: false },
      { label: "Financial Projections", verified: false }
    ];
    for (const [i, row] of bhakthiDocRows.entries()) {
      await prisma.document.create({
        data: {
          leadId: bhakthi.id,
          originalName: `${row.label.replace(/\s+/g, "_")}_HelioGridBV.pdf`,
          storedName: `demo-bhakthi-${Date.now()}-${i}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 180_000 + i * 15_000,
          category: row.label,
          description: `${row.label} submitted by Helio Grid BV via the client portal.`,
          verified: row.verified,
          verifiedAt: row.verified ? daysAgo(row.verifiedDaysAgo) : null
        }
      });
    }
    console.log(`✔ ${bhakthiDocRows.length} lead-scoped Data Room documents for Bhakthi Nair / Helio Grid BV (2 verified)`);
  } else {
    console.log(`✔ Bhakthi Nair already has ${existingBhakthiDocs} Data Room document(s) — skipped`);
  }

  // --- IOI records -----------------------------------------------------------
  // skipDuplicates: true -- same reasoning as the NDA batch above.
  await prisma.ioiRecord.createMany({
    data: [
      {
        leadId: bhakthi.id,
        status: "SIGNED",
        generatedAt: daysAgo(8),
        sentAt: daysAgo(7),
        signedAt: daysAgo(3),
        value: 4_500_000,
        industry: "Renewables",
        geography: "Benelux",
        counterparty: "Bhakthi Nair",
        owner: "Rahul R"
      },
      {
        leadId: deepa.id,
        status: "SENT",
        generatedAt: daysAgo(5),
        sentAt: daysAgo(4),
        value: 9_000_000,
        industry: "Renewables",
        geography: "DACH",
        owner: "Meera S"
      },
      {
        leadId: nitin.id,
        status: "DECLINED",
        generatedAt: daysAgo(25),
        sentAt: daysAgo(24),
        value: 2_000_000,
        industry: "Logistics",
        geography: "Benelux",
        owner: "Meera S"
      }
    ],
    skipDuplicates: true
  });
  console.log("✔ 3 IOI records (signed, sent, declined) — existing real ones kept as-is");

  // --- Visit planning ----------------------------------------------------
  // Guarded the same way as the Meeting block above — VisitPlan has no
  // unique constraint to skipDuplicates against (a lead can genuinely have
  // more than one visit, so leadId alone can't be the key).
  const existingVisitPlans = await prisma.visitPlan.count();
  if (existingVisitPlans > 0) {
    console.log(`✔ ${existingVisitPlans} visit plan(s) already exist — skipped`);
  } else {
  await prisma.visitPlan.createMany({
    data: [
      {
        leadId: bhakthi.id,
        status: "COMPLETED",
        plannedFor: daysAgo(4),
        completedAt: daysAgo(4),
        location: "Rotterdam HQ",
        region: "Benelux",
        country: "Netherlands",
        purpose: "Site inspection",
        owner: "Rahul R",
        costAmount: 420,
        costCurrency: "USD",
        reportSubmitted: true,
        reportAt: daysAgo(3)
      },
      {
        leadId: deepa.id,
        status: "PLANNED",
        plannedFor: daysFromNow(5),
        location: "Munich office",
        region: "DACH",
        country: "Germany",
        purpose: "Management meeting",
        owner: "Meera S",
        costAmount: 650,
        costCurrency: "USD"
      },
      {
        leadId: ritu.id,
        status: "PLANNED",
        plannedFor: daysFromNow(1),
        location: "Mumbai plant",
        region: "APAC",
        country: "India",
        purpose: "Diligence visit",
        owner: "Rahul R"
      }
    ]
  });
  console.log("✔ 3 visit plans (1 completed with report, 2 planned)");
  }

  // --- Field Visit / Term Sheet (shared DealStageRecord table) -----------
  // skipDuplicates: true -- (leadId, stage) is unique, same reasoning.
  await prisma.dealStageRecord.createMany({
    skipDuplicates: true,
    data: [
      {
        leadId: bhakthi.id,
        stage: "FIELD_VISIT",
        status: "COMPLETED",
        scheduledAt: daysAgo(4),
        completedAt: daysAgo(4),
        location: "Rotterdam HQ",
        attendees: "Rahul R, B. Nair",
        counterparty: "Bhakthi Nair",
        owner: "Rahul R",
        clientRating: 4.5
      },
      {
        leadId: bhakthi.id,
        stage: "TERM_SHEET",
        status: "IN_PROGRESS",
        scheduledAt: daysAgo(1),
        amount: "EUR 4-5M",
        valuation: "EUR 22M pre-money",
        counterparty: "Bhakthi Nair",
        owner: "Rahul R"
      },
      {
        leadId: deepa.id,
        stage: "FIELD_VISIT",
        status: "NOT_STARTED"
      }
    ]
  });
  console.log("✔ 3 deal-stage records (Field Visit completed + rated, Term Sheet in progress, Field Visit not started)");

  // --- Cold outreach: more EmailLeads + activity for Outreach/DOE --------
  const campaign = await prisma.emailCampaign.findFirst();
  if (campaign) {
    // EmailLead.email has no unique constraint, so skipDuplicates has
    // nothing to skip against and silently inserted a fresh triplicate set
    // on every re-run — filtered against existing emails by hand instead.
    const demoOutreachLeads = [
      { name: "Marco Bellini", company: "Solara Energie", email: "marco@solaraenergie.example", owner: "Rahul R", country: "Italy", campaignId: campaign.id, replyType: "INTERESTED", createdAt: daysAgo(3) },
      { name: "Elin Karlsson", company: "Nordic Grid Storage", email: "elin@nordicgrid.example", owner: "Rahul R", country: "Sweden", campaignId: campaign.id, replyType: "NO_REPLY", createdAt: daysAgo(3) },
      { name: "Youssef Amrani", company: "Atlas Logistics", email: "youssef@atlaslogistics.example", owner: "Vijay Kumar", country: "Morocco", campaignId: campaign.id, replyType: "ZOOM_REQUEST", callBookedAt: daysAgo(1), createdAt: daysAgo(6) },
      { name: "Priya Nair", company: "GreenFleet Mobility", email: "priya@greenfleet.example", owner: "Vijay Kumar", country: "India", campaignId: campaign.id, replyType: "INFO_REQUEST", createdAt: daysAgo(6) },
      { name: "Tom Fischer", company: "Baltic Freight Co", email: "tom@balticfreight.example", owner: "Vijay Kumar", country: "Germany", campaignId: campaign.id, replyType: "NO_REPLY", createdAt: daysAgo(1) }
    ];
    const existingEmails = new Set((await prisma.emailLead.findMany({ where: { email: { in: demoOutreachLeads.map((l) => l.email) } }, select: { email: true } })).map((l) => l.email));
    const toInsert = demoOutreachLeads.filter((l) => !existingEmails.has(l.email));
    const extraLeads = toInsert.length ? await prisma.emailLead.createManyAndReturn({ data: toInsert }) : [];
    // Only for leads that don't already have activity logged — EmailActivityLog
    // has no unique constraint to skipDuplicates against, and re-running this
    // for every email lead on every seed run would double up their history.
    const leadsWithActivity = new Set((await prisma.emailActivityLog.findMany({ select: { leadId: true }, distinct: ["leadId"] })).map((r) => r.leadId));
    const allEmailLeads = await prisma.emailLead.findMany();
    const activityRows = [];
    for (const l of allEmailLeads) {
      if (leadsWithActivity.has(l.id)) continue;
      activityRows.push({ leadId: l.id, kind: "BULK_INTRO_SENT", title: "Intro email sent", detail: "Day 0 intro", createdAt: l.createdAt });
      if (l.replyType !== "NO_REPLY" || Math.random() > 0.5) {
        activityRows.push({ leadId: l.id, kind: "EMAIL_OPENED", title: "Email opened", detail: "Tracking pixel loaded", createdAt: l.createdAt });
      }
      if (l.replyType !== "NO_REPLY") {
        activityRows.push({ leadId: l.id, kind: "REPLY_RECEIVED", title: "Reply received", detail: l.replyType, createdAt: l.createdAt });
      }
    }
    if (activityRows.length) await prisma.emailActivityLog.createMany({ data: activityRows });
    console.log(`✔ ${extraLeads.length} extra EmailLeads + ${activityRows.length} new activity log rows (sends/opens/replies)`);
  } else {
    console.log("⚠ No EmailCampaign found — skipped extra outreach data (run npm run db:seed first)");
  }

  console.log("\nDemo data seeded. Every relationship module now has real rows to render.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
