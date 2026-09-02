import { prisma } from "../db.js";
import { isSourceEnabled } from "./aiDataSources.js";
import { ndaMetrics, callMetrics, visitMetrics, ioiMetrics } from "./relationshipMetrics.js";

const LEAD_STATUS_LABEL = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  NEGOTIATION: "Negotiation",
  CONVERTED: "Converted",
  LOST: "Lost"
};

// Caps so one busy table can't crowd the prompt out. Newest-first, since a
// question is far more often about recent activity than about the oldest
// record in the system.
const MAX_ROWS = 200;

// Pulls a snapshot of the business from Postgres for the AI assistant to
// reason over. Plain JSON rather than a vector index: the structured data
// is small enough to fit in a prompt, and unlike free text it has no good
// chunking boundary. Data Room documents are the exception and go through
// retrieval instead (see documentSearch.js).
//
// `enabledSources` comes from Admin Panel → AI Assistant. A disabled
// section is never queried at all, so it costs nothing and cannot leak.
export async function buildBusinessContext(enabledSources = null) {
  const on = (id) => isSourceEnabled(enabledSources, id);

  const [
    leads,
    contacts,
    conversations,
    templates,
    campaigns,
    dripSequences,
    autoReplyRules,
    botFlows,
    crmTriggers,
    automationRules,
    agents,
    account,
    meetings,
    emailLeads,
    emailCampaigns,
    users,
    marketSignals,
    dealStages,
    ndaRecords,
    visitPlans,
    ioiRecords,
    leadActivity
  ] = await Promise.all([
    on("leads") ? prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: MAX_ROWS }) : [],
    on("whatsapp") ? prisma.contact.findMany({ take: MAX_ROWS }) : [],
    on("whatsapp")
      ? prisma.conversation.findMany({ include: { contact: true }, orderBy: { lastMessageAt: "desc" }, take: MAX_ROWS })
      : [],
    on("whatsapp") ? prisma.template.findMany() : [],
    on("whatsapp") ? prisma.campaign.findMany({ include: { template: true } }) : [],
    on("whatsapp") ? prisma.dripSequence.findMany() : [],
    on("whatsapp") ? prisma.autoReplyRule.findMany() : [],
    on("whatsapp") ? prisma.botFlow.findMany() : [],
    on("whatsapp") ? prisma.crmTrigger.findMany() : [],
    on("whatsapp") ? prisma.automationRule.findMany() : [],
    on("team") ? prisma.agent.findMany() : [],
    // Company identity is cheap and orients every answer, so it isn't
    // behind a toggle.
    prisma.businessSettings.findFirst(),
    on("meetings")
      ? prisma.meeting.findMany({ include: { lead: { select: { name: true, company: true } } }, orderBy: { startTime: "desc" }, take: MAX_ROWS })
      : [],
    on("follow-ups")
      ? prisma.emailLead.findMany({ include: { campaign: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: MAX_ROWS })
      : [],
    on("email-campaigns")
      ? prisma.emailCampaign.findMany({ include: { emailAccount: { select: { label: true } }, _count: { select: { leads: true } } } })
      : [],
    on("employees")
      ? prisma.user.findMany({ select: { name: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: "asc" } })
      : [],
    on("market-signals")
      ? prisma.marketSignal.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
      : [],
    on("deal-stages")
      ? prisma.dealStageRecord.findMany({
          include: { lead: { select: { name: true, company: true } } },
          orderBy: { updatedAt: "desc" },
          take: MAX_ROWS
        })
      : [],
    on("nda")
      ? prisma.ndaRecord.findMany({
          include: { lead: { select: { name: true, company: true } } },
          orderBy: { updatedAt: "desc" },
          take: MAX_ROWS
        })
      : [],
    on("visits")
      ? prisma.visitPlan.findMany({
          include: { lead: { select: { name: true, company: true } } },
          orderBy: { plannedFor: "desc" },
          take: MAX_ROWS
        })
      : [],
    on("ioi")
      ? prisma.ioiRecord.findMany({
          include: { lead: { select: { name: true, company: true } } },
          orderBy: { updatedAt: "desc" },
          take: MAX_ROWS
        })
      : [],
    // CRM Workspace's Timeline/Interactions tab — same relation, gated
    // under "leads" rather than its own toggle since it has no meaning
    // apart from the lead it's logged against.
    on("leads")
      ? prisma.leadActivityLog.findMany({
          include: { lead: { select: { name: true, company: true } } },
          orderBy: { createdAt: "desc" },
          take: MAX_ROWS
        })
      : []
  ]);

  const context = {
    generatedAt: new Date().toISOString(),
    company: account
      ? { name: account.displayName, category: account.category, phone: account.phone, status: account.status }
      : null
  };

  if (on("leads")) {
    context.leads = {
      total: leads.length,
      qualifiedCount: leads.filter((l) => l.qualified).length,
      byStatus: leads.reduce((acc, l) => {
        const label = LEAD_STATUS_LABEL[l.status];
        acc[label] = (acc[label] ?? 0) + 1;
        return acc;
      }, {}),
      records: leads.map((l) => ({
        name: l.name,
        company: l.company,
        email: l.email,
        mobile: l.mobile,
        capitalAsk: l.capitalAsk,
        status: LEAD_STATUS_LABEL[l.status],
        qualified: l.qualified,
        owner: l.owner,
        leadSource: l.leadSource,
        territory: l.territory,
        engagementStage: l.engagementStage,
        consentGdpr: l.consentGdpr,
        notes: l.notes,
        // Universal Filters fields (lib/universalFilters.js) — manually set
        // by a rep, not derived from anything else here.
        industry: l.industry,
        channelPartner: l.channelPartner,
        temperature: l.temperature,
        teamLeader: l.teamLeader,
        manager: l.manager,
        doe: l.doe,
        tags: l.tags,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        // From the "Enrich"/"Bulk enrich" ZoomInfo action (CRM Workspace) —
        // null on any lead never enriched or with no ZoomInfo match, rather
        // than omitted, so the assistant can say "not enriched" instead of
        // silently treating it the same as "no matching company exists".
        zoomInfoEnrichedAt: l.zoomInfoEnrichedAt,
        zoomInfoCompany: l.zoomInfoData,
        zoomInfoContact: l.zoomInfoContactData,
        zoomInfoScoops: l.zoomInfoScoops
      }))
    };

    // CRM Workspace's Timeline/Interactions tab — the log entries a rep
    // sees against one lead, here flattened across all leads like meetings
    // and NDAs above so "what's happened on X" or "what did we log
    // recently" can both be answered.
    context.leadActivity = {
      total: leadActivity.length,
      records: leadActivity.map((a) => ({
        lead: a.lead ? `${a.lead.name} (${a.lead.company})` : null,
        kind: a.kind,
        title: a.title,
        detail: a.detail,
        loggedAt: a.createdAt
      }))
    };
  }

  if (on("meetings")) {
    const now = new Date();
    context.meetings = {
      total: meetings.length,
      upcoming: meetings.filter((m) => m.startTime > now).length,
      past: meetings.filter((m) => m.startTime <= now).length,
      kpis: callMetrics(meetings),
      records: meetings.map((m) => ({
        topic: m.topic,
        startTime: m.startTime,
        durationMinutes: m.durationMinutes,
        actualDurationMinutes: m.actualDurationMinutes,
        status: m.status,
        isZoom: Boolean(m.zoomMeetingId),
        withLead: m.lead ? `${m.lead.name} (${m.lead.company})` : null,
        clientAttendees: m.clientAttendees,
        ourAttendees: m.ourAttendees,
        // The notes are the substance of the call - this is what lets the
        // assistant answer "what did they say about X".
        notes: m.notes,
        aiSummary: m.aiSummary,
        nextAction: m.nextAction,
        nextActionDueAt: m.nextActionDueAt,
        nextMeetingScheduled: m.nextMeetingScheduled,
        clientSatisfaction: m.clientSatisfaction
      }))
    };
  }

  if (on("nda")) {
    context.ndas = {
      total: ndaRecords.length,
      kpis: ndaMetrics(ndaRecords),
      records: ndaRecords.map((r) => ({
        lead: r.lead ? `${r.lead.name} (${r.lead.company})` : null,
        status: r.status,
        sentAt: r.sentAt,
        reminder1At: r.reminder1At,
        reminder2At: r.reminder2At,
        signedAt: r.signedAt,
        expiresAt: r.expiresAt,
        signerName: r.signerName,
        owner: r.owner,
        notes: r.notes
      }))
    };
  }

  if (on("ioi")) {
    context.iois = {
      total: ioiRecords.length,
      kpis: ioiMetrics(ioiRecords),
      records: ioiRecords.map((r) => ({
        lead: r.lead ? `${r.lead.name} (${r.lead.company})` : null,
        status: r.status,
        generatedAt: r.generatedAt,
        sentAt: r.sentAt,
        signedAt: r.signedAt,
        expiresAt: r.expiresAt,
        value: r.value === null ? null : `${r.valueCurrency} ${r.value}`,
        industry: r.industry,
        geography: r.geography,
        counterparty: r.counterparty,
        owner: r.owner,
        notes: r.notes
      }))
    };
  }

  if (on("visits")) {
    context.visits = {
      total: visitPlans.length,
      kpis: visitMetrics(visitPlans),
      records: visitPlans.map((p) => ({
        lead: p.lead ? `${p.lead.name} (${p.lead.company})` : null,
        status: p.status,
        plannedFor: p.plannedFor,
        completedAt: p.completedAt,
        location: p.location,
        region: p.region,
        country: p.country,
        purpose: p.purpose,
        attendees: p.attendees,
        owner: p.owner,
        travelMode: p.travelMode,
        cost: p.costAmount === null ? null : `${p.costCurrency} ${p.costAmount}`,
        reportSubmitted: p.reportSubmitted,
        notes: p.notes
      }))
    };
  }

  if (on("follow-ups")) {
    context.customerFollowUps = {
      total: emailLeads.length,
      replied: emailLeads.filter((l) => l.replyType !== "NO_REPLY").length,
      callsBooked: emailLeads.filter((l) => l.callBookedAt).length,
      callsCompleted: emailLeads.filter((l) => l.callCompletedAt).length,
      ndasSigned: emailLeads.filter((l) => l.ndaSignedAt).length,
      unsubscribed: emailLeads.filter((l) => l.unsubscribed).length,
      bounced: emailLeads.filter((l) => l.bounced).length,
      records: emailLeads.map((l) => ({
        name: l.name,
        company: l.company,
        email: l.email,
        owner: l.owner,
        campaign: l.campaign?.name ?? null,
        stage: l.stage,
        replyType: l.replyType,
        unsubscribed: l.unsubscribed,
        bounced: l.bounced,
        ndaSignedAt: l.ndaSignedAt,
        callBookedAt: l.callBookedAt,
        callScheduledFor: l.callScheduledFor,
        callCompletedAt: l.callCompletedAt,
        updatedAt: l.updatedAt
      }))
    };
  }

  if (on("email-campaigns")) {
    context.emailCampaigns = emailCampaigns.map((c) => ({
      name: c.name,
      status: c.status,
      audience: c.audience,
      leadCount: c._count.leads,
      followUpCount: c.followUpCount,
      delayDays: c.delayDays,
      dailyLimit: c.dailyLimit,
      mailbox: c.emailAccount?.label ?? "Default (env-configured)"
    }));
  }

  if (on("whatsapp")) {
    context.whatsapp = {
      contactsTotal: contacts.length,
      conversations: conversations.map((c) => ({
        contact: c.contact.name,
        company: c.contact.company,
        status: c.status,
        lastPreview: c.lastPreview,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount
      })),
      templates: templates.map((t) => ({
        name: t.name,
        category: t.category,
        status: t.status,
        uses: t.uses,
        readRate: t.readRate,
        replyRate: t.replyRate
      })),
      campaigns: campaigns.map((c) => ({
        name: c.name,
        template: c.template.name,
        audience: c.audienceLabel,
        status: c.status,
        sent: c.sentCount,
        delivered: c.deliveredCount,
        read: c.readCount,
        replied: c.repliedCount
      })),
      dripSequences: dripSequences.map((s) => ({
        name: s.name,
        trigger: s.trigger,
        enrolled: s.enrolledCount,
        completionRate: s.completionRate,
        status: s.status
      })),
      autoReplyRules: autoReplyRules.map((r) => ({ keyword: r.keyword, reply: r.reply, status: r.status, triggered: r.triggered })),
      botFlows: botFlows.map((f) => ({ name: f.name, trigger: f.trigger, active: f.active, usersCount: f.usersCount, completionRate: f.completionRate })),
      crmTriggers: crmTriggers.map((t) => ({ event: t.event, action: t.action, status: t.status })),
      automationRules: automationRules.map((r) => ({ name: r.name, condition: r.condition, action: r.action, enabled: r.enabled, executions: r.executions }))
    };
  }

  if (on("team")) {
    context.team = agents.map((a) => ({
      name: a.name,
      role: a.role,
      status: a.status,
      assignedCount: a.assignedCount,
      resolvedCount: a.resolvedCount,
      avgResponseMins: a.avgResponseMins,
      csat: a.csat
    }));
  }

  if (on("employees")) {
    context.employees = {
      total: users.length,
      admins: users.filter((u) => u.role === "ADMIN").length,
      active: users.filter((u) => u.status === "ACTIVE").length,
      // Deliberately no password hashes or permission lists — neither helps
      // answer a question, and both are worth keeping out of a prompt.
      records: users.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        joinedAt: u.createdAt
      }))
    };
  }

  if (on("deal-stages")) {
    const byStage = dealStages.reduce((acc, r) => {
      acc[r.stage] ??= { total: 0, completed: 0, inProgress: 0 };
      acc[r.stage].total += 1;
      if (r.status === "COMPLETED") acc[r.stage].completed += 1;
      if (r.status === "IN_PROGRESS") acc[r.stage].inProgress += 1;
      return acc;
    }, {});

    context.dealProgression = {
      summaryByStage: byStage,
      records: dealStages.map((r) => ({
        lead: r.lead ? `${r.lead.name} (${r.lead.company})` : null,
        stage: r.stage,
        status: r.status,
        scheduledAt: r.scheduledAt,
        completedAt: r.completedAt,
        amount: r.amount,
        valuation: r.valuation,
        location: r.location,
        attendees: r.attendees,
        counterparty: r.counterparty,
        owner: r.owner,
        notes: r.notes
      }))
    };
  }

  if (on("market-signals")) {
    context.marketSignals = marketSignals.map((s) => ({
      entity: s.entityName,
      type: s.signalType,
      relevance: s.relevanceScore,
      summary: s.summary,
      source: s.source,
      status: s.status,
      capturedAt: s.createdAt
    }));
  }

  return context;
}
