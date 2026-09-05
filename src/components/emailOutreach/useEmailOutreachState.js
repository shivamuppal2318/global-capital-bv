import { useEffect, useState } from "react";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";
import { emailSegmentsApi } from "../../lib/emailSegmentsApi.js";
import { emailLeadsApi } from "../../lib/emailLeadsApi.js";
import { emailTemplatesApi } from "../../lib/emailTemplatesApi.js";
import { emailAccountsApi } from "../../lib/emailAccountsApi.js";
import { leadsApi } from "../../lib/leadsApi.js";
import { parseLeadsCsv } from "../../lib/csvLeads.js";

const SEED_CAMPAIGNS = [
  ["Q3 Renewables Founders — Benelux", "Sending", "1840", "61%", "18%", "7%"],
  ["Family Office Co-Invest Outreach", "Scheduled", "0", "0%", "0%", "0%"],
  ["Manufacturing Buyout Teaser", "Completed", "2960", "54%", "14%", "5%"],
  ["MENA Infrastructure Intro Sequence", "Draft", "0", "0%", "0%", "0%"]
];
const DEFAULT_CAMPAIGN_NAME = SEED_CAMPAIGNS[0][0];

// Single source of truth for "a blank, not-yet-saved campaign" — both
// CampaignsTab's "New Campaign" and AutomationTab's "New Drip Campaign"
// buttons reset to this (via startNewCampaign() below) instead of each
// keeping its own separate copy, which is exactly how the two drifted out
// of sync before: CampaignsTab reset the form on "New Campaign", but
// AutomationTab's equivalent button didn't reset anything at all, so
// opening a campaign then clicking "New Drip Campaign" silently carried
// that campaign's real settings into what looked like a fresh one.
const DEFAULT_AUTOMATION_FORM = {
  campaignName: DEFAULT_CAMPAIGN_NAME,
  audience: "Renewables founders",
  template: "Cold intro — Renewables founder",
  delayDays: "3",
  followUpCount: "3",
  dailyLimit: "2000",
  abTest: true,
  autoPause: true,
  replyType: "interested",
  preferredPath: "zoom-first",
  replyTo: "",
  subject: "",
  bodyHtml: "",
  segmentId: "",
  targetCampaignId: "",
  selectedLeadIds: [],
  scheduledAt: "",
  delayBetweenMinutes: "0"
};

function normalizeCampaigns(campaigns) {
  return campaigns.map(([name, status, sent, open, click, reply], index) => ({
    id: `${name}-${index}`,
    name,
    status,
    sent,
    open,
    click,
    reply
  }));
}

function buildAutomationSteps(campaignName, delayDays, followUpCount) {
  const baseLabel = campaignName.split("—")[0].trim();
  return Array.from({ length: followUpCount + 1 }, (_, index) => {
    const day = index * delayDays;
    if (index === 0) {
      return {
        title: `Day 0 · Intro email`,
        desc: `${baseLabel} intro with mandate fit and one-line credibility proof`
      };
    }

    return {
      title: `Day ${day} · Follow-up ${index}`,
      desc: index === 1 ? "Follow-up with sector teaser and CTA for interest." : "Reminder with proof-point and suggested next step."
    };
  });
}

// Reflects the SELECTED LEAD's actual tracked progress (ndaSignedAt,
// callStatus derived from Calendly webhooks / manual call-completed
// confirmation — see schema.prisma's EmailLead comments), not just the
// reply-type classification. The reply type decides which branch of steps
// applies — but "done" only shows once this lead's own data confirms it
// happened. Steps with no tracked field yet (data room, IOI/LOI) can only
// honestly show "pending" — there's nothing in EmailLead to confirm those
// completed.
function buildWorkflowSteps(flowState, lead) {
  const ndaDone = Boolean(lead?.ndaSignedAt);
  const zoomDone = lead?.callStatus === "completed";

  const steps = [
    {
      key: "outreach",
      title: "Outreach",
      desc: "Intro email with brochure and mandate summary.",
      state: "done"
    },
    {
      key: "interest",
      title: "Interest detected",
      desc: "Lead replied positively or asked for more details.",
      state: flowState.replyType === "no-reply" ? "pending" : "done"
    }
  ];

  // "Interested" (they mentioned NDA/signing) still goes through a Zoom
  // call before the NDA is actually sent — same as an explicit zoom-request
  // — a deliberate policy so every lead gets a human touchpoint before the
  // legal document goes out, even one who says they're ready to sign.
  if (flowState.replyType === "interested") {
    steps.push({
      key: "zoom1",
      title: "Schedule Zoom Call 1",
      desc: "Send booking link and confirm introductory Zoom meeting before the NDA.",
      state: zoomDone ? "done" : "current"
    });
    steps.push({
      key: "nda",
      title: "Send NDA e-signature",
      desc: "Auto-send NDA email and schedule up to 2 reminders, 3 working days apart.",
      state: ndaDone ? "done" : zoomDone ? "current" : "pending"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Ask for documents and trigger AI gap-check follow-up reminders.",
      state: ndaDone && zoomDone ? "current" : "pending"
    });
    steps.push({
      key: "ioi",
      title: "IOI / LOI follow-up",
      desc: "After complete data room, send IOI/LOI instruction email.",
      state: "pending"
    });
  } else if (flowState.replyType === "zoom-request") {
    steps.push({
      key: "zoom1",
      title: "Schedule Zoom Call 1 first",
      desc: "Lead prefers a meeting before NDA. Auto-send Zoom link and reminder email.",
      state: zoomDone ? "done" : "current"
    });
    steps.push({
      key: "nda-after-zoom",
      title: "Post-Zoom NDA email",
      desc: "After Zoom completion, send NDA and supporting deck automatically.",
      state: ndaDone ? "done" : zoomDone ? "current" : "pending"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Once NDA is signed, send data-room request and reminder flow.",
      state: ndaDone && zoomDone ? "current" : "pending"
    });
  } else if (flowState.replyType === "info-request") {
    steps.push({
      key: "info-pack",
      title: "Send info pack",
      desc: "Auto-reply with teaser, deck, and CTA asking for NDA or Zoom preference.",
      state: "current"
    });
    steps.push({
      key: "decision-branch",
      title: "Branch to NDA or Zoom",
      desc: "Based on their next reply, move them to NDA-first or Zoom-first path.",
      state: "pending"
    });
  } else {
    steps.push({
      key: "reminder-1",
      title: "Reminder 1",
      desc: "If no reply, send first reminder after configured delay.",
      state: "current"
    });
    steps.push({
      key: "reminder-2",
      title: "Reminder 2",
      desc: "If still no reply, send second reminder 3 working days later.",
      state: "pending"
    });
    steps.push({
      key: "close",
      title: "Mark cold / recycle",
      desc: "Stop emails and move lead to future re-engagement segment.",
      state: "pending"
    });
  }

  return steps;
}

