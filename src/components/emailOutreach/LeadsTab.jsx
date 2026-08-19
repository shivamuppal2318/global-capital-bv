import { ActionButton, noteToneClass } from "../ui.jsx";
import { UsersIcon, SendIcon, MailIcon, TagIcon, SearchIcon } from "../Icons.jsx";
import { replyRules } from "./useEmailOutreachState.js";

const callStatusToneClass = {
  booked: "bg-[#dff2ff] text-[#2995db]",
  completed: "bg-[#dff5e7] text-[#2b9b60]",
  canceled: "bg-[#ffe4ee] text-[#ef5b8f]"
};

// What happens once a lead actually replies: classify → draft the
// reply-based email → send it → track the workflow it moves through.
// Pairs with CampaignsTab.jsx, which sets up the campaign this reply came
// from; both share state via useEmailOutreachState.
export function LeadsTab({ mailing }) {
  const {
    repliedLeads, selectedLeadId, selectedLead, selectedLeadTimeline, loadLeadIntoWorkflow,
    automationForm, activeReplyRule, handleApplyRule, replyAction, handleTemplateDraftChange,
    handleSendNextEmail, handleSaveTemplate, handlePreviewTemplate, previewHtml, setPreviewHtml,
    simulateIncomingReply, liveSteps, workflowSteps
  } = mailing;

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[#102246]">Bulk to workflow handoff</p>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              {repliedLeads.length} companies replied after the bulk campaign and are now eligible for automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              {repliedLeads.filter((lead) => lead.movedToWorkflow).length} in workflow
            </span>
            <ActionButton label="Simulate reply" icon={UsersIcon} onClick={simulateIncomingReply} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="border-b border-[#e7edf5] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[16px] font-semibold text-[#102246]">Replied leads</h2>
              <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
                From bulk campaigns
              </span>
            </div>
          </div>

          <div>
            {repliedLeads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => loadLeadIntoWorkflow(lead)}
                className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                  selectedLeadId === lead.id ? "bg-[#f5f8fd]" : ""
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[13px] font-semibold text-[#4766cc]">
                  {lead.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold text-[#102246]">{lead.name}</p>
                    <span className="text-[12px] text-[#6a7790]">{lead.lastReplyAt}</span>
                  </div>
                  <p className="mt-1 text-[14px] text-[#435471]">{lead.company}</p>
                  <p className="mt-2 truncate text-[14px] text-[#5f6f89]">{lead.replyPreview}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[lead.replyType === "interested" ? "green" : lead.replyType === "zoom-request" ? "indigo" : "amber"]}`}>
                      {lead.replyType}
                    </span>
                    <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-semibold text-[#4766cc]">
                      {lead.stage}
                    </span>
                    <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">
                      {lead.campaign}
                    </span>
                    {lead.bounced ? (
                      <span className="rounded-full bg-[#ffe4ee] px-2.5 py-1 text-[11px] font-semibold text-[#ef5b8f]">
                        Bounced
                      </span>
                    ) : null}
                    {lead.unsubscribed ? (
                      <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">
                        Unsubscribed
                      </span>
                    ) : null}
                    {lead.callStatus ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          callStatusToneClass[lead.callStatus]
                        }`}
                      >
                        Call {lead.callStatus}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#102246]">Next automated email</h2>
              <p className="mt-1 text-[14px] text-[#5f6f89]">
                Reply-based follow-up for {selectedLead?.name} at {selectedLead?.company}
              </p>
            </div>
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              Owner {selectedLead?.owner}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Detected reply</p>
              <p className="mt-3 text-[15px] font-medium text-[#102246]">{selectedLead?.replyPreview}</p>
              <div className="mt-4 space-y-2 text-[14px] text-[#435471]">
                <p>Campaign: <span className="font-medium text-[#102246]">{selectedLead?.campaign}</span></p>
                <p>Reply class: <span className="font-medium text-[#102246]">{automationForm.replyType}</span></p>
                <p>Flow path: <span className="font-medium text-[#102246]">{automationForm.preferredPath}</span></p>
                <p>CRM stage: <span className="font-medium text-[#102246]">{selectedLead?.stage}</span></p>
              </div>

              <p className="mt-4 text-[12px] text-[#6a7790]">
                Auto-classified from reply text — click a rule to override manually.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {replyRules.map((rule) => {
                  const active = activeReplyRule?.id === rule.id;
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => handleApplyRule(rule)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                        active
                          ? "bg-[#dff5e7] text-[#2b9b60] ring-1 ring-inset ring-[#2b9b60]"
                          : "bg-[#edf2f7] text-[#5f6f89] hover:bg-[#e3e9f2]"
                      }`}
                    >
                      {rule.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Email draft</p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Subject</p>
                  <input
                    value={replyAction.subject}
                    onChange={(event) => handleTemplateDraftChange("subject", event.target.value)}
                    className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[15px] font-medium text-[#102246] outline-none"
                  />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Body</p>
                  <textarea
                    value={replyAction.body}
                    onChange={(event) => handleTemplateDraftChange("body", event.target.value)}
                    rows={6}
                    className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-3 text-[14px] leading-6 text-[#435471] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton label={replyAction.cta} icon={MailIcon} primary onClick={handleSendNextEmail} />
            <ActionButton label="Save template" icon={TagIcon} onClick={handleSaveTemplate} />
            <ActionButton label="Preview" icon={SearchIcon} onClick={handlePreviewTemplate} />
          </div>

          {previewHtml ? (
            <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">
                  Preview — rendered with sample data, exactly as a real send would look
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewHtml(null)}
                  className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                >
                  Close
                </button>
              </div>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="mt-3 h-[420px] w-full rounded-[12px] border border-[#d6deea]"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <SendIcon className="size-5 text-[#21439b]" />
              <h2 className="text-[16px] font-semibold text-[#102246]">Planned sequence</h2>
            </div>
            <span className="text-[14px] text-[#5f6f89]">{liveSteps.length} touches</span>
          </div>
          <p className="mt-2 text-[13px] text-[#8593ac]">
            Preview of the cadence steps "Save automation" will schedule, based on the delay/follow-up settings above.
          </p>
          <div className="mt-6 space-y-4">
            {liveSteps.map((step) => (
              <div key={step.title}>
                <p className="text-[15px] font-semibold text-[#102246]">{step.title}</p>
                <p className="text-[14px] text-[#5f6f89]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Sequence summary</h2>
          <div className="mt-5 space-y-3 text-[14px] text-[#435471]">
            <p>Audience: <span className="font-medium text-[#102246]">{automationForm.audience}</span></p>
            <p>Template: <span className="font-medium text-[#102246]">{automationForm.template}</span></p>
            <p>Cadence gap: <span className="font-medium text-[#102246]">{automationForm.delayDays} days</span></p>
            <p>Daily cap: <span className="font-medium text-[#102246]">{automationForm.dailyLimit}/day</span></p>
            <p>A/B test: <span className="font-medium text-[#102246]">{automationForm.abTest ? "Enabled" : "Disabled"}</span></p>
            <p>Reply branch: <span className="font-medium text-[#102246]">{automationForm.replyType}</span></p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#102246]">Lead activity timeline</h2>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              Bulk campaign touchpoints and follow-up automation for {selectedLead?.name}
            </p>
          </div>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
            {selectedLeadTimeline.length} events
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {selectedLeadTimeline.map((event, index) => (
            <div key={`${event.at}-${event.title}-${index}`} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-3 w-3 rounded-full bg-[#3046b2]" />
                {index !== selectedLeadTimeline.length - 1 ? <span className="mt-2 h-full w-px bg-[#d9e2ef]" /> : null}
              </div>
              <div className="min-w-0 flex-1 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-[#102246]">{event.title}</p>
                  <span className="text-[12px] text-[#6a7790]">{event.at}</span>
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[#435471]">{event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">Reply-triggered workflow</h2>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
            {automationForm.replyType === "no-reply" ? "Reminder path" : "Conditional path"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflowSteps.map((step) => (
            <div
              key={step.key}
              className={`rounded-[18px] border px-4 py-4 ${
                step.state === "done"
                  ? "border-[#cce7d6] bg-[#f1fbf5]"
                  : step.state === "current"
                    ? "border-[#bfd0ff] bg-[#f4f7ff]"
                    : "border-[#d6deea] bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold text-[#102246]">{step.title}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    step.state === "done"
                      ? "bg-[#dff5e7] text-[#2b9b60]"
                      : step.state === "current"
                        ? "bg-[#e6ebff] text-[#5769d4]"
                        : "bg-[#edf2f7] text-[#748096]"
                  }`}
                >
                  {step.state}
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-[#5f6f89]">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
