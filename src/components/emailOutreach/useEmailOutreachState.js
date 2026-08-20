import { useEffect, useState } from "react";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";
import { emailLeadsApi } from "../../lib/emailLeadsApi.js";
import { emailTemplatesApi } from "../../lib/emailTemplatesApi.js";
import { emailAccountsApi } from "../../lib/emailAccountsApi.js";
import { parseLeadsCsv } from "../../lib/csvLeads.js";

const SEED_CAMPAIGNS = [
  ["Q3 Renewables Founders — Benelux", "Sending", "1840", "61%", "18%", "7%"],
  ["Family Office Co-Invest Outreach", "Scheduled", "0", "0%", "0%", "0%"],
  ["Manufacturing Buyout Teaser", "Completed", "2960", "54%", "14%", "5%"],
  ["MENA Infrastructure Intro Sequence", "Draft", "0", "0%", "0%", "0%"]
];
const DEFAULT_CAMPAIGN_NAME = SEED_CAMPAIGNS[0][0];

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

function buildWorkflowSteps(flowState) {
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

  if (flowState.replyType === "interested") {
    steps.push({
      key: "nda",
      title: "Send NDA e-signature",
      desc: "Auto-send NDA email and schedule up to 2 reminders, 3 working days apart.",
      state: "done"
    });
    steps.push({
      key: "zoom1",
      title: "Schedule Zoom Call 1",
      desc: "Send booking link and confirm introductory Zoom meeting.",
      state: flowState.preferredPath === "zoom-first" ? "done" : "current"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Ask for documents and trigger AI gap-check follow-up reminders.",
      state: flowState.preferredPath === "nda-first" ? "current" : "pending"
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
      state: "current"
    });
    steps.push({
      key: "nda-after-zoom",
      title: "Post-Zoom NDA email",
      desc: "After Zoom completion, send NDA and supporting deck automatically.",
      state: "pending"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Once NDA is signed, send data-room request and reminder flow.",
      state: "pending"
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
  if (flowState.replyType === "interested") {
    return {
      subject: "NDA signature + next steps",
      body: "Thanks for the interest. Please find the NDA signature link attached. Once signed, we will unlock the next diligence step and share the data-room request checklist.",
      cta: "Send NDA email"
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

function getStageFromReplyType(replyType, preferredPath) {
  if (replyType === "interested") {
    return preferredPath === "zoom-first" ? "Zoom 1 Pending" : "NDA Sent";
  }
  if (replyType === "zoom-request") {
    return "Zoom 1 Pending";
  }
  if (replyType === "info-request") {
    return "Info Shared";
  }
  return "Reminder Pending";
}

// Backend enums are UPPER_SNAKE (Prisma ReplyType/EmailCampaignStatus); the
// frontend has always used lowercase-dash strings for reply types and
// Title Case for campaign status. Translate at the boundary.
const backendReplyTypeMap = {
  INTERESTED: "interested",
  ZOOM_REQUEST: "zoom-request",
  INFO_REQUEST: "info-request",
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
export function useEmailOutreachState() {
  const [campaigns, setCampaigns] = useState(() => normalizeCampaigns(SEED_CAMPAIGNS));
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => normalizeCampaigns(SEED_CAMPAIGNS)[0].id);
  // Starts empty — no fabricated demo leads. Populated for real by the
  // fetchLeads() effect below once the backend has actual replied leads
  // (from real inbound replies, or from clicking "Simulate reply" against
  // a real lead).
  const [repliedLeads, setRepliedLeads] = useState([]);
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
        if (!backendCampaigns.length) {
          return;
        }
        const mapped = backendCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: backendCampaignStatusToLocal(campaign.status),
          sent: campaign.engagement?.sent ? String(campaign.engagement.sent) : "—",
          open: campaign.engagement?.openRate != null ? `${campaign.engagement.openRate}%` : "—",
          click: campaign.engagement?.clickRate != null ? `${campaign.engagement.clickRate}%` : "—",
          reply: "—"
        }));
        setCampaigns(mapped);
        setSelectedCampaignId(mapped[0].id);
        setAutomationNotice(`Loaded ${mapped.length} campaign(s) from the backend.`);
      })
      .catch(() => {
        // Backend unreachable or no DB migrated yet — keep the local seed
        // campaigns table already set above.
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
        if (!replied.length) {
          return;
        }
        const mapped = replied.map((lead) => {
          const localReplyType = backendReplyTypeToLocal(lead.replyType);
          return {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            campaign: lead.campaign?.name ?? "",
            replyType: localReplyType,
            replyPreview: "Reply received — see activity timeline for the full message.",
            lastReplyAt: new Date(lead.updatedAt).toLocaleString(),
            owner: lead.owner,
            movedToWorkflow: true,
            stage: lead.stage,
            bounced: lead.bounced,
            unsubscribed: lead.unsubscribed,
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
        setSelectedLeadId(mapped[0].id);
        setAutomationNotice(`Loaded ${mapped.length} replied lead(s) from the backend.`);
      })
      .catch(() => {
        // Backend unreachable — repliedLeads stays empty rather than
        // showing fabricated leads.
      });
  }, []);

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

  const [automationForm, setAutomationForm] = useState({
    campaignName: DEFAULT_CAMPAIGN_NAME,
    audience: "Renewables founders",
    template: "Cold intro — Renewables founder",
    delayDays: "3",
    followUpCount: "3",
    dailyLimit: "2000",
    abTest: true,
    autoPause: true,
    replyType: "interested",
    preferredPath: "nda-first"
  });
  const [automationNotice, setAutomationNotice] = useState("Automation ready. Select a campaign or create a new sequence.");
  const [newLeadForm, setNewLeadForm] = useState({ name: "", company: "", email: "" });
  const [csvText, setCsvText] = useState("");
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
    dailyLimit: "500"
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

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0];
  const selectedLead = repliedLeads.find((lead) => lead.id === selectedLeadId) ?? repliedLeads[0];
  const selectedLeadTimeline = selectedLead ? leadActivity[selectedLead.id] ?? [] : [];
  const activeReplyRule = replyRules.find((rule) => rule.replyType === automationForm.replyType) ?? null;

  const liveSteps = buildAutomationSteps(
    automationForm.campaignName,
    Number(automationForm.delayDays) || 3,
    Number(automationForm.followUpCount) || 3
  );
  const workflowSteps = buildWorkflowSteps(automationForm);
  const defaultReplyAction = buildReplyAction(automationForm);
  const replyAction = {
    ...defaultReplyAction,
    subject: templateDrafts[automationForm.replyType]?.subject ?? defaultReplyAction.subject,
    body: templateDrafts[automationForm.replyType]?.body ?? defaultReplyAction.body
  };

  function handleFormChange(key, value) {
    setAutomationForm((current) => ({ ...current, [key]: value }));
  }

  function handleTemplateDraftChange(field, value) {
    setTemplateDrafts((current) => ({
      ...current,
      [automationForm.replyType]: {
        ...current[automationForm.replyType],
        [field]: value
      }
    }));
  }

  function handleApplyRule(rule) {
    const nextPreferredPath = rule.replyType === "zoom-request" ? "zoom-first" : "nda-first";
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
      preferredPath: lead.replyType === "zoom-request" ? "zoom-first" : "nda-first"
    }));
    setAutomationNotice(`${lead.name} moved from bulk replies into the workflow automation queue.`);
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
        campaignId: selectedCampaign.id
      });
      setAutomationNotice(`${newLeadForm.name} added to "${selectedCampaign.name}" — ${result.cadenceScheduled} follow-up step(s) scheduled.`);
      setNewLeadForm({ name: "", company: "", email: "" });
    } catch (error) {
      // The backend 409s on a duplicate (same email already in this
      // campaign) rather than silently double-enrolling them in the
      // cadence — surfaced as its own case so it doesn't read like a
      // generic backend failure.
      setAutomationNotice(
        error.message.includes("already in this campaign")
          ? `${newLeadForm.email} is already in "${selectedCampaign.name}" — not added again.`
          : `Could not add lead via the backend (${error.message}). No local-only fallback for this action.`
      );
    }
  }

  async function handleImportCsv() {
    if (!csvText.trim()) {
      setAutomationNotice("Paste some CSV rows first.");
      return;
    }
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    const { rows, errors } = parseLeadsCsv(csvText);
    if (rows.length === 0) {
      setAutomationNotice(`CSV import: nothing to import. ${errors[0] ?? ""}`);
      return;
    }

    try {
      const result = await emailLeadsApi.bulkCreate(selectedCampaign.id, rows);
      const parseErrorNote = errors.length ? ` ${errors.length} row(s) skipped during parsing (see console).` : "";
      if (errors.length) {
        console.warn("CSV parse errors:", errors);
      }
      const duplicateNote = result.duplicateCount ? `, ${result.duplicateCount} already in this campaign (skipped)` : "";
      setAutomationNotice(
        `CSV import: ${result.createdCount} lead(s) added to "${selectedCampaign.name}"${duplicateNote}, ${result.failedCount} failed on the backend.${parseErrorNote}`
      );
      setCsvText("");
    } catch (error) {
      setAutomationNotice(`CSV import failed via the backend (${error.message}). No local-only fallback for this action.`);
    }
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
        dailyLimit: Number(newAccountForm.dailyLimit) || 500
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
        dailyLimit: "500"
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
      autoPause: automationForm.autoPause
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
        setAutomationNotice(`"${campaign.name}" updated on the backend — ${followUpCount + 1} automated touches, ${dailyLimit}/day cap.`);
        return;
      }

      const campaign = await emailCampaignsApi.create({ name: automationForm.campaignName, ...payload });
      const mapped = {
        id: campaign.id,
        name: campaign.name,
        status: backendCampaignStatusToLocal(campaign.status),
        sent: "—",
        open: "—",
        click: "—",
        reply: "—"
      };

      setCampaigns((current) => [mapped, ...current]);
      setSelectedCampaignId(mapped.id);
      setAutomationNotice(
        `"${mapped.name}" saved to the backend — ${followUpCount + 1} automated touches, ${dailyLimit}/day cap. Note: it has no cadence steps yet.`
      );
    } catch (error) {
      setAutomationNotice(`Could not save "${automationForm.campaignName}" — backend unreachable (${error.message}).`);
    }
  }

  async function handleSendNextEmail() {
    if (!selectedLead) {
      return;
    }

    const nextStage = getStageFromReplyType(automationForm.replyType, automationForm.preferredPath);

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

  async function handleSaveTemplate() {
    const templateKey = automationForm.replyType;
    try {
      await emailTemplatesApi.save(templateKey, { subject: replyAction.subject, body: replyAction.body });
      setAutomationNotice(`Template "${templateKey}" saved to the backend — reused for every future send of this reply type.`);
    } catch (error) {
      setAutomationNotice(`Template "${templateKey}" kept locally only — backend unreachable (${error.message}). It will reset on refresh.`);
    }
  }

  async function handlePreviewTemplate() {
    const templateKey = automationForm.replyType;
    try {
      const rendered = await emailTemplatesApi.preview(templateKey);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setAutomationNotice(
        `Could not load a preview for "${templateKey}" (${error.message}). Save the template to the backend first — preview renders the saved version, not unsaved edits.`
      );
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
      const nextPreferredPath = localReplyType === "zoom-request" ? "zoom-first" : "nda-first";
      const nextStage = getStageFromReplyType(localReplyType, nextPreferredPath);

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
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    repliedLeads, selectedLeadId, leadActivity,
    automationForm, automationNotice, newLeadForm, setNewLeadForm,
    csvText, setCsvText, previewHtml, setPreviewHtml,
    emailAccounts, newAccountForm, setNewAccountForm,
    selectedCampaign, selectedLead, selectedLeadTimeline, activeReplyRule,
    liveSteps, workflowSteps, replyAction,
    handleFormChange, handleTemplateDraftChange, handleApplyRule, loadLeadIntoWorkflow,
    handleToggleCampaignStatus, handleAddLead, handleImportCsv, handleAddEmailAccount,
    handleAssignAccountToCampaign, handleDeactivateAccount, handleSaveAutomation,
    handleSendNextEmail, handleSaveTemplate, handlePreviewTemplate, simulateIncomingReply
  };
}
