import { useState } from "react";
import { SearchIcon, XIcon } from "../Icons.jsx";
import { RichTextEditor } from "../emailTemplates/RichTextEditor.jsx";

function buildStepHtml(title, description) {
  return `<p><strong>${title}</strong></p><p>${description}</p>`;
}

export function AutomationTab({ mailing }) {
  const { campaigns, automationForm, handleFormChange, handleSaveAutomation, automationNotice, liveSteps } = mailing;
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [stepName, setStepName] = useState("");
  const [stepSubject, setStepSubject] = useState(automationForm.template);
  const [stepContent, setStepContent] = useState(buildStepHtml("Intro email", "Share the teaser, overview, and a clear next step."));

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

            <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-[#303750]">Step 1</p>
                <button type="button" className="grid size-5 place-items-center rounded-full bg-[#ff5d76] text-white">
                  <XIcon className="size-3" />
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[0.32fr_0.38fr_0.3fr]">
                <label className="block">
                  <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Wait</p>
                  <input value="0" readOnly className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none" />
                </label>
                <label className="block">
                  <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">&nbsp;</p>
                  <select className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none">
                    <option>day(s)</option>
                  </select>
                </label>
                <label className="block">
                  <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Only send if</p>
                  <select className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#4b5370] outline-none">
                    <option>Always send</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Internal step name (optional)</p>
                <input
                  value={stepName}
                  onChange={(event) => setStepName(event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </label>

              <label className="mt-3 block">
                <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Subject</p>
                <input
                  value={stepSubject}
                  onChange={(event) => setStepSubject(event.target.value)}
                  className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
                />
              </label>

              <div className="mt-3">
                <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Email Content</p>
                <RichTextEditor
                  value={stepContent}
                  onChange={setStepContent}
                  placeholder="Compose the drip email step here."
                />
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471]"
              >
                + Add Email Step
              </button>
            </div>

            {liveSteps.length ? (
              <div className="mt-4 rounded-[14px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Current automation preview</p>
                <div className="mt-2 space-y-2">
                  {liveSteps.slice(0, 3).map((step) => (
                    <div key={step.title} className="text-[13px] text-[#435471]">
                      <span className="font-semibold text-[#102246]">{step.title}</span> · {step.desc}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
