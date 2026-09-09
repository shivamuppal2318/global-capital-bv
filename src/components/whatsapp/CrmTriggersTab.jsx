import { LinkIcon, PlusIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { crmTriggersData } from "../../data/whatsappData";

export function CrmTriggersTab() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {crmTriggersData.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={LinkIcon}
          iconClass="text-[#3046b2]"
          subtitle="WhatsApp events that write back into the CRM — leads, tasks, fields and timeline activity."
          action={<ActionButton label="New trigger" icon={PlusIcon} primary small />}
        >
          CRM triggers
        </SectionTitle>

        <div className="mt-5 space-y-3">
          {crmTriggersData.rules.map((rule) => (
            <div
              key={rule.event}
              className="flex flex-col gap-3 rounded-[16px] border border-[#e7edf5] px-4 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-1 rounded-full bg-[#eef1ff] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4766cc]">
                  IF
                </span>
                <p className="text-[14px] leading-6 text-[#12213a]">{rule.event}</p>
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-1 rounded-full bg-[#dff5e7] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2b9b60]">
                  THEN
                </span>
                <p className="text-[14px] leading-6 text-[#12213a]">{rule.action}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 md:w-44 md:justify-end">
                <Badge tone={rule.status === "Active" ? "green" : "slate"}>{rule.status}</Badge>
                <span className="text-[12px] text-[#8592ab]">{rule.lastTriggered}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
