import { useState } from "react";
import { ActionButton } from "../ui.jsx";
import { FunnelIcon, SendIcon, PlusIcon, UploadIcon } from "../Icons.jsx";

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

export function Field({ label, children }) {
  return (
    <label className="block">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">{label}</p>
      {children}
    </label>
  );
}

export function ToggleCard({ title, desc, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-center justify-between gap-4 rounded-[18px] border px-4 py-3.5 text-left transition ${
        checked ? "border-[#b8d1ff] bg-[#f2f6ff]" : "border-[#d6deea] bg-white"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[#102246]">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-[#5f6f89]">{desc}</p>
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[#3046b2]" : "bg-[#d6deea]"
        }`}
      >
        <span className={`inline-block size-[18px] transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

// Campaign list, mailbox setup, lead intake, and the automation-builder
// form — everything needed to stand up and configure an email cold-outreach
// campaign. Pairs with LeadsTab.jsx, which handles what happens once a
// lead actually replies; both share state via useEmailOutreachState.
export function CampaignsTab({ mailing }) {
  const {
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    newLeadForm, setNewLeadForm, handleAddLead, csvText, setCsvText, handleImportCsv,
    newAccountForm, setNewAccountForm, handleAddEmailAccount, handleDeactivateAccount,
    automationForm, handleFormChange, handleSaveAutomation, automationNotice
  } = mailing;
  // Purely a UI toggle (which entry method is showing) — doesn't need to
  // survive switching tabs, so it stays local instead of living in the
  // shared mailing state.
  const [leadEntryMode, setLeadEntryMode] = useState("single");

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">Campaigns</h2>
            <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
              {campaigns.length} active setups
            </span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                  <th className="pb-3 font-medium">Campaign</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Sent</th>
                  <th className="pb-3 text-right font-medium">Open</th>
                  <th className="pb-3 text-right font-medium">Click</th>
                  <th className="pb-3 text-right font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={`cursor-pointer border-t border-[#e7edf5] transition hover:bg-[#f8faff] ${
                      campaign.id === selectedCampaignId ? "bg-[#f5f8fd]" : ""
                    }`}
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      setAutomationForm((current) => ({ ...current, campaignName: campaign.name }));
                    }}
                  >
                    <td className="py-4 text-[15px] font-medium text-[#102246]">{campaign.name}</td>
                    <td className="py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${campaignToneClass[campaign.status]}`}>{campaign.status}</span>
                    </td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.sent}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.open}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.click}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.reply}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Selected campaign</p>
                <p className="mt-1 text-[14px] text-[#5f6f89]">{selectedCampaign?.name}</p>
                <label className="mt-2 block text-[12px] text-[#6a7790]">
                  Sending mailbox
                  <select
                    value={selectedCampaign?.emailAccountId ?? ""}
                    onChange={handleAssignAccountToCampaign}
                    className="mt-1 block w-full rounded-[10px] border border-[#d6deea] bg-[#f8faff] px-2 py-1.5 text-[13px] text-[#102246] outline-none"
                  >
                    <option value="">Default (global env provider)</option>
                    {emailAccounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={!account.isActive}>
                        {account.label} {account.isActive ? "" : "(inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  label={selectedCampaign?.status === "Sending" ? "Pause automation" : "Resume automation"}
                  icon={selectedCampaign?.status === "Sending" ? FunnelIcon : SendIcon}
                  primary
                  onClick={handleToggleCampaignStatus}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7edf5] px-4 py-3.5">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Add leads</p>
                <p className="mt-0.5 text-[13px] text-[#8593ac]">
                  Enrolls into {selectedCampaign?.name ?? "the selected campaign"}'s no-reply cadence via the backend.
                </p>
              </div>
              <div className="flex shrink-0 gap-1 rounded-[10px] bg-[#f0f3f9] p-1">
                <button
                  type="button"
                  onClick={() => setLeadEntryMode("single")}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                    leadEntryMode === "single" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
                  }`}
                >
                  Single lead
                </button>
                <button
                  type="button"
                  onClick={() => setLeadEntryMode("csv")}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                    leadEntryMode === "csv" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
                  }`}
                >
                  CSV import
                </button>
              </div>
            </div>

            <div className="px-4 py-4">
              {leadEntryMode === "single" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Name">
                      <input
                        value={newLeadForm.name}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        value={newLeadForm.company}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, company: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        value={newLeadForm.email}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, email: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <ActionButton label="Add lead" icon={PlusIcon} primary onClick={handleAddLead} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-5 text-[#6a7790]">
                    Paste rows with a header of <code className="rounded bg-[#f0f3f9] px-1.5 py-0.5 text-[12px]">name,company,email,owner</code> (owner is
                    optional). One bad row won't block the rest of the batch.
                  </p>
                  <textarea
                    rows={5}
                    placeholder={"name,company,email,owner\nDeepa Paul,Nordwind Energy,deepa@nordwind.de,Rahul R"}
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    className="mt-3 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[13px] font-mono text-[#102246] outline-none focus:border-[#3046b2]"
                  />
                  <div className="mt-4">
                    <ActionButton label="Import CSV" icon={UploadIcon} primary onClick={handleImportCsv} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
            <p className="text-[15px] font-semibold text-[#102246]">Sending mailboxes</p>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              Register as many SMTP accounts as you need; assign one to the selected campaign above (or leave it on the default).
            </p>

            {emailAccounts.length > 0 ? (
              <div className="mt-4 space-y-2">
                {emailAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e7edf5] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#102246]">{account.label}</p>
                      <p className="truncate text-[12px] text-[#6a7790]">
                        {account.fromAddress} · {account.smtpHost} · {account.dailyLimit}/day
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          account.isActive ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                      {account.isActive ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivateAccount(account.id)}
                          className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#9aa6ba]">No mailboxes added yet — add one below.</p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                placeholder="Label (e.g. Rahul's mailbox)"
                value={newAccountForm.label}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, label: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="From address"
                type="email"
                value={newAccountForm.fromAddress}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, fromAddress: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP host"
                value={newAccountForm.smtpHost}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpHost: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="Port (e.g. 465 or 587)"
                value={newAccountForm.smtpPort}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPort: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP username"
                value={newAccountForm.smtpUser}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpUser: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP password"
                type="password"
                value={newAccountForm.smtpPass}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPass: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="Daily limit (e.g. 500)"
                value={newAccountForm.dailyLimit}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, dailyLimit: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <label className="flex items-center gap-2 text-[13px] text-[#5f6f89]">
                <input
                  type="checkbox"
                  checked={newAccountForm.smtpSecure}
                  onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
                />
                Use implicit TLS (port 465)
              </label>
            </div>
            <div className="mt-3">
              <ActionButton label="Add mailbox" icon={PlusIcon} primary onClick={handleAddEmailAccount} />
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">Automation Builder</h2>
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Live</span>
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Campaign name">
              <input
                value={automationForm.campaignName}
                onChange={(event) => handleFormChange("campaignName", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              />
            </Field>
            <Field label="Audience segment">
              <select
                value={automationForm.audience}
                onChange={(event) => handleFormChange("audience", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option>Renewables founders</option>
                <option>Family offices</option>
                <option>Manufacturing buyouts</option>
                <option>MENA infrastructure</option>
              </select>
            </Field>
            <Field label="Primary template">
              <select
                value={automationForm.template}
                onChange={(event) => handleFormChange("template", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option>Cold intro — Renewables founder</option>
                <option>Follow-up — Sector teaser</option>
                <option>Portfolio quarterly update</option>
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Daily sending cap">
                <input
                  type="number"
                  value={automationForm.dailyLimit}
                  onChange={(event) => handleFormChange("dailyLimit", event.target.value)}
                  className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
                />
              </Field>
              <Field label="Delay between steps">
                <select
                  value={automationForm.delayDays}
                  onChange={(event) => handleFormChange("delayDays", event.target.value)}
                  className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
                >
                  <option value="2">2 days</option>
                  <option value="3">3 days</option>
                  <option value="5">5 days</option>
                  <option value="7">7 days</option>
                </select>
              </Field>
            </div>

            <Field label="Follow-up count">
              <select
                value={automationForm.followUpCount}
                onChange={(event) => handleFormChange("followUpCount", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="2">2 follow-ups</option>
                <option value="3">3 follow-ups</option>
                <option value="4">4 follow-ups</option>
              </select>
            </Field>
            <Field label="When lead replies">
              <select
                value={automationForm.replyType}
                onChange={(event) => handleFormChange("replyType", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="interested">Interested reply</option>
                <option value="info-request">Asked for more info</option>
                <option value="zoom-request">Wants Zoom first</option>
                <option value="no-reply">No reply</option>
              </select>
            </Field>
            <Field label="Preferred progression">
              <select
                value={automationForm.preferredPath}
                onChange={(event) => handleFormChange("preferredPath", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="nda-first">NDA first, then Zoom</option>
                <option value="zoom-first">Zoom first, then NDA</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 space-y-2.5">
            <ToggleCard
              title="A/B subject testing"
              desc="Split first-touch subject line across two variants."
              checked={automationForm.abTest}
              onChange={() => handleFormChange("abTest", !automationForm.abTest)}
            />
            <ToggleCard
              title="Auto-pause on reply"
              desc="Stop the sequence as soon as a lead replies."
              checked={automationForm.autoPause}
              onChange={() => handleFormChange("autoPause", !automationForm.autoPause)}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton label="Save automation" icon={SendIcon} primary onClick={handleSaveAutomation} />
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Automation status</p>
            <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