function buildReplyAction(flowState) {
  // Even a lead who explicitly mentioned the NDA still gets a Zoom-booking
  // email first, not the NDA itself — see buildWorkflowSteps above for why.
  if (flowState.replyType === "interested") {
    return {
      subject: "Let's find 15 minutes before the NDA",
      body: "Great to hear you're ready to move forward. Before we send the NDA over, we like to do a quick intro call first — here's our Calendly link to pick a time: https://calendly.com/globalcapitalbv/intro-call. We'll cover mandate fit, then send the NDA and data-room checklist right after.",
      cta: "Send Calendly invite"
    };
  }

  if (flowState.replyType === "zoom-request") {
    return {
      subject: "Book an intro call",
      body: "Great to hear from you. Here is our Calendly link to book an introductory call at a time that works for you: https://calendly.com/globalcapitalbv/intro-call. We'll cover mandate fit and next steps before moving to NDA and diligence.",
      cta: "Send Calendly invite"
    };
  }

  if (flowState.replyType === "info-request") {
    return {
      subject: "Brochure, teaser, and next-step options",
      body: "Sharing the teaser and company overview. If aligned, we can either send the NDA directly or schedule a first Zoom call this week.",
      cta: "Send info pack"
    };
  }

  return {
    subject: "Final follow-up",
    body: "Just checking back on the note below. Happy to share the teaser again or close the loop if timing is not right.",
    cta: "Send reminder"
  };
}

export const replyRules = [
  { id: "nda", label: 'Reply contains "NDA"', keywords: ["nda", "sign"], replyType: "interested" },
  { id: "zoom", label: 'Reply contains "call/zoom"', keywords: ["zoom", "call", "meeting"], replyType: "zoom-request" },
  { id: "info", label: 'Reply contains "deck/details"', keywords: ["deck", "detail", "brochure", "info"], replyType: "info-request" }
];

function getStageFromReplyType(replyType) {
  // "interested" (even one who mentioned the NDA) and "zoom-request" both
  // land on the same next stage — a Zoom call happens before the NDA goes
  // out either way, see buildWorkflowSteps/buildReplyAction above.
  if (replyType === "interested" || replyType === "zoom-request") {
    return "Zoom 1 Pending";
  }
  if (replyType === "info-request") {
    return "Info Shared";
  }
  return "Reminder Pending";
}

// Every reply type now goes Zoom-first before any NDA is sent — kept as a
// named helper (rather than always setting the literal string "zoom-first")
// so the one real branch point (info-request/no-reply have no zoom step at
// all) stays legible at each call site below.
function preferredPathForReplyType(replyType) {
  return replyType === "interested" || replyType === "zoom-request" ? "zoom-first" : "nda-first";
}

// Backend enums are UPPER_SNAKE (Prisma ReplyType/EmailCampaignStatus); the
// frontend has always used lowercase-dash strings for reply types and
// Title Case for campaign status. Translate at the boundary.
const backendReplyTypeMap = {
  INTERESTED: "interested",
  ZOOM_REQUEST: "zoom-request",
  INFO_REQUEST: "info-request",
  // A genuine reply that didn't match any of the keyword rules above (e.g.
  // a plain "Ok") -- distinct from NO_REPLY (no reply at all), so it still
  // shows up as a real reply in the Inbox/Replies views instead of looking
  // like the lead never responded.
  OTHER: "other",
  NO_REPLY: "no-reply"
};

function backendReplyTypeToLocal(replyType) {
  return backendReplyTypeMap[replyType] ?? "no-reply";
}

const backendCampaignStatusMap = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  COMPLETED: "Completed"
};

export function backendCampaignStatusToLocal(status) {
  return backendCampaignStatusMap[status] ?? "Draft";
}

