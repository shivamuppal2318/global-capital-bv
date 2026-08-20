import { ActionButton, Field, ToggleCard } from "../ui.jsx";
import { WorkflowIcon, SendIcon } from "../Icons.jsx";

// The sequence/automation config for the campaign currently selected on the
// Campaigns tab — audience, template, sending cap, cadence timing, and
// reply-routing. Its own tab so this larger form doesn't compete for space
// with the campaign list or lead intake.
export function AutomationTab({ mailing }) {
  const { automationForm, handleFormChange, handleSaveAutomation, automationNotice } = mailing;

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <WorkflowIcon className="size-5 text-[#3046b2]" />
            <h2 className="text-[16px] font-semibold text-[#102246]">Automation Builder</h2>
          </div>
          <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Live</span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
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

        <div className="mt-5 grid gap-2.5 md:grid-cols-2">
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
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Automation status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}
