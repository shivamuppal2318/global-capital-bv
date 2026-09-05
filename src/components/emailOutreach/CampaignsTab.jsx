import { useEffect, useMemo, useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { FunnelIcon, SendIcon, MegaphoneIcon, SearchIcon, EyeIcon, XIcon } from "../Icons.jsx";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";

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
  // read truncated inline in the row itself. Shared by both the composer's
  // own "Recent sends" panel and the list view's per-campaign popup below,
  // so it's rendered once (activityDetailPopup) and referenced from both
  // of this component's two early-return branches.
  const [activityDetailRow, setActivityDetailRow] = useState(null);

  // The list view's own "who did this campaign actually send to" popup --
  // distinct from the composer's always-loaded Recent sends panel, since a
  // campaign can be inspected this way straight from the list without
  // opening it first. Fetched on demand per campaign, not preloaded for
  // every row up front.
  const [listActivityCampaign, setListActivityCampaign] = useState(null);
  const [listActivityRows, setListActivityRows] = useState([]);
  const [listActivityLoading, setListActivityLoading] = useState(false);

  function openListActivity(campaign) {
    setListActivityCampaign(campaign);
    setListActivityRows([]);
    setListActivityLoading(true);
    emailCampaignsApi
      .sentActivity(campaign.id)
      .then(setListActivityRows)
      .catch(() => setListActivityRows([]))
      .finally(() => setListActivityLoading(false));
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

  const listActivityPopup = listActivityCampaign ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setListActivityCampaign(null)}>
      <div
        className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-[16px] border border-[#d6deea] bg-white p-5 shadow-[0_12px_36px_rgba(16,34,70,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#102246]">{listActivityCampaign.name}</p>
            <p className="text-[12px] text-[#8592ab]">Emails sent — click a lead for its full activity</p>
          </div>
          <button
            type="button"
            onClick={() => setListActivityCampaign(null)}
            className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#8592ab] hover:bg-[#f0f3f9]"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {listActivityLoading ? (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">Loading…</p>
        ) : listActivityRows.length ? (
          <div className="mt-4 space-y-2">
            {listActivityRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setActivityDetailRow(row)}
                className="flex w-full items-center justify-between gap-4 rounded-[12px] border border-[#e7edf5] px-4 py-2.5 text-left hover:bg-[#f8faff]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-[#102246]">
                    {row.leadName} <span className="font-normal text-[#8592ab]">— {row.leadEmail}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[#6a7790]">{row.detail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    row.status === "sent"
                      ? "bg-[#dff5e7] text-[#2b9b60]"
                      : row.status === "failed"
                        ? "bg-[#ffe4ee] text-[#ef5b8f]"
                        : "bg-[#fff4de] text-[#c47f1a]"
                  }`}
                >
                  {row.status === "sent" ? "Sent" : row.status === "failed" ? "Failed" : "Sending…"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">No blast sends yet for this campaign.</p>
        )}
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
    const sample = { leadName: "Sample Lead", firstName: "Sample", company: "Sample Company Ltd", email: "sample@example.com", unsubscribeUrl: "#unsubscribe" };
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

  useEffect(() => {
    if (selectedCampaignId) {
      setViewMode("composer");
    }
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

        <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr] xl:items-start">
          <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="-mx-4 -mt-4 rounded-t-[24px] border-b border-[#e7edf5] px-4 py-4">
              <h2 className="text-[17px] font-semibold text-[#222347]">{selectedCampaign ? "Campaign Editor" : "New Campaign"}</h2>
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Campaign Name">
                <input
                  value={automationForm.campaignName}
                  onChange={(event) => handleFormChange("campaignName", event.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
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
              </Field>

              <p className="rounded-[10px] bg-[#f7f9fc] px-4 py-3 text-[12px] leading-5 text-[#6a7790]">
                A short descriptive name for this campaign's approach (not an email subject line, and not the email
                body) — shown in campaign lists.
              </p>

              <Field label="Subject">
                <input
                  value={automationForm.subject}
                  onChange={(event) => handleFormChange("subject", event.target.value)}
                  placeholder="e.g. Q4 renewables mandate — quick intro"
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </Field>

              <Field label="Email Content">
                <textarea
                  rows={9}
                  value={automationForm.bodyHtml}
                  onChange={(event) => handleFormChange("bodyHtml", event.target.value)}
                  placeholder="<p>Hi {{leadName}},</p><p>...</p>"
                  className="w-full resize-none rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[13px] font-mono leading-5 text-[#435471] outline-none"
                />
                <p className="mt-2 text-[11px] leading-4 text-[#8593ac]">
                  Raw HTML. Merge tags: <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{leadName}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{firstName}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{company}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{email}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{unsubscribeUrl}}"}</code>. This is the one-
                  time campaign send below — reply-triggered follow-ups still come from the Templates tab, unchanged.
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

          <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="space-y-3">
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
                    specificLeadsSource.map((lead) => (
                      <label key={lead.id} className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471] last:border-b-0">
                        <input
                          type="checkbox"
                          checked={(automationForm.selectedLeadIds ?? []).includes(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          className="h-4 w-4 rounded border-[#b9c4d8]"
                        />
                        <span className="min-w-0 flex-1 truncate">{lead.name} — {lead.company}</span>
                        <span className="shrink-0 truncate text-[12px] text-[#8593ac]">{lead.email}</span>
                      </label>
                    ))
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

      {listActivityPopup}
      {activityDetailPopup}
    </section>
  );
}
