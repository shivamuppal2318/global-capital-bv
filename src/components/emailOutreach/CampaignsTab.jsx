import { useEffect, useMemo, useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { FunnelIcon, SendIcon, MegaphoneIcon, SearchIcon, EyeIcon, XIcon } from "../Icons.jsx";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";
import { emailTemplatesApi } from "../../lib/emailTemplatesApi.js";
import { RichTextEditor } from "../emailTemplates/RichTextEditor.jsx";

function escapeHtmlForBody(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A saved Template's plain-text body (most of the built-in templates have
// no `html` at all — see emailTemplates.js) has real blank lines between
// paragraphs, but nothing that means anything once it's dumped straight
// into an HTML field: browsers collapse consecutive whitespace, so bare
// "\n\n" renders as a single run-on paragraph, not the separated one shown
// while typing it in a plain textarea. Converts it into real <p>/<br> tags
// first — same conversion server-side renderTemplate.js/leadSender.js each
// do their own version of for the same reason.
function plainTextBodyToHtml(text) {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtmlForBody).join("<br>")}</p>`)
    .join("");
}

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

// Mirrors server/src/lib/spamCheck.js's exact rules — duplicated client-side
// (not imported: that module lives server-side) so a rep sees the same
// warnings the real send will log, before clicking Send Now instead of
// after digging through activity logs.
const SPAM_PHRASES = [
  "free money", "click here now", "act now", "100% free", "risk-free",
  "no cost to you", "guaranteed", "buy now", "limited time offer"
];

function checkSpamSignalsClientSide(subject, body) {
  const warnings = [];
  const letters = (subject ?? "").replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6 && letters === letters.toUpperCase()) {
    warnings.push("Subject is all caps");
  }
  const exclamationCount = ((subject ?? "").match(/!/g) ?? []).length;
  if (exclamationCount >= 2) {
    warnings.push("Subject has multiple exclamation marks");
  }
  const lowerBody = (body ?? "").toLowerCase();
  const lowerSubject = (subject ?? "").toLowerCase();
  for (const phrase of SPAM_PHRASES) {
    if (lowerBody.includes(phrase) || lowerSubject.includes(phrase)) {
      warnings.push(`Contains spam-trigger phrase: "${phrase}"`);
    }
  }
  if (!/\{\{\s*unsubscribeUrl\s*\}\}/.test(body ?? "") && !lowerBody.includes("unsubscribe")) {
    warnings.push("Body has no unsubscribe mention (HTML part still gets one automatically)");
  }
  return warnings;
}

export function CampaignsTab({ mailing }) {
  const {
    campaigns, segments, allLeads, targetListLeads, handleChangeSendTarget, selectedCampaignId, selectCampaign, startNewCampaign,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    automationForm, handleFormChange, handleSaveAutomation, handleSendNow, automationNotice, systemStatus
  } = mailing;

  // Which lead set "Or pick specific leads" below shows/toggles against —
  // this campaign's own leads normally, or the redirected target List's
  // leads once Send To has been switched away from "All leads in this
  // campaign" to a different List (see handleChangeSendTarget).
  const specificLeadsSource = automationForm.targetCampaignId && automationForm.targetCampaignId !== selectedCampaignId
    ? targetListLeads
    : allLeads;
  const targetListName = automationForm.targetCampaignId
    ? campaigns.find((c) => c.id === automationForm.targetCampaignId)?.name
    : null;

  // Send To is one flat radio group across three kinds of choice — "all of
  // this campaign's own leads" (the default), a saved Segment (narrows that
  // same set by condition, unchanged from before), or a different List
  // entirely (redirects the whole send to that List's own leads instead).
  // Only one can be active at a time, so picking any of them clears the
  // other two fields rather than leaving a stale segmentId/targetCampaignId
  // silently still applied underneath.
  function handleSendToChange(kind, id) {
    if (kind === "segment") {
      handleChangeSendTarget("");
      handleFormChange("segmentId", id);
    } else if (kind === "list") {
      handleFormChange("segmentId", "");
      handleChangeSendTarget(id);
    } else {
      handleFormChange("segmentId", "");
      handleChangeSendTarget("");
    }
  }

  // The real "from" address this campaign will actually send as — its
  // assigned mailbox if one is set, otherwise the single global
  // env-configured provider. There's no separate "from name" anywhere in
  // the real send pipeline (emailProvider.js's `from` is always a bare
  // address, never a "Display Name <email>" pair), so this shows the one
  // real value instead of a second, fictional field.
  const assignedAccount = selectedCampaign?.emailAccountId ? emailAccounts.find((a) => a.id === selectedCampaign.emailAccountId) : null;
  const resolvedFromAddress = assignedAccount?.fromAddress ?? systemStatus?.smtpFromAddress ?? "Not configured yet";

  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [blastPreviewHtml, setBlastPreviewHtml] = useState(null);

  // Real saved Templates (Templates tab, server/src/routes/emailTemplates.js)
  // — loaded here so a rep can pick one and have its real subject/HTML
  // dropped straight into this campaign's own Subject/Email Content fields,
  // instead of retyping content that already exists in the Templates
  // library. Not a persistent link: picking one just copies its current
  // content in once, same as pasting.
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");

  useEffect(() => {
    emailTemplatesApi.list().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  function handleSelectTemplate(key) {
    setSelectedTemplateKey(key);
    if (!key) return;
    const template = templates.find((t) => t.key === key);
    if (!template) return;
    handleFormChange("subject", template.subject);
    handleFormChange("bodyHtml", template.html || plainTextBodyToHtml(template.body));
  }

  // Live warnings as the rep types — same heuristics the real send logs,
  // surfaced before Send Now instead of only discoverable afterward.
  const spamWarnings = useMemo(
    () => checkSpamSignalsClientSide(automationForm.subject, automationForm.bodyHtml),
    [automationForm.subject, automationForm.bodyHtml]
  );

  // Real per-recipient status for this campaign's most recent blast sends —
  // reloaded whenever a different campaign is opened, and again a few
  // seconds after Send Now (enough time for a queued job to actually
  // process and finalize its activity row; a real send isn't synchronous).
  const [recentSends, setRecentSends] = useState([]);
  const [recentSendsLoading, setRecentSendsLoading] = useState(false);
  // Which recent-send row's full detail (message id, deliverability
  // warnings, etc.) is open in a popup -- that text is often too long to
  // read truncated inline in the row itself.
  const [activityDetailRow, setActivityDetailRow] = useState(null);

  const [activityPage, setActivityPage] = useState(null);
  const [activityPageLoading, setActivityPageLoading] = useState(false);

  function openListActivity(campaign) {
    setViewMode("activity");
    setActivityPage({ campaign, stats: null, recipients: [], events: [] });
    setActivityPageLoading(true);
    emailCampaignsApi
      .activityDetail(campaign.id)
      .then(setActivityPage)
      .catch(() => setActivityPage({ campaign, stats: null, recipients: [], events: [], error: "Could not load campaign activity." }))
      .finally(() => setActivityPageLoading(false));
  }

  const activityDetailPopup = activityDetailRow ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setActivityDetailRow(null)}>
      <div
        className="w-full max-w-[480px] rounded-[16px] border border-[#d6deea] bg-white p-5 shadow-[0_12px_36px_rgba(16,34,70,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#102246]">{activityDetailRow.leadName}</p>
            <p className="truncate text-[12px] text-[#8592ab]">{activityDetailRow.leadEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => setActivityDetailRow(null)}
            className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#8592ab] hover:bg-[#f0f3f9]"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <span
          className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            activityDetailRow.status === "sent"
              ? "bg-[#dff5e7] text-[#2b9b60]"
              : activityDetailRow.status === "failed"
                ? "bg-[#ffe4ee] text-[#ef5b8f]"
                : "bg-[#fff4de] text-[#c47f1a]"
          }`}
        >
          {activityDetailRow.status === "sent" ? "Sent" : activityDetailRow.status === "failed" ? "Failed" : "Sending…"}
        </span>
        <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#334463]">{activityDetailRow.detail}</p>
        {activityDetailRow.createdAt ? (
          <p className="mt-3 text-[12px] text-[#9aa6ba]">{new Date(activityDetailRow.createdAt).toLocaleString()}</p>
        ) : null}
      </div>
    </div>
  ) : null;

  function loadRecentSends() {
    if (!selectedCampaignId) return;
    setRecentSendsLoading(true);
    emailCampaignsApi
      .recentSends(selectedCampaignId)
      .then(setRecentSends)
      .catch(() => setRecentSends([]))
      .finally(() => setRecentSendsLoading(false));
  }
  useEffect(() => {
    setRecentSends([]);
    loadRecentSends();
  }, [selectedCampaignId]);

  async function handleSendNowAndRefresh() {
    await handleSendNow();
    setTimeout(loadRecentSends, 3000);
  }

  // Read-only preview convenience — same {{fieldName}} substitution as the
  // backend's fillMergeFields (renderTemplate.js), duplicated here (not
  // imported: that module lives server-side) so composing content can be
  // previewed instantly with sample data, without a save-then-fetch round
  // trip. The actual send always merges real lead data server-side.
  function fillSampleMergeFields(text) {
    const sample = {
      leadName: "Sample Lead",
      firstName: "Sample",
      company: "Sample Company Ltd",
      email: "sample@example.com",
      // Fake stand-ins for preview only — the real send fills these with a
      // genuine, unique, working per-lead URL (see unsubscribeUrlFor and
      // ndaSignUrlFor in leadSender.js), never a bare "#" fragment.
      unsubscribeUrl: "#unsubscribe",
      ndaSignUrl: "#nda-sign"
    };
    return (text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (key in sample ? sample[key] : match));
  }

  // Picking specific leads by name is a manual override of the Send To
  // dropdown above — checking any lead here means "just these", regardless
  // of whether "All leads" or a Segment is selected there (see
  // handleSendNow, which only sends selectedLeadIds when non-empty).
  function toggleLeadSelection(leadId) {
    const current = automationForm.selectedLeadIds ?? [];
    handleFormChange(
      "selectedLeadIds",
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]
    );
  }

  function handlePreviewBlast() {
    if (!automationForm.subject?.trim() && !automationForm.bodyHtml?.trim()) {
      return;
    }
    setBlastPreviewHtml(
      `<div style="font-family:'Segoe UI',Arial,sans-serif;padding:16px;"><p style="font-size:12px;color:#8593ac;margin:0 0 12px;">Subject: ${fillSampleMergeFields(automationForm.subject)}</p>${fillSampleMergeFields(automationForm.bodyHtml)}</div>`
    );
  }

  // Local UI state, not tied to any real campaign field — without this,
  // picking a template in one campaign left the dropdown showing it as
  // "selected" after switching to a different campaign that never had
  // it applied, which read as if that campaign's content came from it.
  // Deliberately does NOT also switch viewMode to "composer" here —
  // selectedCampaignId defaults to (and gets reset to) the most recently
  // created real campaign's id as soon as the backend list loads, even
  // before the user has clicked anything, which used to jump straight
  // into that campaign's editor instead of showing the list. openCampaign/
  // openNewCampaign below already switch to "composer" themselves, exactly
  // when the user actually asks to.
  useEffect(() => {
    setSelectedTemplateKey("");
  }, [selectedCampaignId]);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const haystack = `${campaign.name} ${campaign.status}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

  function openNewCampaign() {
    startNewCampaign();
    setViewMode("composer");
  }

  function openCampaign(campaign) {
    selectCampaign(campaign);
    setViewMode("composer");
  }

  function fmtDateTime(value) {
    return value ? new Date(value).toLocaleString() : "—";
  }

  function fmtRate(value) {
    return value === null || value === undefined ? "—" : `${value}%`;
  }

  function activityKindLabel(kind) {
    return String(kind ?? "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function activityDotClass(kind) {
    if (kind === "LINK_CLICKED") return "bg-[#e8f7ff] text-[#247db8]";
    if (kind === "REPLY_RECEIVED") return "bg-[#efe8ff] text-[#7a4ec2]";
    if (kind === "BOUNCED" || kind === "SEND_BLOCKED") return "bg-[#ffe4ee] text-[#ef5b8f]";
    if (kind === "EMAIL_OPENED") return "bg-[#eaf8ef] text-[#2b9b60]";
    return "bg-[#eef4fb] text-[#60708b]";
  }

  if (viewMode === "activity") {
    const detail = activityPage ?? {};
    const campaign = detail.campaign ?? {};
    const stats = detail.stats ?? {};
    const statCards = [
      ["Recipients", stats.recipients ?? "—", "Total contacts in list"],
      ["Emails Sent", stats.sent ?? "—", "Actual provider sends"],
      ["Opened", stats.opened ?? "—", `${fmtRate(stats.openRate)} open rate`],
      ["Clicked", stats.clicked ?? "—", `${fmtRate(stats.clickRate)} click rate`],
      ["Replies", stats.replied ?? "—", "Interested / not interested / other"],
      ["Issues", (stats.bounced ?? 0) + (stats.unsubscribed ?? 0), `${stats.bounced ?? 0} bounced, ${stats.unsubscribed ?? 0} unsubscribed`]
    ];

    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
            >
              <span aria-hidden="true">←</span>
              Back to campaigns
            </button>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-[#102246]">{campaign.name ?? "Campaign activity"}</p>
              <p className="truncate text-[12px] text-[#8592ab]">{campaign.subject || "No subject saved yet"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => campaign.id && openListActivity(campaign)}
            disabled={activityPageLoading || !campaign.id}
            className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#3046b2] disabled:opacity-50"
          >
            {activityPageLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {detail.error ? (
          <div className="rounded-[16px] border border-[#ffe4ee] bg-[#fff6f9] px-4 py-3 text-[13px] font-semibold text-[#c43d72]">{detail.error}</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {statCards.map(([label, value, note]) => (
            <div key={label} className="rounded-[14px] border border-[#d6deea] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,48,87,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a89a4]">{label}</p>
              <p className="mt-2 text-[24px] font-semibold text-[#102246]">{value}</p>
              <p className="mt-1 truncate text-[12px] text-[#8592ab]">{note}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[20px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[#102246]">Recipients</h2>
              <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-semibold text-[#60708b]">{detail.recipients?.length ?? 0}</span>
            </div>
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#e7edf5]">
              <table className="w-full min-w-[780px] text-left">
                <thead>
                  <tr className="bg-[#f4f7fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#60708b]">
                    <th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3 text-right">Sent</th>
                    <th className="px-3 py-3 text-right">Opened</th>
                    <th className="px-3 py-3 text-right">Clicked</th>
                    <th className="px-3 py-3">Reply</th>
                    <th className="px-3 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {activityPageLoading ? (
                    <tr><td colSpan="6" className="px-3 py-5 text-[13px] text-[#9aa6ba]">Loading…</td></tr>
                  ) : detail.recipients?.length ? (
                    detail.recipients.map((lead) => (
                      <tr key={lead.id} className="border-t border-[#edf1f6] text-[13px] text-[#5f6f89]">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-[#102246]">{lead.leadName}</p>
                          <p className="mt-0.5 text-[12px] text-[#8592ab]">{lead.company} · {lead.leadEmail}</p>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-[#102246]">{lead.sentCount}</td>
                        <td className="px-3 py-3 text-right">{lead.openCount}</td>
                        <td className="px-3 py-3 text-right">{lead.clickCount}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-[#f0f3f9] px-2 py-1 text-[11px] font-semibold text-[#60708b]">{activityKindLabel(lead.replyType)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <p>{fmtDateTime(lead.lastActivityAt)}</p>
                          <p className="mt-0.5 max-w-[220px] truncate text-[12px] text-[#9aa6ba]">{lead.lastDetail ?? "No activity yet"}</p>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="6" className="px-3 py-5 text-[13px] text-[#9aa6ba]">No recipients in this campaign yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[20px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[#102246]">Activity Timeline</h2>
              <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-semibold text-[#60708b]">{detail.events?.length ?? 0}</span>
            </div>
            <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {activityPageLoading ? (
                <p className="text-[13px] text-[#9aa6ba]">Loading…</p>
              ) : detail.events?.length ? (
                detail.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setActivityDetailRow({ ...event, status: event.detail?.startsWith("Failed") ? "failed" : event.detail?.startsWith("Sending") ? "pending" : "sent" })}
                    className="w-full rounded-[12px] border border-[#e7edf5] px-3 py-3 text-left hover:bg-[#f8faff]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#102246]">{event.leadName}</p>
                        <p className="mt-0.5 truncate text-[12px] text-[#8592ab]">{event.title}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${activityDotClass(event.kind)}`}>{activityKindLabel(event.kind)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#5f6f89]">{event.detail}</p>
                    <p className="mt-2 text-[11px] text-[#9aa6ba]">{fmtDateTime(event.createdAt)}</p>
                  </button>
                ))
              ) : (
                <p className="text-[13px] text-[#9aa6ba]">No send, open, click, or reply activity yet.</p>
              )}
            </div>
          </div>
        </div>

        {activityDetailPopup}
      </section>
    );
  }

  if (viewMode === "composer") {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
          >
            <span aria-hidden="true">←</span>
            Back to campaigns
          </button>
          <p className="text-[13px] text-[#6a7790]">
            {selectedCampaign ? `Editing ${selectedCampaign.name}` : "Creating a new campaign"}
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr] xl:items-start">
          <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="-mx-5 -mt-5 rounded-t-[24px] border-b border-[#e7edf5] px-5 py-4">
              <h2 className="text-[17px] font-semibold text-[#222347]">{selectedCampaign ? "Campaign Editor" : "New Campaign"}</h2>
            </div>

            <div className="mt-5 space-y-5">
              <Field label="Campaign Name">
                <input
                  value={automationForm.campaignName}
                  onChange={(event) => handleFormChange("campaignName", event.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[14px] text-[#102246] outline-none focus:border-[#3046b2] focus:ring-1 focus:ring-[#3046b2]/20"
                />
              </Field>

              <Field label="Subject">
                <input
                  value={automationForm.subject}
                  onChange={(event) => handleFormChange("subject", event.target.value)}
                  placeholder="e.g. Q4 renewables mandate — quick intro"
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[14px] text-[#102246] outline-none focus:border-[#3046b2] focus:ring-1 focus:ring-[#3046b2]/20"
                />
              </Field>

              <Field label="Email Content">
                <RichTextEditor
                  value={automationForm.bodyHtml}
                  onChange={(html) => handleFormChange("bodyHtml", html)}
                  placeholder="Hi {{leadName}}, ..."
                  unsubscribeLinkTag="{{unsubscribeUrl}}"
                />
                <p className="mt-3 text-[11px] leading-5 text-[#8593ac]">
                  Format with the toolbar, or click the HTML button to edit raw HTML. Use the sign-out-shaped button
                  to insert a working Unsubscribe link in one click (select text first to relink it, e.g. the word
                  "unsubscribe") — typing the merge tag itself into the regular link button's prompt makes a dead
                  link, not a working one. Merge tags:{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{leadName}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{firstName}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{company}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{email}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{unsubscribeUrl}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{ndaSignUrl}}"}</code>. This is the one-time
                  campaign send below — reply-triggered follow-ups still come from the Templates tab, unchanged.
                </p>
              </Field>

              {spamWarnings.length && (automationForm.subject?.trim() || automationForm.bodyHtml?.trim()) ? (
                <div className="rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-4 py-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#a56a1a]">
                    Deliverability warnings — the real send logs these too
                  </p>
                  <ul className="mt-1.5 list-disc pl-4 text-[12px] leading-5 text-[#8a5a15]">
                    {spamWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handlePreviewBlast}
                  className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#3046b2]"
                >
                  Preview
                </button>
              </div>

              {blastPreviewHtml ? (
                <div className="rounded-[14px] border border-[#d6deea] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Preview (sample data)</p>
                    <button type="button" onClick={() => setBlastPreviewHtml(null)} className="text-[12px] font-semibold text-[#5f6f89]">
                      Close
                    </button>
                  </div>
                  <iframe title="Campaign email preview" srcDoc={blastPreviewHtml} sandbox="" className="mt-3 h-[320px] w-full rounded-[12px] border border-[#d6deea]" />
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="space-y-4">
              <Field label="Select Template">
                <select
                  value={selectedTemplateKey}
                  onChange={(event) => handleSelectTemplate(event.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                >
                  <option value="">Choose a saved template to fill in Subject/Email Content…</option>
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.key} — {template.subject}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Pulled from the Templates tab. Picking one copies its subject and HTML content into this campaign
                  — edit freely afterward, it does not stay linked.
                </p>
              </Field>

              <Field label="Template Label">
                <input
                  value={automationForm.template}
                  onChange={(event) => handleFormChange("template", event.target.value)}
                  list="template-label-options"
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
                <datalist id="template-label-options">
                  <option value="Cold intro — Renewables founder" />
                  <option value="Follow-up — Sector teaser" />
                  <option value="Portfolio quarterly update" />
                </datalist>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  A short descriptive name for this campaign's approach (not an email subject line, and not the
                  email body) — shown in campaign lists.
                </p>
              </Field>

              <Field label="From Email">
                <input
                  value={resolvedFromAddress}
                  readOnly
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  From the mailbox assigned below — change it there, not here.
                </p>
              </Field>

              <Field label="Reply-To (optional)">
                <input
                  type="email"
                  value={automationForm.replyTo}
                  onChange={(event) => handleFormChange("replyTo", event.target.value)}
                  placeholder="e.g. deals@globalcapitalbv.com"
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Leave blank to let replies land on the sending mailbox itself. Set this to route replies to a
                  different inbox instead.
                </p>
              </Field>

              <Field label="Send To">
                <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[#dfe5f1] bg-white">
                  <label className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471]">
                    <input
                      type="radio"
                      name="send-to"
                      checked={!automationForm.segmentId && !automationForm.targetCampaignId}
                      onChange={() => handleSendToChange("all")}
                      className="h-4 w-4 border-[#b9c4d8]"
                    />
                    <span className="min-w-0 flex-1 truncate">All leads in this campaign</span>
                  </label>
                  {segments.map((segment) => (
                    <label key={segment.id} className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471] last:border-b-0">
                      <input
                        type="radio"
                        name="send-to"
                        checked={automationForm.segmentId === segment.id}
                        onChange={() => handleSendToChange("segment", segment.id)}
                        className="h-4 w-4 border-[#b9c4d8]"
                      />
                      <span className="min-w-0 flex-1 truncate">{segment.name}</span>
                      <span className="shrink-0 text-[12px] text-[#8593ac]">{segment.matchingCount}</span>
                    </label>
                  ))}
                  {campaigns.filter((c) => c.id !== selectedCampaignId).map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471] last:border-b-0">
                      <input
                        type="radio"
                        name="send-to"
                        checked={automationForm.targetCampaignId === c.id}
                        onChange={() => handleSendToChange("list", c.id)}
                        className="h-4 w-4 border-[#b9c4d8]"
                      />
                      <span className="min-w-0 flex-1 truncate">Send to list: {c.name}</span>
                    </label>
                  ))}
                </div>
                {targetListName ? (
                  <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                    Sends this campaign's composed subject/body to <strong>{targetListName}</strong>'s own leads instead
                    of this campaign's.
                  </p>
                ) : null}
              </Field>

              <Field label={`Or pick specific leads (${(automationForm.selectedLeadIds ?? []).length} of ${specificLeadsSource.length} selected)`}>
                <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[#dfe5f1] bg-white">
                  {specificLeadsSource.length ? (
                    specificLeadsSource.map((lead) => {
                      // A send-now would silently drop this lead regardless
                      // of the checkbox — the backend hard-suppresses
                      // unsubscribed/bounced addresses before it ever looks
                      // at which ones were checked (protects sender
                      // reputation) — so it's disabled here with the real
                      // reason shown, instead of letting it get checked and
                      // then reporting a generic "nothing was sent".
                      const suppressed = lead.unsubscribed || lead.bounced;
                      const reason = lead.unsubscribed ? "unsubscribed" : lead.bounced ? "bounced" : null;
                      return (
                        <label
                          key={lead.id}
                          className={`flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] last:border-b-0 ${suppressed ? "text-[#b9c0cf]" : "text-[#435471]"}`}
                        >
                          <input
                            type="checkbox"
                            checked={(automationForm.selectedLeadIds ?? []).includes(lead.id)}
                            disabled={suppressed}
                            onChange={() => toggleLeadSelection(lead.id)}
                            className="h-4 w-4 rounded border-[#b9c4d8] disabled:cursor-not-allowed"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {lead.name} — {lead.company}
                            {reason ? <span className="ml-1.5 text-[11px] font-semibold">({reason})</span> : null}
                          </span>
                          <span className="shrink-0 truncate text-[12px] text-[#8593ac]">{lead.email}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="px-3 py-3 text-[12px] text-[#9aa6ba]">
                      {targetListName
                        ? `No leads in "${targetListName}" yet.`
                        : "No leads in this campaign yet — add some from the Leads tab first."}
                    </p>
                  )}
                </div>
                {(automationForm.selectedLeadIds ?? []).length > 0 ? (
                  <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                    Overrides Send To above — sending only to the {(automationForm.selectedLeadIds ?? []).length} checked lead(s).{" "}
                    <button type="button" onClick={() => handleFormChange("selectedLeadIds", [])} className="font-semibold text-[#3046b2] hover:underline">
                      Clear selection
                    </button>
                  </p>
                ) : null}
              </Field>

              <Field label="Schedule (leave empty to send now)">
                <input
                  type="datetime-local"
                  value={automationForm.scheduledAt}
                  onChange={(event) => handleFormChange("scheduledAt", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </Field>

              <Field label="Delay Between Emails (minutes)">
                <input
                  type="number"
                  min="0"
                  value={automationForm.delayBetweenMinutes}
                  onChange={(event) => handleFormChange("delayBetweenMinutes", event.target.value)}
                  placeholder="0"
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Only applies once the campaign is saved — staggers each recipient's send. Needs the sending queue
                  running; ignored (sends immediately, no stagger) if it isn't.
                </p>
              </Field>

              <Field label="Daily Send Limit">
                <input
                  type="number"
                  value={automationForm.dailyLimit}
                  onChange={(event) => handleFormChange("dailyLimit", event.target.value)}
                  placeholder="e.g. 2000"
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Maximum emails this campaign sends per day (subject to warm-up ramping — see Settings → System
                  status).
                </p>
              </Field>

              <div className="space-y-1.5 text-[14px] font-medium text-[#303750]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked readOnly className="h-4 w-4 rounded border-[#b9c4d8]" />
                  Track Opens
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked readOnly className="h-4 w-4 rounded border-[#b9c4d8]" />
                  Track Clicks
                </label>
              </div>

              {selectedCampaign ? (
                <div className="rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3">
                  <p className="text-[12px] font-semibold text-[#102246]">Selected campaign mailbox</p>
                  <select
                    value={selectedCampaign.emailAccountId ?? ""}
                    onChange={handleAssignAccountToCampaign}
                    className="mt-2 w-full rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#102246] outline-none"
                  >
                    <option value="">Default (global env provider)</option>
                    {emailAccounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={!account.isActive}>
                        {account.label} {account.country ? `(${account.country})` : ""} {account.isActive ? "" : "(inactive)"}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2.5">
                    <ActionButton
                      label={selectedCampaign.status === "Sending" ? "Pause automation" : "Resume automation"}
                      icon={selectedCampaign.status === "Sending" ? FunnelIcon : SendIcon}
                      primary
                      onClick={handleToggleCampaignStatus}
                    />
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[#e7edf5] pt-3 space-y-2.5">
                <button
                  type="button"
                  onClick={handleSaveAutomation}
                  className="w-full rounded-[14px] bg-[#18b6d3] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
                >
                  Save
                </button>
                {selectedCampaign ? (
                  <button
                    type="button"
                    onClick={handleSendNowAndRefresh}
                    disabled={!automationForm.subject?.trim() || !automationForm.bodyHtml?.trim()}
                    className="w-full rounded-[14px] bg-[#1b295f] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_8px_18px_rgba(27,41,95,0.22)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Send Now
                  </button>
                ) : null}
              </div>

              <p className="text-[11px] leading-4 text-[#8593ac]">{automationNotice}</p>
            </div>
          </div>
        </div>

        {selectedCampaign ? (
          <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Recent sends</p>
                <p className="mt-1 text-[13px] text-[#6a7790]">
                  Real per-recipient status for this campaign's last Send Now — no need to open each lead's own
                  activity timeline to check.
                </p>
              </div>
              <button
                type="button"
                onClick={loadRecentSends}
                disabled={recentSendsLoading}
                className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#3046b2] disabled:opacity-50"
              >
                {recentSendsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {recentSends.length ? (
              <div className="mt-4 space-y-2">
                {recentSends.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-4 rounded-[12px] border border-[#e7edf5] px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[#102246]">
                        {row.leadName} <span className="font-normal text-[#8592ab]">— {row.leadEmail}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-[#6a7790]">{row.detail}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActivityDetailRow(row)}
                        title="View full activity detail"
                        className="grid size-7 place-items-center rounded-[8px] border border-[#d6deea] text-[#5f6f89] hover:bg-[#f0f3f9]"
                      >
                        <EyeIcon className="size-3.5" />
                      </button>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          row.status === "sent"
                            ? "bg-[#dff5e7] text-[#2b9b60]"
                            : row.status === "failed"
                              ? "bg-[#ffe4ee] text-[#ef5b8f]"
                              : "bg-[#fff4de] text-[#c47f1a]"
                        }`}
                      >
                        {row.status === "sent" ? "Sent" : row.status === "failed" ? "Failed" : "Sending…"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#9aa6ba]">
                {recentSendsLoading ? "Loading…" : "No blast sends yet for this campaign."}
              </p>
            )}
          </div>
        ) : null}

        {activityDetailPopup}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MegaphoneIcon className="size-5 text-[#2995db]" />
            <h2 className="text-[18px] font-semibold text-[#102246]">Campaigns</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#5f6f89]">
              <SearchIcon className="size-4" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search..."
                className="w-40 bg-transparent outline-none"
              />
            </div>
            <ActionButton label="New Campaign" primary onClick={openNewCampaign} />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#60708b]">
                <th className="px-4 py-4">Campaign Name</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Recipients</th>
                <th className="px-4 py-4 text-right">Emails Sent</th>
                <th className="px-4 py-4 text-right">Open Rate</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.length ? (
                filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-[#e7edf5] bg-white text-[14px] text-[#5d6286]">
                    <td className="px-4 py-4 font-medium text-[#102246]">{campaign.name}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${campaignToneClass[campaign.status]}`}>{campaign.status}</span>
                    </td>
                    <td className="px-4 py-4 text-right">{campaign.leadCount ?? "—"}</td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {campaign.sentCount ?? campaign.sent}
                        <button
                          type="button"
                          onClick={() => openListActivity(campaign)}
                          title="View who this campaign has sent to"
                          className="grid size-6 place-items-center rounded-[6px] text-[#8592ab] hover:bg-[#f0f3f9] hover:text-[#3046b2]"
                        >
                          <EyeIcon className="size-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">{campaign.open}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openCampaign(campaign)}
                        className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-4 py-5 text-[14px] text-[#7a7d9c]">
                    No entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>

      {activityDetailPopup}
    </section>
  );
}
