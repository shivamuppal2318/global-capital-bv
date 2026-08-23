import { ActionButton } from "../ui.jsx";
import { FunnelIcon, SendIcon, MegaphoneIcon } from "../Icons.jsx";

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

// Just the campaign list + the selected campaign's own controls (pause/
// resume, mailbox assignment) — lead intake lives on the Leads tab,
// mailbox setup on Settings, and the sequence config on Automation, so this
// tab stays scoped to "which campaign, what state is it in" instead of
// cramming every concern into one screen.
export function CampaignsTab({ mailing }) {
  const {
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    automationNotice
  } = mailing;

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MegaphoneIcon className="size-5 text-[#ef5b8f]" />
            <h2 className="text-[16px] font-semibold text-[#102246]">Campaigns</h2>
          </div>
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
                      {account.label} {account.country ? `(${account.country})` : ""} {account.isActive ? "" : "(inactive)"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 max-w-sm text-[11px] text-[#9aa6ba]">
                Used for leads with no country match — a lead whose Country matches a mailbox tagged with that same country
                (Settings tab) sends through that one instead, no matter what's picked here.
              </p>
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
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}
