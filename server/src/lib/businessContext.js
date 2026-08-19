import { prisma } from "../db.js";

const LEAD_STATUS_LABEL = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  NEGOTIATION: "Negotiation",
  CONVERTED: "Converted",
  LOST: "Lost"
};

// Pulls a full snapshot of the business from Postgres for the AI assistant to
// reason over. Kept as plain JSON (not a vector index / RAG pipeline) since
// the dataset is small enough to fit entirely in a single prompt.
export async function buildBusinessContext() {
  const [leads, contacts, conversations, templates, campaigns, dripSequences, autoReplyRules, botFlows, crmTriggers, automationRules, agents, account] =
    await Promise.all([
      prisma.lead.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.contact.findMany(),
      prisma.conversation.findMany({ include: { contact: true }, orderBy: { lastMessageAt: "desc" } }),
      prisma.template.findMany(),
      prisma.campaign.findMany({ include: { template: true } }),
      prisma.dripSequence.findMany(),
      prisma.autoReplyRule.findMany(),
      prisma.botFlow.findMany(),
      prisma.crmTrigger.findMany(),
      prisma.automationRule.findMany(),
      prisma.agent.findMany(),
      prisma.businessSettings.findFirst()
    ]);

  const leadsByStatus = leads.reduce((acc, l) => {
    const label = LEAD_STATUS_LABEL[l.status];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    company: account
      ? { name: account.displayName, category: account.category, phone: account.phone, status: account.status }
      : null,
    leads: {
      total: leads.length,
      qualifiedCount: leads.filter((l) => l.qualified).length,
      byStatus: leadsByStatus,
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
        createdAt: l.createdAt,
        updatedAt: l.updatedAt
      }))
    },
    whatsapp: {
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
    },
    team: agents.map((a) => ({
      name: a.name,
      role: a.role,
      status: a.status,
      assignedCount: a.assignedCount,
      resolvedCount: a.resolvedCount,
      avgResponseMins: a.avgResponseMins,
      csat: a.csat
    }))
  };
}
