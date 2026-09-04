import { useEffect, useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { FunnelIcon, SendIcon, MegaphoneIcon, SearchIcon } from "../Icons.jsx";

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

export function CampaignsTab({ mailing }) {
  const {
    campaigns, segments, allLeads, selectedCampaignId, selectCampaign, startNewCampaign,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    automationForm, handleFormChange, handleSaveAutomation, handleSendNow, automationNotice, systemStatus
  } = mailing;

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

  // Read-only preview convenience — same {{fieldName}} substitution as the
  // backend's fillMergeFields (renderTemplate.js), duplicated here (not
  // imported: that module lives server-side) so composing content can be
  // previewed instantly with sample data, without a save-then-fetch round
  // trip. The actual send always merges real lead data server-side.
  function fillSampleMergeFields(text) {
    const sample = { leadName: "Sample Lead", company: "Sample Company Ltd", email: "sample@example.com", unsubscribeUrl: "#unsubscribe" };
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
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{company}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{email}}"}</code>{" "}
                  <code className="rounded bg-[#f0f3f9] px-1 py-0.5">{"{{unsubscribeUrl}}"}</code>. This is the one-
                  time campaign send below — reply-triggered follow-ups still come from the Templates tab, unchanged.
                </p>
              </Field>

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
                <div className="max-h-[180px] overflow-y-auto rounded-[12px] border border-[#dfe5f1] bg-white">
                  <label className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471]">
                    <input
                      type="radio"
                      name="send-to-segment"
                      checked={!automationForm.segmentId}
                      onChange={() => handleFormChange("segmentId", "")}
                      className="h-4 w-4 border-[#b9c4d8]"
                    />
                    <span className="min-w-0 flex-1 truncate">All leads in this campaign</span>
                  </label>
                  {segments.map((segment) => (
                    <label key={segment.id} className="flex items-center gap-2.5 border-b border-[#f0f3f9] px-3 py-2 text-[13px] text-[#435471] last:border-b-0">
                      <input
                        type="radio"
                        name="send-to-segment"
                        checked={automationForm.segmentId === segment.id}
                        onChange={() => handleFormChange("segmentId", segment.id)}
                        className="h-4 w-4 border-[#b9c4d8]"
                      />
                      <span className="min-w-0 flex-1 truncate">{segment.name}</span>
                      <span className="shrink-0 text-[12px] text-[#8593ac]">{segment.matchingCount}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label={`Or pick specific leads (${(automationForm.selectedLeadIds ?? []).length} of ${allLeads.length} selected)`}>
                <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[#dfe5f1] bg-white">
                  {allLeads.length ? (
                    allLeads.map((lead) => (
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
                      No leads in this campaign yet — add some from the Leads tab first.
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
                    onClick={handleSendNow}
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
                    <td className="px-4 py-4 text-right">{campaign.sentCount ?? campaign.sent}</td>
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
    </section>
  );
}
