import { ActionButton } from "../ui.jsx";
import { MailIcon, SearchIcon, SendIcon, TagIcon } from "../Icons.jsx";

const templateMeta = {
  interested: {
    label: "Interested reply",
    tone: "bg-[#dff5e7] text-[#2b9b60]",
    description: "Sends NDA-first outreach and unlocks diligence."
  },
  "info-request": {
    label: "Info request",
    tone: "bg-[#fff1de] text-[#d9822b]",
    description: "Shares teaser, overview, and asks for next-step preference."
  },
  "zoom-request": {
    label: "Zoom request",
    tone: "bg-[#e8ecff] text-[#5769d4]",
    description: "Pushes the booking link before paperwork."
  },
  "no-reply": {
    label: "No reply fallback",
    tone: "bg-[#edf2f7] text-[#748096]",
    description: "Last reminder before recycling the lead."
  }
};

export function AutomatedTemplatesTab({ mailing }) {
  const {
    repliedLeads, selectedLead, selectedLeadTimeline,
    automationForm, handleFormChange, replyAction, handleTemplateDraftChange,
    handleSendNextEmail, handleSaveTemplate, handlePreviewTemplate, previewHtml, setPreviewHtml
  } = mailing;

  const activeMeta = templateMeta[automationForm.replyType] ?? templateMeta.interested;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Reply automation library</p>
                <p className="mt-1 text-[14px] text-[#5f6f89]">
                  Manage the emails that fire after a lead replies from a bulk campaign.
                </p>
              </div>
              <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
                {repliedLeads.length} active reply cases
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {Object.entries(templateMeta).map(([key, meta]) => {
                const active = automationForm.replyType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleFormChange("replyType", key)}
                    className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                      active ? "border-[#b8d1ff] bg-[#f4f7ff]" : "border-[#d6deea] bg-white hover:bg-[#f8faff]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-semibold text-[#102246]">{meta.label}</p>
                        <p className="mt-1 text-[13px] leading-5 text-[#5f6f89]">{meta.description}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>
                        {active ? "Editing" : "Template"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-[#102246]">Template context</h2>
                <p className="mt-1 text-[14px] text-[#5f6f89]">
                  Current branch and real lead context used for the next automated send.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${activeMeta.tone}`}>
                {activeMeta.label}
              </span>
            </div>

            <div className="mt-5 space-y-3 text-[14px] text-[#435471]">
              <p>Selected lead: <span className="font-medium text-[#102246]">{selectedLead?.name ?? "No replied lead selected"}</span></p>
              <p>Company: <span className="font-medium text-[#102246]">{selectedLead?.company ?? "—"}</span></p>
              <p>Campaign: <span className="font-medium text-[#102246]">{selectedLead?.campaign ?? "—"}</span></p>
              <p>Stage after send: <span className="font-medium text-[#102246]">{selectedLead?.stage ?? "Pending classification"}</span></p>
              <p>Workflow path: <span className="font-medium text-[#102246]">{automationForm.preferredPath}</span></p>
            </div>

            <div className="mt-4 rounded-[16px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Latest activity</p>
              <p className="mt-2 text-[14px] leading-6 text-[#435471]">
                {selectedLeadTimeline[0]?.detail ?? "Pick a replied lead in the Replies tab to see its latest timeline event here."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#102246]">Automated email template</h2>
              <p className="mt-1 text-[14px] text-[#5f6f89]">
                Edit the subject/body that will be reused every time this reply class is triggered.
              </p>
            </div>
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              Backend synced
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[0.44fr_0.56fr]">
            <div className="rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Trigger summary</p>
              <p className="mt-3 text-[15px] font-medium text-[#102246]">{activeMeta.description}</p>
              <div className="mt-4 space-y-2 text-[14px] text-[#435471]">
                <p>Reply class: <span className="font-medium text-[#102246]">{automationForm.replyType}</span></p>
                <p>Suggested CTA: <span className="font-medium text-[#102246]">{replyAction.cta}</span></p>
                <p>Preview lead: <span className="font-medium text-[#102246]">{selectedLead?.name ?? "No lead selected"}</span></p>
              </div>
            </div>

            <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <div>
                <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Subject</p>
                <input
                  value={replyAction.subject}
                  onChange={(event) => handleTemplateDraftChange("subject", event.target.value)}
                  className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[15px] font-medium text-[#102246] outline-none"
                />
              </div>
              <div className="mt-3">
                <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Body</p>
                <textarea
                  value={replyAction.body}
                  onChange={(event) => handleTemplateDraftChange("body", event.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-3 text-[14px] leading-6 text-[#435471] outline-none"
                />
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
                  Preview rendered with saved backend template
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
                title="Automated email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="mt-3 h-[420px] w-full rounded-[12px] border border-[#d6deea]"
              />
            </div>
          ) : null}

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
            <div className="flex items-center gap-3">
              <SendIcon className="size-4 text-[#21439b]" />
              <p className="text-[14px] font-semibold text-[#102246]">Reusable merge fields</p>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-[#5f6f89]">
              Use placeholders like <code className="rounded bg-white px-1.5 py-0.5 text-[12px] text-[#21439b]">{"{{leadName}}"}</code>,{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-[12px] text-[#21439b]">{"{{company}}"}</code>, and{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-[12px] text-[#21439b]">{"{{ndaSignUrl}}"}</code> to keep each send personalized.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
