import { MegaphoneIcon, PlusIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { campaignsData } from "../../data/whatsappData";

const statusTone = {
  Sending: "green",
  Scheduled: "blue",
  Completed: "violet",
  Draft: "slate"
};

export function CampaignsTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {campaignsData.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={MegaphoneIcon}
          iconClass="text-[#ff4b7d]"
          subtitle="One-off broadcasts sent to a defined audience segment using an approved template."
          action={<ActionButton label="New campaign" icon={PlusIcon} primary small />}
        >
          Campaigns
        </SectionTitle>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                <th className="pb-3 font-medium">Campaign</th>
                <th className="pb-3 font-medium">Template</th>
                <th className="pb-3 font-medium">Audience</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 text-right font-medium">Sent</th>
                <th className="pb-3 text-right font-medium">Delivered</th>
                <th className="pb-3 text-right font-medium">Read</th>
                <th className="pb-3 text-right font-medium">Replied</th>
              </tr>
            </thead>
            <tbody>
              {campaignsData.rows.map((row) => (
                <tr key={row.name} className="border-t border-[#e7edf5]">
                  <td className="py-4 text-[15px] font-medium text-[#102246]">{row.name}</td>
                  <td className="py-4 text-[14px] text-[#5f6f89]">{row.template}</td>
                  <td className="py-4 text-[14px] text-[#5f6f89]">{row.audience}</td>
                  <td className="py-4">
                    <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                  </td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{row.sent}</td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{row.delivered}</td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{row.read}</td>
                  <td className="py-4 text-right text-[15px] font-semibold text-[#2b9b60]">{row.replied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