// Owns all state/effects/handlers for the email cold-outreach module
// (Campaigns tab + Leads tab) — shared between both tabs so they stay in
// sync on the same campaigns/leads/automation-form data, same reasoning as
// the rest of this app's per-module state hooks.
export function useEmailOutreachState({ demoData = true } = {}) {
  const initialCampaigns = demoData ? normalizeCampaigns(SEED_CAMPAIGNS) : [];
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaigns[0]?.id ?? null);
  // Starts empty — no fabricated demo leads. Populated for real by the
  // fetchLeads() effect below once the backend has actual replied leads
  // (from real inbound replies, or from clicking "Simulate reply" against
  // a real lead).
  const [repliedLeads, setRepliedLeads] = useState([]);
  // Every lead in the selected campaign, replied or not — repliedLeads
  // alone left a freshly-added lead invisible everywhere in the UI until
  // it replied, which read as "nothing happened" even though the backend
  // had genuinely saved it.
  const [allLeads, setAllLeads] = useState([]);
  // Keyed by EmailLead id — tracks the in-flight/last "Convert to Lead"
  // outcome per lead, same shape/pattern as CrmWorkspaceModule's
  // inviteResult (ok/sent/reason/inviteUrl or ok:false/error).
  const [convertingLeadId, setConvertingLeadId] = useState(null);
  const [convertResults, setConvertResults] = useState({});
  // null while loading — lets the UI show nothing rather than a wrong
  // "sending is off" banner for the split second before this resolves.
  const [systemStatus, setSystemStatus] = useState(null);
  // null = not tested this session yet; { pending: true } while in flight;
  // { success, message } once the backend responds.
  const [testConnectionResult, setTestConnectionResult] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [leadActivity, setLeadActivity] = useState({});
  const [templateDrafts, setTemplateDrafts] = useState({
    interested: {
      subject: "NDA & next steps — {{company}}",
      body: "Hi {{leadName}},\n\nThank you for the quick response — glad to hear {{company}} is aligned with the mandate.\n\nTo move forward, please review and sign our NDA here: {{ndaSignUrl}}\n\nOnce we have your signature on file, we'll unlock the next stage of diligence and share our data-room request checklist so we can move efficiently from here.\n\nHappy to jump on a call in parallel if that's useful — just let us know.\n\nBest regards,\nGlobal Capital BV"
    },
    "zoom-request": {
      subject: "Let's find time for an intro call",
      body: "Hi {{leadName}},\n\nThanks for getting back to us — happy to start with a quick call before any paperwork.\n\nYou can pick a time that works for you here: https://calendly.com/globalcapitalbv/intro-call\n\nOn the call, we'll cover mandate fit, where {{company}} sits versus our current thesis, and next steps if it looks like a good match. It should take about 20–30 minutes.\n\nLooking forward to speaking.\n\nBest regards,\nGlobal Capital BV"
    },
    "info-request": {
      subject: "Teaser, overview, and next steps for {{company}}",
      body: "Hi {{leadName}},\n\nThanks for your interest — please find our teaser and company overview attached for your review.\n\nIf the mandate looks like a fit once you've had a look, there are two ways to move forward from here: sign our NDA to unlock the full diligence materials, or schedule a short introductory call first to walk through fit and answer any questions.\n\nLet us know which works better and we'll get it set up right away.\n\nBest regards,\nGlobal Capital BV"
    },
    "no-reply": {
      subject: "Following up — still worth a look?",
      body: "Hi {{leadName}},\n\nJust circling back on my note below in case it slipped through — wanted to check whether this is still worth a look for {{company}}.\n\nHappy to re-share the teaser, answer any quick questions, or simply close the loop if the timing isn't right at the moment.\n\nEither way, thanks for taking a look.\n\nBest regards,\nGlobal Capital BV"
    }
  });

  // Load once on mount: if the backend has saved versions of these
  // templates, prefer them over the hardcoded defaults above.
  useEffect(() => {
    const templateKeys = ["interested", "zoom-request", "info-request", "no-reply"];
    templateKeys.forEach((key) => {
      emailTemplatesApi
        .get(key)
        .then((template) => {
          setTemplateDrafts((current) => ({
            ...current,
            [key]: { subject: template.subject, body: template.body }
          }));
        })
        .catch(() => {
          // No saved template for this key yet, or backend unreachable —
          // keep the local default.
        });
    });
  }, []);

  // Prefer the backend's real campaigns over the local seed table when
  // reachable — this is also what makes pause/resume actually work for
  // real, since the seed campaigns' synthesized ids never match real DB
  // ids. Open/click are real (aggregated server-side from the
  // ActivityLog rows the tracking pixel/click-redirect actually write).
  useEffect(() => {
    emailCampaignsApi
      .list()
      .then((backendCampaigns) => {
        const mapped = backendCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: backendCampaignStatusToLocal(campaign.status),
          // Was missing entirely — the "Sending mailbox" dropdown
          // (CampaignsTab.jsx) reads selectedCampaign.emailAccountId, so
          // without this a real, saved assignment would silently appear to
          // reset to "Default" on every reload even though the backend
          // still has it.
          emailAccountId: campaign.emailAccountId ?? null,
          // The rest of the campaign's real, saved settings — previously
          // dropped entirely here, which meant opening an existing campaign
          // in CampaignsTab/AutomationTab only ever populated its name, and
          // clicking Save would silently overwrite audience/dailyLimit/
          // delayDays/followUpCount/abTest/autoPause/replyTo with whatever
          // was already sitting in the form from a different campaign.
          audience: campaign.audience,
          template: campaign.template,
          dailyLimit: String(campaign.dailyLimit),
          delayDays: String(campaign.delayDays),
          followUpCount: String(campaign.followUpCount),
          abTest: campaign.abTest,
          autoPause: campaign.autoPause,
          replyTo: campaign.replyTo ?? "",
          subject: campaign.subject ?? "",
          bodyHtml: campaign.bodyHtml ?? "",
          sent: campaign.engagement?.sent ? String(campaign.engagement.sent) : "—",
          open: campaign.engagement?.openRate != null ? `${campaign.engagement.openRate}%` : "—",
          click: campaign.engagement?.clickRate != null ? `${campaign.engagement.clickRate}%` : "—",
          reply: "—",
          // Raw counts (not the display-formatted strings above) — kept
          // alongside them so the Dashboard tab can sum real totals across
          // campaigns instead of trying to add percentage strings together.
          leadCount: campaign._count?.leads ?? 0,
          sentCount: campaign.engagement?.sent ?? 0,
          openedCount: campaign.engagement?.opened ?? 0,
          clickedCount: campaign.engagement?.clicked ?? 0
        }));
        setCampaigns(mapped);
        setSelectedCampaignId(mapped[0]?.id ?? null);
      })
      .catch(() => {
        // Backend unreachable or no DB migrated yet — keep the current
        // state. Partner portal starts empty, so it never shows demo data.
      });
  }, []);

  // Real, saved lead segments (Segments tab) — the Dashboard's "Lists" stat
  // and "New List" action point at this, not a synthesized number, since
  // this is the actual reusable "named group of leads" concept the app has.
  const [segments, setSegments] = useState([]);
  useEffect(() => {
    emailSegmentsApi
      .list()
      .then(setSegments)
      .catch(() => {
        // Backend unreachable or no DB migrated yet — stays empty rather
        // than showing a fabricated count.
      });
  }, []);

  // Real aggregates for the Dashboard tab's chart/funnel/activity/mailbox
  // panels — a separate call (not derived from `campaigns`) since it needs
  // cross-campaign ActivityLog/EmailAccount queries the plain list doesn't
  // return. Null until it loads, so the Dashboard can show a loading state
  // instead of a flash of empty charts.
  const [dashboardSummary, setDashboardSummary] = useState(null);
  useEffect(() => {
    emailCampaignsApi
      .dashboardSummary()
      .then(setDashboardSummary)
      .catch(() => {
        // Backend unreachable or pre-migration — Dashboard tab falls back to
        // its own campaigns-only totals.
      });
  }, []);

  // Same pattern for leads: only overwrite the seed repliedLeads list if
  // the backend actually returned something with at least one reply on
  // record, so an empty/fresh database doesn't wipe out the demo data.
  useEffect(() => {
    emailLeadsApi
      .list()
      .then((backendLeads) => {
        const replied = backendLeads.filter((lead) => lead.replyType !== "NO_REPLY");
        const mapped = replied.map((lead) => {
          const localReplyType = backendReplyTypeToLocal(lead.replyType);
          return {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            email: lead.email,
            country: lead.country,
            campaign: lead.campaign?.name ?? "",
            replyType: localReplyType,
            replyPreview: "Reply received — see activity timeline for the full message.",
            lastReplyAt: new Date(lead.updatedAt).toLocaleString(),
            owner: lead.owner,
            movedToWorkflow: true,
            stage: lead.stage,
            bounced: lead.bounced,
            unsubscribed: lead.unsubscribed,
            ndaSignedAt: lead.ndaSignedAt,
            convertedToLeadId: lead.convertedToLeadId,
            callStatus: lead.callCanceledAt
              ? "canceled"
              : lead.callCompletedAt
                ? "completed"
                : lead.callBookedAt
                  ? "booked"
                  : null
          };
        });
        setRepliedLeads(mapped);
        setSelectedLeadId(mapped[0]?.id ?? null);
        if (!mapped.length) {
          return;
        }
        // Without this, the "Next automated email" panel showed whatever
        // replyType/preferredPath the form happened to default to (always
        // "interested"/"nda-first") rather than the auto-selected lead's
        // actual reply — e.g. a zoom-request lead loaded with an NDA draft
        // and the wrong workflow steps until manually re-clicked.
        setAutomationForm((current) => ({
          ...current,
          campaignName: mapped[0].campaign,
          replyType: mapped[0].replyType,
          preferredPath: preferredPathForReplyType(mapped[0].replyType)
        }));
      })
      .catch(() => {
        // Backend unreachable — repliedLeads stays empty rather than
        // showing fabricated leads.
      });
  }, []);

  function loadAllLeadsForCampaign(campaignId) {
    if (!campaignId) {
      setAllLeads([]);
      return;
    }
    emailLeadsApi
      .list(campaignId)
      .then((leads) => setAllLeads(leads))
      .catch(() => {
        // Backend unreachable — leave whatever was already loaded.
      });
  }

  // Re-fetches whenever the selected campaign changes — including the
  // switch from the local seed id to the real backend id once campaigns
  // finish loading above, which is what makes this correct on first mount
  // too, not just when the user later picks a different campaign.
  useEffect(() => {
    loadAllLeadsForCampaign(selectedCampaignId);
  }, [selectedCampaignId]);

  // Refresh the activity timeline from the backend whenever the selected
  // lead changes.
  useEffect(() => {
    if (!selectedLeadId) {
      return;
    }
    emailLeadsApi
      .activity(selectedLeadId)
      .then((backendActivity) => {
        if (!backendActivity.length) {
          return;
        }
        const mapped = backendActivity.map((entry) => ({
          at: new Date(entry.createdAt).toLocaleString(),
          title: entry.title,
          detail: entry.detail
        }));
        setLeadActivity((current) => ({ ...current, [selectedLeadId]: mapped }));
      })
      .catch(() => {
        // Keep whatever's already in local leadActivity for this lead.
      });
  }, [selectedLeadId]);

  const [automationForm, setAutomationForm] = useState(DEFAULT_AUTOMATION_FORM);
  const [automationNotice, setAutomationNotice] = useState("Automation ready. Select a campaign or create a new one.");

  // A separate list of leads, only populated when "Send To" is redirected
  // to a different List than the one being composed in (targetCampaignId)
  // — kept apart from allLeads above so switching the send target doesn't
  // clobber the composed campaign's own leads elsewhere in the UI.
  const [targetListLeads, setTargetListLeads] = useState([]);
  useEffect(() => {
    const targetId = automationForm.targetCampaignId;
    if (!targetId || targetId === selectedCampaignId) {
      setTargetListLeads([]);
      return;
    }
    emailLeadsApi
      .list(targetId)
      .then(setTargetListLeads)
      .catch(() => setTargetListLeads([]));
  }, [automationForm.targetCampaignId, selectedCampaignId]);

  // Switching which List this composed email sends to also clears any
  // manually-picked specific leads — those ids belonged to the previous
  // target's own lead set and would silently mismatch the new one.
  function handleChangeSendTarget(campaignId) {
    setAutomationForm((current) => ({ ...current, targetCampaignId: campaignId, selectedLeadIds: [] }));
  }
  const [newLeadForm, setNewLeadForm] = useState({ name: "", company: "", email: "", country: "" });
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvImportBusy, setCsvImportBusy] = useState(false);
  const [csvPreviewBusy, setCsvPreviewBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [newAccountForm, setNewAccountForm] = useState({
    label: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    fromAddress: "",
    dailyLimit: "500",
    country: ""
  });

  // Load once on mount — falls back to an empty list (the "add a mailbox"
  // form still works standalone) if the backend's unreachable.
  useEffect(() => {
    emailAccountsApi
      .list()
      .then((accounts) => setEmailAccounts(accounts))
      .catch(() => {
        // Backend unreachable — leave the list empty rather than erroring.
      });
  }, []);

  useEffect(() => {
    emailCampaignsApi
      .systemStatus()
      .then((status) => setSystemStatus(status))
      .catch(() => {
        // Backend unreachable — no banner rather than a wrong one.
      });
  }, []);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0];
  const selectedLead = repliedLeads.find((lead) => lead.id === selectedLeadId) ?? repliedLeads[0];
  const selectedLeadTimeline = selectedLead ? leadActivity[selectedLead.id] ?? [] : [];
  const activeReplyRule = replyRules.find((rule) => rule.replyType === automationForm.replyType) ?? null;

  const liveSteps = buildAutomationSteps(
    automationForm.campaignName,
    Number(automationForm.delayDays) || 3,
    Number(automationForm.followUpCount) || 3
  );
  const workflowSteps = buildWorkflowSteps(automationForm, selectedLead);
  const defaultReplyAction = buildReplyAction(automationForm);
  const replyAction = {
    ...defaultReplyAction,
    subject: templateDrafts[automationForm.replyType]?.subject ?? defaultReplyAction.subject,
    body: templateDrafts[automationForm.replyType]?.body ?? defaultReplyAction.body
  };

  function handleFormChange(key, value) {
    setAutomationForm((current) => ({ ...current, [key]: value }));
  }

  function handleApplyRule(rule) {
    const nextPreferredPath = preferredPathForReplyType(rule.replyType);
    setAutomationForm((current) => ({
      ...current,
      replyType: rule.replyType,
      preferredPath: nextPreferredPath
    }));
    setAutomationNotice(`Rule applied: ${rule.label} → classified as "${rule.replyType}".`);
  }

  function loadLeadIntoWorkflow(lead) {
    setSelectedLeadId(lead.id);
    setAutomationForm((current) => ({
      ...current,
      campaignName: lead.campaign,
      replyType: lead.replyType,
      preferredPath: preferredPathForReplyType(lead.replyType)
    }));
    setAutomationNotice(`Loaded ${lead.name}'s reply into the follow-up panel.`);
  }

  async function handleDeleteLead(lead) {
    try {
      await emailLeadsApi.remove(lead.id);
      setRepliedLeads((current) => current.filter((l) => l.id !== lead.id));
      setAllLeads((current) => current.filter((l) => l.id !== lead.id));
      if (selectedLeadId === lead.id) {
        setSelectedLeadId(null);
      }
      setAutomationNotice(`${lead.name} (${lead.company}) deleted.`);
    } catch (error) {
      setAutomationNotice(`Could not delete ${lead.name} (${error.message}).`);
    }
  }

  // Turns this cold-outreach reply into a real CRM Lead and, in the same
  // step, sends them the client portal registration link — see
  // POST /api/leads/from-email-lead/:emailLeadId. The portal invite only
  // fires here, not on the original cold email, since there's no deal to
  // show progress on until a Lead (and its deal stages) actually exists.
  async function handleConvertToLead(lead) {
    setConvertingLeadId(lead.id);
    setConvertResults((current) => ({ ...current, [lead.id]: null }));
    try {
      const result = await leadsApi.convertFromEmailLead(lead.id);
      setConvertResults((current) => ({ ...current, [lead.id]: { ok: true, ...result } }));
      setRepliedLeads((current) =>
        current.map((l) => (l.id === lead.id ? { ...l, convertedToLeadId: result.lead.id } : l))
      );
    } catch (error) {
      setConvertResults((current) => ({ ...current, [lead.id]: { ok: false, error: error.message } }));
    } finally {
      setConvertingLeadId(null);
    }
  }

  async function handleToggleCampaignStatus() {
    if (!selectedCampaign) {
      return;
    }

    const nextStatus = selectedCampaign.status === "Sending" ? "Scheduled" : "Sending";

    try {
      if (nextStatus === "Sending") {
        await emailCampaignsApi.resume(selectedCampaign.id);
      } else {
        await emailCampaignsApi.pause(selectedCampaign.id);
      }
      setAutomationNotice(
        nextStatus === "Sending"
          ? `${selectedCampaign.name} resumed via the backend and is now sending.`
          : `${selectedCampaign.name} paused via the backend and moved back to scheduled.`
      );
      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === selectedCampaign.id ? { ...campaign, status: nextStatus } : campaign))
      );
    } catch (error) {
      // No local-only fallback — a status change that only exists in this
      // browser tab isn't real, so don't pretend it happened.
      setAutomationNotice(`Could not ${nextStatus === "Sending" ? "resume" : "pause"} "${selectedCampaign.name}" via the backend (${error.message}).`);
    }
  }

  async function handleAddLead() {
    if (!newLeadForm.name || !newLeadForm.company || !newLeadForm.email) {
      setAutomationNotice("Fill in name, company, and email before adding a lead.");
      return;
    }
    // Same pattern as the CSV path (csvLeads.js) — catches a typo'd email
    // before it reaches the backend, whose own validation error message
    // isn't a plain string and wouldn't display cleanly here.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newLeadForm.email)) {
      setAutomationNotice(`"${newLeadForm.email}" doesn't look like a valid email address.`);
      return;
    }
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    try {
      const result = await emailLeadsApi.create({
        name: newLeadForm.name,
        company: newLeadForm.company,
        email: newLeadForm.email,
        owner: "Rahul R",
        campaignId: selectedCampaign.id,
        country: newLeadForm.country.trim() || null
      });
      setAutomationNotice(
        result.cadenceScheduled > 0
          ? `${newLeadForm.name} added to "${selectedCampaign.name}" — ${result.cadenceScheduled} follow-up step(s) scheduled.`
          : `${newLeadForm.name} added to "${selectedCampaign.name}". No follow-up emails scheduled yet (this campaign has none set up, or the sending queue isn't running) — the lead was still saved.`
      );
      setNewLeadForm({ name: "", company: "", email: "", country: "" });
      loadAllLeadsForCampaign(selectedCampaign.id);
    } catch (error) {
      // The backend 409s on a duplicate (same email already in this
      // campaign) and 422s on an email that fails real DNS deliverability
      // checks (see server/src/lib/emailValidation.js) — both surfaced as
      // their own case so neither reads like a generic backend failure.
      if (error.message.includes("already in this campaign")) {
        setAutomationNotice(`${newLeadForm.email} is already in "${selectedCampaign.name}" — not added again.`);
      } else if (error.message.includes("looks undeliverable")) {
        setAutomationNotice(error.message);
      } else {
        setAutomationNotice(`Could not add lead via the backend (${error.message}). No local-only fallback for this action.`);
      }
    }
  }

  // Shows what will happen BEFORE anything is sent to the backend: parses the
  // pasted CSV client-side and cross-checks every row's email against leads
  // already loaded for this campaign (allLeads) and against the rest of the
  // pasted batch, so duplicates and bad rows are visible up front instead of
  // only surfacing afterward in a single collapsed notice line.
  async function handlePreviewCsv() {
    if (!csvText.trim()) {
      setAutomationNotice("Paste some CSV rows first.");
      return;
    }
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    const { rows, errors } = parseLeadsCsv(csvText);
    const existingEmails = new Set(allLeads.map((lead) => lead.email.toLowerCase()));
    const seenInFile = new Set();
    const previewRows = [];

    errors.forEach((message) => {
      previewRows.push({ name: "", company: "", email: "", owner: "", status: "invalid", reason: message });
    });

    rows.forEach((row) => {
      const emailKey = row.email.toLowerCase();
      let status = "ready";
      let reason = "Ready to import";
      if (seenInFile.has(emailKey)) {
        status = "duplicate-in-file";
        reason = "Duplicate email earlier in this same paste.";
      } else if (existingEmails.has(emailKey)) {
        status = "duplicate-existing";
        reason = `Already in "${selectedCampaign.name}".`;
      }
      seenInFile.add(emailKey);
      previewRows.push({ ...row, status, reason });
    });

    // Format/duplicate checks above are instant and local; a real
    // deliverability check (DNS MX/A/AAAA lookup) needs the backend, so it
    // only runs for rows that passed those free checks — no point DNS
    // -checking an email that's already going to be skipped as a duplicate.
    setCsvPreviewBusy(true);
    try {
      const candidateRows = previewRows.filter((row) => row.status === "ready");
      if (candidateRows.length > 0) {
        const { results } = await emailLeadsApi.validateEmails(candidateRows.map((row) => row.email));
        const deliverabilityByEmail = new Map(results.map((result) => [result.email.toLowerCase(), result]));
        previewRows.forEach((row) => {
          if (row.status !== "ready") return;
          const deliverability = deliverabilityByEmail.get(row.email.toLowerCase());
          if (deliverability && !deliverability.valid) {
            row.status = "invalid";
            row.reason = deliverability.reason;
          }
        });
      }
    } catch (error) {
      setAutomationNotice(`Preview built, but the deliverability check failed (${error.message}) — showing format/duplicate checks only.`);
    } finally {
      setCsvPreviewBusy(false);
    }

    const readyCount = previewRows.filter((row) => row.status === "ready").length;
    const duplicateCount = previewRows.filter((row) => row.status === "duplicate-in-file" || row.status === "duplicate-existing").length;
    const invalidCount = previewRows.filter((row) => row.status === "invalid").length;

    setCsvPreview({ rows: previewRows, readyCount, duplicateCount, invalidCount });
    setAutomationNotice(
      `Preview ready: ${readyCount} row(s) will be imported, ${duplicateCount} duplicate(s) and ${invalidCount} invalid row(s) will be skipped.`
    );
  }

  async function handleImportCsv() {
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    // If nothing's been previewed yet, build one first instead of importing
    // blind — the user always sees the row-by-row breakdown before anything
    // is created.
    if (!csvPreview) {
      handlePreviewCsv();
      return;
    }

    const readyRows = csvPreview.rows
      .filter((row) => row.status === "ready")
      .map(({ name, company, email, owner, country }) => ({ name, company, email, owner, country: country || null }));
    if (readyRows.length === 0) {
      setAutomationNotice("Nothing to import — every row was a duplicate or invalid. Fix the CSV and preview again.");
      return;
    }

    setCsvImportBusy(true);
    try {
      const result = await emailLeadsApi.bulkCreate(selectedCampaign.id, readyRows);
      const duplicateNote = result.duplicateCount ? `, ${result.duplicateCount} already in this campaign (skipped)` : "";
      // Should normally be 0 here — the preview step already DNS-checked
      // every "ready" row — but the backend re-validates independently at
      // import time regardless (see POST /bulk), so this stays honest if
      // something changed between preview and import (e.g. a domain's DNS
      // dropped its MX record in the meantime).
      const invalidNote = result.invalidCount ? `, ${result.invalidCount} failed a deliverability re-check (skipped)` : "";
      setAutomationNotice(
        `CSV import: ${result.createdCount} lead(s) added to "${selectedCampaign.name}"${duplicateNote}${invalidNote}, ${result.failedCount} failed on the backend.`
      );
      setCsvText("");
      setCsvPreview(null);
      loadAllLeadsForCampaign(selectedCampaign.id);
    } catch (error) {
      setAutomationNotice(`CSV import failed via the backend (${error.message}). No local-only fallback for this action.`);
    } finally {
      setCsvImportBusy(false);
    }
  }

  function handleCsvTextChange(value) {
    setCsvText(value);
    // A preview describes an exact snapshot of the pasted text — once the
    // text changes, that snapshot is stale and must be rebuilt before import.
    setCsvPreview(null);
    setAutomationNotice(value.trim() ? "CSV loaded. Click Preview CSV to check rows before import." : "");
  }

  async function handleAddEmailAccount() {
    const { label, smtpHost, smtpUser, smtpPass, fromAddress } = newAccountForm;
    if (!label || !smtpHost || !smtpUser || !smtpPass || !fromAddress) {
      setAutomationNotice("Fill in label, host, user, password, and from-address before adding a mailbox.");
      return;
    }

    try {
      const account = await emailAccountsApi.create({
        label,
        smtpHost,
        smtpPort: Number(newAccountForm.smtpPort) || 587,
        smtpSecure: newAccountForm.smtpSecure,
        smtpUser,
        smtpPass,
        fromAddress,
        dailyLimit: Number(newAccountForm.dailyLimit) || 500,
        country: newAccountForm.country.trim() || null
      });
      setEmailAccounts((current) => [...current, account]);
      setNewAccountForm({
        label: "",
        smtpHost: "",
        smtpPort: "587",
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        fromAddress: "",
        dailyLimit: "500",
        country: ""
      });
      setAutomationNotice(`Mailbox "${account.label}" added — assign it to a campaign below.`);
    } catch (error) {
      setAutomationNotice(`Could not add mailbox via the backend (${error.message}). No local-only fallback for this action.`);
    }
  }

  async function handleAssignAccountToCampaign(event) {
    const emailAccountId = event.target.value || null;
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    try {
      const updated = await emailCampaignsApi.assignEmailAccount(selectedCampaign.id, emailAccountId);
      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === selectedCampaign.id ? { ...campaign, emailAccountId: updated.emailAccountId } : campaign))
      );
      const account = emailAccounts.find((acc) => acc.id === emailAccountId);
      setAutomationNotice(
        emailAccountId
          ? `"${selectedCampaign.name}" now sends through "${account?.label ?? emailAccountId}".`
          : `"${selectedCampaign.name}" reverted to the default mailbox.`
      );
    } catch (error) {
      setAutomationNotice(`Could not assign mailbox via the backend (${error.message}).`);
    }
  }

  async function handleDeactivateAccount(accountId) {
    try {
      await emailAccountsApi.deactivate(accountId);
      setEmailAccounts((current) => current.map((acc) => (acc.id === accountId ? { ...acc, isActive: false } : acc)));
      setAutomationNotice("Mailbox deactivated.");
    } catch (error) {
      setAutomationNotice(`Could not deactivate mailbox via the backend (${error.message}).`);
    }
  }

  async function handleTestConnection() {
    setTestConnectionResult({ pending: true });
    try {
      const result = await emailCampaignsApi.testConnection();
      setTestConnectionResult(result);
    } catch (error) {
      setTestConnectionResult({ success: false, message: error.message });
    }
  }

  // The one place that selects a campaign AND loads its real saved settings
  // into the form — used by CampaignsTab's own row-open action, and by
  // LeadsTab's "Open" (which used to only call setSelectedCampaignId,
  // leaving automationForm showing whichever OTHER campaign's
  // name/subject/body was last edited — a real, confusing bug: the leads
  // checklist and breadcrumb would correctly show the newly-opened
  // campaign while the Campaign Name/Subject fields still showed the
  // previous one's stale values, and Save would silently create a
  // duplicate instead of updating either).
  function selectCampaign(campaign) {
    setSelectedCampaignId(campaign.id);
    setAutomationForm((current) => ({
      ...current,
      campaignName: campaign.name,
      audience: campaign.audience,
      template: campaign.template,
      dailyLimit: campaign.dailyLimit,
      delayDays: campaign.delayDays,
      followUpCount: campaign.followUpCount,
      abTest: campaign.abTest,
      autoPause: campaign.autoPause,
      replyTo: campaign.replyTo ?? "",
      subject: campaign.subject ?? "",
      bodyHtml: campaign.bodyHtml ?? "",
      segmentId: "",
      targetCampaignId: "",
      selectedLeadIds: [],
      scheduledAt: "",
      delayBetweenMinutes: "0"
    }));
  }

  // Shared by CampaignsTab's "New Campaign" and AutomationTab's "New Drip
  // Campaign" buttons — see DEFAULT_AUTOMATION_FORM above for why this is
  // one function instead of each tab resetting its own way.
  function startNewCampaign() {
    setSelectedCampaignId(null);
    // Blank, not DEFAULT_AUTOMATION_FORM's seed name — pre-filling a new
    // campaign with an existing real campaign's exact name invites an
    // accidental duplicate-named campaign, even though it can't silently
    // edit that other campaign (selectedCampaignId is null here, so
    // handleSaveAutomation's isEditingSelected check can't match it).
    setAutomationForm({ ...DEFAULT_AUTOMATION_FORM, campaignName: "" });
  }

  // A List is the same EmailCampaign record a Campaign is — just created
  // from the Leads tab's own "New List" form instead of the Campaigns tab's
  // composer. This one-shot signal is how the Dashboard's "New List" Quick
  // Action gets there in one click: LeadsTab's own viewMode is local state
  // (there's no other way for a different tab to reach into it), so this
  // tells it to switch to "form" once, then clears itself.
  const [leadsViewSignal, setLeadsViewSignal] = useState(null);
  function startNewList() {
    startNewCampaign();
    setLeadsViewSignal("form");
  }

  async function handleSaveAutomation() {
    const followUpCount = Number(automationForm.followUpCount) || 3;
    const dailyLimit = Number(automationForm.dailyLimit) || 2000;
    const delayDays = Number(automationForm.delayDays) || 3;
    const payload = {
      audience: automationForm.audience,
      template: automationForm.template,
      dailyLimit,
      delayDays,
      followUpCount,
      abTest: automationForm.abTest,
      autoPause: automationForm.autoPause,
      replyTo: automationForm.replyTo?.trim() || null,
      subject: automationForm.subject?.trim() || null,
      bodyHtml: automationForm.bodyHtml?.trim() || null
    };

    // The campaign name still matching the currently-selected (already
    // real, backend-loaded) campaign means the user is tweaking its
    // settings, not starting a new one — update it in place instead of
    // creating a same-name duplicate row. No local-only fallback either
    // way — a campaign that only exists in this browser tab can't
    // actually send anything.
    const isEditingSelected = selectedCampaign && selectedCampaign.name === automationForm.campaignName;

    try {
      if (isEditingSelected) {
        const campaign = await emailCampaignsApi.update(selectedCampaign.id, payload);
        setCampaigns((current) => current.map((c) => (c.id === campaign.id ? { ...c, ...payload } : c)));
        setAutomationNotice(`"${campaign.name}" updated on the backend — ${followUpCount + 1} follow-up emails, ${dailyLimit}/day limit.`);
        return campaign;
      }

      const campaign = await emailCampaignsApi.create({ name: automationForm.campaignName, ...payload });
      const mapped = {
        id: campaign.id,
        name: campaign.name,
        status: backendCampaignStatusToLocal(campaign.status),
        emailAccountId: campaign.emailAccountId ?? null,
        subject: campaign.subject ?? "",
        bodyHtml: campaign.bodyHtml ?? "",
        sent: "—",
        open: "—",
        click: "—",
        reply: "—"
      };

      setCampaigns((current) => [mapped, ...current]);
      setSelectedCampaignId(mapped.id);
      setAutomationNotice(
        `"${mapped.name}" saved to the backend — ${followUpCount + 1} follow-up emails, ${dailyLimit}/day limit. Note: no leads are enrolled yet.`
      );
      // Returned so a caller (e.g. LeadsTab's "New List" form) can tell a
      // brand-new list was actually created and navigate straight to
      // managing its subscribers, instead of leaving the user stranded on
      // this same settings form with no obvious next step.
      return mapped;
    } catch (error) {
      setAutomationNotice(`Could not save "${automationForm.campaignName}" — backend unreachable (${error.message}).`);
      return null;
    }
  }

  // Sends the selected campaign's own composed subject/bodyHtml to its own
  // leads, optionally narrowed by a Segment. Saves the form first — so
  // Send Now always sends exactly what's currently typed, not whatever was
  // last saved — same reasoning as isEditingSelected in
  // handleSaveAutomation. No local-only fallback: nothing genuine to send
  // without the backend.
  async function handleSendNow() {
    if (!selectedCampaign) {
      setAutomationNotice("Select or save a campaign first.");
      return;
    }
    if (!automationForm.subject?.trim() || !automationForm.bodyHtml?.trim()) {
      setAutomationNotice("Add a subject and body before sending.");
      return;
    }

    const saved = await handleSaveAutomation();
    if (!saved) {
      setAutomationNotice(`Could not save "${selectedCampaign.name}" before sending — nothing was sent.`);
      return;
    }

    try {
      const targetCampaignId = automationForm.targetCampaignId && automationForm.targetCampaignId !== saved.id
        ? automationForm.targetCampaignId
        : null;
      const targetName = targetCampaignId ? campaigns.find((c) => c.id === targetCampaignId)?.name : null;
      const sentToLabel = targetName ? `"${saved.name}" → "${targetName}"` : `"${saved.name}"`;

      const result = await emailCampaignsApi.sendNow(saved.id, {
        // Picking specific leads overrides the segment/all-leads/target-list
        // choice — see toggleLeadSelection in CampaignsTab.jsx.
        leadIds: automationForm.selectedLeadIds?.length ? automationForm.selectedLeadIds : undefined,
        segmentId: automationForm.segmentId || null,
        targetCampaignId,
        scheduledAt: automationForm.scheduledAt ? new Date(automationForm.scheduledAt).toISOString() : null,
        delayBetweenMinutes: Number(automationForm.delayBetweenMinutes) || 0
      });

      if (result.queued > 0) {
        setAutomationNotice(
          result.scheduled
            ? `${sentToLabel}: ${result.queued} email(s) scheduled.`
            : `${sentToLabel}: ${result.queued} email(s) queued to send now.`
        );
      } else if (result.sentImmediately > 0 || result.failed > 0) {
        setAutomationNotice(
          `${sentToLabel}: ${result.sentImmediately} sent immediately, ${result.failed} failed (sending queue is disabled — no delay throttle was applied).`
        );
      } else {
        setAutomationNotice(result.message ?? `${sentToLabel}: nothing was sent.`);
      }
    } catch (error) {
      setAutomationNotice(`Could not send "${saved.name}" — ${error.message}`);
    }
  }

  async function handleSendNextEmail() {
    if (!selectedLead) {
      return;
    }

    const nextStage = getStageFromReplyType(automationForm.replyType);

    // Two-tier: prefer sending via the saved Template (backend applies
    // merge fields, branded HTML, unsubscribe link, deliverability checks
    // automatically) → fall back to the hand-edited subject/body if no
    // template exists for this reply type or that call fails for some
    // other reason. No local-only fallback if both real sends fail — CRM
    // state below only updates once an email has actually gone out.
    let sendDetail;
    try {
      await emailLeadsApi.sendTemplate(selectedLead.id, automationForm.replyType);
      sendDetail = `Sent via backend using template "${automationForm.replyType}". CRM updated to ${nextStage}.`;
      setAutomationNotice(
        `${replyAction.cta} sent to ${selectedLead.name} (${selectedLead.company}) via the "${automationForm.replyType}" template. CRM moved to ${nextStage}.`
      );
    } catch (templateError) {
      try {
        await emailLeadsApi.send(selectedLead.id, { subject: replyAction.subject, body: replyAction.body });
        sendDetail = `Sent via backend email provider (raw subject/body, template send failed: ${templateError.message}). CRM updated to ${nextStage}.`;
        setAutomationNotice(`${replyAction.cta} sent to ${selectedLead.name} (${selectedLead.company}) via the backend. CRM moved to ${nextStage}.`);
      } catch (error) {
        setAutomationNotice(
          `Could not send "${replyAction.cta}" to ${selectedLead.name} (${selectedLead.company}) — backend unreachable (${error.message}). Nothing was sent, CRM unchanged.`
        );
        return;
      }
    }

    setRepliedLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id
          ? {
              ...lead,
              movedToWorkflow: true,
              lastReplyAt: "Queued just now",
              stage: nextStage,
              replyType: automationForm.replyType
            }
          : lead
      )
    );
    setLeadActivity((current) => ({
      ...current,
      [selectedLead.id]: [
        {
          at: new Date().toLocaleString(),
          title: replyAction.cta,
          detail: sendDetail
        },
        ...(current[selectedLead.id] ?? [])
      ]
    }));
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.name === selectedLead.campaign
          ? {
              ...campaign,
              reply: `${Math.min(15, Number.parseInt(campaign.reply, 10) + 1)}%`
            }
          : campaign
      )
    );
  }

  async function handlePreviewTemplate() {
    const templateKey = automationForm.replyType;
    try {
      const rendered = await emailTemplatesApi.preview(templateKey);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setAutomationNotice(`Could not load a preview for "${templateKey}" (${error.message}).`);
    }
  }

  async function simulateIncomingReply() {
    const sampleReplyTexts = [
      "This looks relevant. Please share the NDA so we can sign and move forward.",
      "Can we do a short Zoom call first next week before paperwork?",
      "Please send more information and the brochure/deck."
    ];
    const replyPreview = sampleReplyTexts[repliedLeads.length % sampleReplyTexts.length];

    // Classifies a reply against the selected lead through the actual
    // backend (same rule engine as the UI's chips, run server-side). No
    // local-only fallback: without a selected real lead or a reachable
    // backend, there's nothing genuine to simulate.
    if (!selectedLead) {
      setAutomationNotice("Select a lead first — there's no real lead to simulate a reply for.");
      return;
    }

    try {
      const result = await emailLeadsApi.simulateReply(selectedLead.id, replyPreview);
      const localReplyType = backendReplyTypeToLocal(result.replyType);
      const nextPreferredPath = preferredPathForReplyType(localReplyType);
      const nextStage = getStageFromReplyType(localReplyType);

      setRepliedLeads((current) =>
        current.map((lead) =>
          lead.id === selectedLead.id
            ? { ...lead, replyType: localReplyType, replyPreview, lastReplyAt: "Today · Just now", stage: nextStage, movedToWorkflow: true }
            : lead
        )
      );
      setLeadActivity((current) => ({
        ...current,
        [selectedLead.id]: [
          { at: new Date().toLocaleString(), title: "Reply received (classified via backend)", detail: replyPreview },
          ...(current[selectedLead.id] ?? [])
        ]
      }));
      setAutomationForm((current) => ({
        ...current,
        campaignName: selectedLead.campaign,
        replyType: localReplyType,
        preferredPath: nextPreferredPath
      }));
      setAutomationNotice(`${selectedLead.company} replied — classified by the backend as "${localReplyType}".`);
    } catch (error) {
      setAutomationNotice(`Could not classify a reply for ${selectedLead.company} — backend unreachable (${error.message}).`);
    }
  }

  return {
    campaigns, segments, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    repliedLeads, allLeads, targetListLeads, handleChangeSendTarget, systemStatus, dashboardSummary, testConnectionResult, handleTestConnection, selectedLeadId, leadActivity,
    automationForm, automationNotice, newLeadForm, setNewLeadForm,
    csvText, handleCsvTextChange, csvPreview, handlePreviewCsv, csvImportBusy, csvPreviewBusy, previewHtml, setPreviewHtml,
    emailAccounts, newAccountForm, setNewAccountForm,
    selectedCampaign, selectedLead, selectedLeadTimeline, activeReplyRule,
    liveSteps, workflowSteps, replyAction,
    convertingLeadId, convertResults, handleConvertToLead,
    handleFormChange, handleApplyRule, loadLeadIntoWorkflow, handleDeleteLead,
    handleToggleCampaignStatus, handleAddLead, handleImportCsv, handleAddEmailAccount,
    handleAssignAccountToCampaign, handleDeactivateAccount, handleSaveAutomation, handleSendNow, selectCampaign, startNewCampaign,
    startNewList, leadsViewSignal, setLeadsViewSignal,
    handleSendNextEmail, handlePreviewTemplate, simulateIncomingReply
  };
}
