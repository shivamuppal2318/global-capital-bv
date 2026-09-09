import { useState } from "react";
import { DropletIcon, PlusIcon } from "../Icons";
import { ActionButton, Badge, Card, ProgressBar, SectionTitle, StatCard } from "../ui";
import { dripCampaignsData } from "../../data/whatsappData";

export function DripCampaignsTab() {
  const [activeSequence, setActiveSequence] = useState(dripCampaignsData.sequences[0].name);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {dripCampaignsData.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="px-5 py-5">
          <SectionTitle
            icon={DropletIcon}
            iconClass="text-[#1da5a0]"
            action={<ActionButton label="New sequence" icon={PlusIcon} primary small />}
          >
            Drip sequences
          </SectionTitle>
          <div className="mt-5 space-y-3">
            {dripCampaignsData.sequences.map((seq) => (
              <button
                key={seq.name}
                type="button"
                onClick={() => setActiveSequence(seq.name)}
                className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                  seq.name === activeSequence ? "border-[#3046b2] bg-[#f4f7fd]" : "border-[#d6deea] hover:bg-[#f8faff]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-[#102246]">{seq.name}</p>
                  <Badge tone={seq.status === "Active" ? "green" : "slate"}>{seq.status}</Badge>
                </div>
                <p className="mt-2 text-[13px] text-[#5f6f89]">Trigger: {seq.trigger}</p>
                <div className="mt-3 flex items-center justify-between text-[13px] text-[#5f6f89]">
                  <span>{seq.enrolled} enrolled</span>
                  <span className="font-semibold text-[#2b9b60]">{seq.completion} completion</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={DropletIcon} iconClass="text-[#3046b2]">
            {activeSequence}
          </SectionTitle>
          <div className="mt-6 space-y-5">
            {dripCampaignsData.activeSteps.map(([title, delay, message, engagement, width]) => (
              <div key={title}>
                <div className="mb-1 flex items-center justify-between gap-4">
                  <p className="text-[15px] font-semibold text-[#102246]">{title}</p>
                  <p className="text-[14px] text-[#5f6f89]">{engagement}</p>
                </div>
                <p className="text-[14px] text-[#5f6f89]">{message}</p>
                <p className="mt-1 text-[12px] uppercase tracking-[0.1em] text-[#8592ab]">{delay}</p>
                <div className="mt-3">
                  <ProgressBar width={width} tone="bg-[#3046b2]" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
