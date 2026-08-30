import { useState } from "react";
import { SearchIcon } from "../Icons.jsx";
import { CadenceStepsEditor } from "./CadenceStepsEditor.jsx";

export function AutomationTab({ mailing }) {
  const { campaigns, automationForm, handleFormChange, handleSaveAutomation, automationNotice, liveSteps, selectedCampaign } = mailing;
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");

  // Cadence steps attach to a real campaign id — only available once this
  // campaign has actually been saved once (selectedCampaign is populated
  // from the backend list, so its name only matches automationForm's once
  // a real row exists). A brand-new, not-yet-saved campaign has no id yet.
  const activeCampaignId = selectedCampaign?.name === automationForm.campaignName ? selectedCampaign.id : null;

  const filteredCampaigns = campaigns.filter((campaign) => {
    const haystack = `${campaign.name} ${campaign.status}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

  if (viewMode === "form") {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
          >
            <span aria-hidden="true">←</span>
            Back to drip campaigns
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
          <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="-mx-4 -mt-4 rounded-t-[24px] border-b border-[#e7edf5] px-4 py-4">
              <h2 className="text-[17px] font-semibold text-[#222347]">New Drip Campaign</h2>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Drip Campaign Name</p>
                <input
                  value={automationForm.campaignName}
                  onChange={(event) => handleFormChange("campaignName", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Send To</p>
                <select
                  value={automationForm.audience}
                  onChange={(event) => handleFormChange("audience", event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none"
                >
                  <option>CRM Leads (filtered)</option>
                  <option>Renewables founders</option>
                  <option>Family offices</option>
                  <option>Manufacturing buyouts</option>
                </select>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Target CRM leads directly. Hold Ctrl to pick multiple statuses, sources and cities.
                </p>
              </label>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Lead Status</p>
                <textarea
                  rows={3}
                  defaultValue="Customer"
                  className="w-full resize-none rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-5 text-[#102246] outline-none"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Lead Source</p>
                <textarea
                  rows={3}
                  defaultValue={"Facebook\nGoogle"}
                  className="w-full resize-none rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-5 text-[#102246] outline-none"
                />
              </label>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">City</p>
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-5 text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">Hold Ctrl (Cmd on Mac) to select more than one.</p>
              </label>

              <div className="border-t border-[#e7edf5] pt-3">
                <label className="block">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">From Name</p>
                  <input value="LockYourIdea Tech Pvt Ltd" readOnly className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none" />
                </label>
              </div>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">From Email</p>
                <input value="contact@lyicrm.com" readOnly className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none" />
              </label>

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Reply-To</p>
                <input className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none" />
              </label>

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

              <label className="block">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Send via SMTP server(s)</p>
                <textarea
                  rows={2}
                  defaultValue={"Pankaj (smtpout.secureserver.net)\nYogita Pawar (smtpout.secureserver.net)"}
                  className="w-full resize-none rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[13px] leading-5 text-[#102246] outline-none"
                />
                <p className="mt-1.5 text-[11px] leading-4 text-[#8593ac]">
                  Choose which SMTP server(s) to send this through. Select more than one to rotate across them.
                </p>
              </label>

              <button
                type="button"
                onClick={handleSaveAutomation}
                className="w-full rounded-[10px] bg-[#18b6d3] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
              >
                Save
              </button>
              <p className="text-[11px] leading-4 text-[#8593ac]">{automationNotice}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="-mx-4 -mt-4 rounded-t-[24px] border-b border-[#e7edf5] px-4 py-4">
              <h2 className="text-[17px] font-semibold text-[#222347]">Email Sequence</h2>
              <p className="mt-1 text-[11px] leading-4 text-[#8593ac]">
                Steps are sent in order. The delay on each step is counted from the previous email.
              </p>
            </div>

            {activeCampaignId ? (
              <CadenceStepsEditor campaignId={activeCampaignId} />
            ) : (
              <>
                <p className="rounded-[10px] bg-[#f7f9fc] px-4 py-3 text-[12px] leading-5 text-[#6a7790]">
                  Save this drip campaign first (the "Save" button on the left) — follow-up steps attach to a real,
                  already-saved campaign. Here's roughly what a {Number(automationForm.followUpCount) + 1}-email sequence at{" "}
                  {automationForm.delayDays}-day intervals will look like once you do:
                </p>
                {liveSteps.length ? (
                  <div className="mt-3 rounded-[14px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3">
                    <div className="space-y-2">
                      {liveSteps.slice(0, 3).map((step) => (
                        <div key={step.title} className="text-[13px] text-[#435471]">
                          <span className="font-semibold text-[#102246]">{step.title}</span> · {step.desc}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("form")}
              className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
            >
              New Drip Campaign
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] text-[#6a7790]">25</div>
            <button
              type="button"
              className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] font-medium text-[#6a7790]"
            >
              Export
            </button>
            <div className="flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#5f6f89]">
              <SearchIcon className="size-4" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search..."
                className="w-36 bg-transparent outline-none"
              />
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-4 text-[#8593ac]">
          Automated email sequences. Pick an audience and build a series of timed emails with optional rules based on opens and clicks.
        </p>

        <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-4 py-3">Drip Campaign</th>
                <th className="px-4 py-3">Send To</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Enrolled</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.length ? (
                filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                    <td className="px-4 py-3 font-medium text-[#102246]">{campaign.name}</td>
                    <td className="px-4 py-3">{automationForm.audience}</td>
                    <td className="px-4 py-3">{campaign.status}</td>
                    <td className="px-4 py-3">{campaign.leadCount ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          handleFormChange("campaignName", campaign.name);
                          setViewMode("form");
                        }}
                        className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-5 text-[13px] text-[#7a7d9c]">
                    No entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
