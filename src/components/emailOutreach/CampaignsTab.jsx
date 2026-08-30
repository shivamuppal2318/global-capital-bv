import { useEffect, useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { FunnelIcon, SendIcon, MegaphoneIcon, SearchIcon } from "../Icons.jsx";

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

const EMPTY_FORM = {
  campaignName: "",
  audience: "Renewables founders",
  template: "Cold intro — Renewables founder",
  delayDays: "3",
  followUpCount: "3",
  dailyLimit: "2000",
  abTest: true,
  autoPause: true,
  replyType: "interested",
  preferredPath: "nda-first"
};

export function CampaignsTab({ mailing }) {
  const {
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    automationForm, handleFormChange, handleSaveAutomation, automationNotice
  } = mailing;

  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");

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
    setSelectedCampaignId(null);
    setAutomationForm((current) => ({ ...current, ...EMPTY_FORM }));
    setViewMode("composer");
  }

  function openCampaign(campaign) {
    setSelectedCampaignId(campaign.id);
    setAutomationForm((current) => ({ ...current, campaignName: campaign.name }));
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

              <Field label="Subject">
                <input
                  value={automationForm.template}
                  onChange={(event) => handleFormChange("template", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </Field>

              <Field label="Email Content">
                <div className="rounded-[8px] border border-[#d8dfea] bg-white">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[#e7edf5] px-4 py-2 text-[11px] text-[#5f6f89]">
                    <span>Normal</span>
                    <span className="text-[11px]">↕</span>
                    <span className="font-bold">B</span>
                    <span className="italic">I</span>
                    <span className="underline">U</span>
                    <span className="text-[11px]">S</span>
                    <span>A</span>
                    <span>▤</span>
                    <span>☰</span>
                    <span>☷</span>
                    <span>≡</span>
                    <span>🔗</span>
                    <span>🖼</span>
                    <span>❞</span>
                    <span>Tx</span>
                  </div>
                  <textarea
                    rows={9}
                    className="w-full resize-none rounded-b-[8px] bg-white px-4 py-3 text-[14px] leading-5 text-[#435471] outline-none"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-4 text-[#8593ac]">
                  Format with the toolbar, or click the HTML button to edit raw HTML. Merge tags: `first_name`, `last_name`,
                  `email`, `company`, `unsubscribe_url`
                </p>
              </Field>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="space-y-3">
              <Field label="From Name">
                <input
                  value="LockYourIdea Tech Pvt Ltd"
                  readOnly
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                />
              </Field>

              <Field label="From Email">
                <input
                  value="contact@lyicrm.com"
                  readOnly
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                />
              </Field>

              <Field label="Reply-To">
                <input className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none" />
              </Field>

              <Field label="Send To">
                <select
                  value={automationForm.audience}
                  onChange={(event) => handleFormChange("audience", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                >
                  <option>Mailing List / Segment</option>
                  <option>Renewables founders</option>
                  <option>Family offices</option>
                  <option>Manufacturing buyouts</option>
                </select>
              </Field>

              <Field label="Select List">
                <select
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                >
                  <option />
                </select>
              </Field>

              <Field label="Select Segment (optional)">
                <select className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none">
                  <option />
                </select>
              </Field>

              <Field label="Load Template (optional)">
                <select
                  value={automationForm.template}
                  onChange={(event) => handleFormChange("template", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                >
                  <option> </option>
                  <option>Cold intro — Renewables founder</option>
                  <option>Follow-up — Sector teaser</option>
                  <option>Portfolio quarterly update</option>
                </select>
              </Field>

              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Send via SMTP server(s)</p>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  No SMTP servers added yet — this will use your global SMTP from Settings. Add servers to rotate sending across them.
                  <span className="ml-1 font-semibold text-[#5b6ef3]">New SMTP Server →</span>
                </p>
              </div>

              <Field label="Schedule (leave empty to send now)">
                <div className="flex items-center gap-2">
                  <input className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none" />
                  <div className="grid h-[42px] w-[42px] place-items-center rounded-[10px] border border-[#dfe5f1] text-[#6c7690]">
                    ▣
                  </div>
                </div>
              </Field>

              <Field label="Delay Between Emails (minutes)">
                <input
                  type="number"
                  value={automationForm.dailyLimit}
                  onChange={(event) => handleFormChange("dailyLimit", event.target.value)}
                  placeholder="e.g. 1"
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Optional. Minimum 1 minute between each email sent in this campaign.
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

              <div className="border-t border-[#e7edf5] pt-3">
                <button
                  type="button"
                  onClick={handleSaveAutomation}
                  className="w-full rounded-[14px] bg-[#18b6d3] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
                >
                  Save
                </button>
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
