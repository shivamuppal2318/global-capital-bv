import { useState } from "react";
import { PlusIcon, WorkflowIcon, ZapIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { botFlowsData } from "../../data/whatsappData";

const stepStyles = {
  trigger: { dot: "bg-[#3046b2]", label: "text-[#3046b2]" },
  message: { dot: "bg-[#2b9b60]", label: "text-[#2b9b60]" },
  question: { dot: "bg-[#8b52d0]", label: "text-[#8b52d0]" },
  condition: { dot: "bg-[#f29b3a]", label: "text-[#f29b3a]" },
  action: { dot: "bg-[#1192cb]", label: "text-[#1192cb]" }
};

export function BotFlowsTab() {
  const [activeFlow, setActiveFlow] = useState(botFlowsData.flows[0].name);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {botFlowsData.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="px-5 py-5">
          <SectionTitle
            icon={WorkflowIcon}
            iconClass="text-[#8b52d0]"
            action={<ActionButton label="New flow" icon={PlusIcon} primary small />}
          >
            Flows
          </SectionTitle>
          <div className="mt-5 space-y-3">
            {botFlowsData.flows.map((flow) => (
              <button
                key={flow.name}
                type="button"
                onClick={() => setActiveFlow(flow.name)}
                className={`w-full rounded-[18px] border px-4 py-4 text-left transition ${
                  flow.name === activeFlow ? "border-[#3046b2] bg-[#f4f7fd]" : "border-[#d6deea] hover:bg-[#f8faff]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-[#102246]">{flow.name}</p>
                  <Badge tone={flow.active ? "green" : "slate"}>{flow.active ? "Live" : "Draft"}</Badge>
                </div>
                <p className="mt-2 text-[13px] text-[#5f6f89]">{flow.trigger}</p>
                <div className="mt-3 flex items-center justify-between text-[13px] text-[#5f6f89]">
                  <span>{flow.steps} steps · {flow.users} users</span>
                  <span className="font-semibold text-[#2b9b60]">{flow.completion}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={ZapIcon} iconClass="text-[#3046b2]" subtitle="Linear conversation logic — each step runs in order.">
            {activeFlow}
          </SectionTitle>
          <div className="mt-6">
            {botFlowsData.activeFlowSteps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
                {index < botFlowsData.activeFlowSteps.length - 1 ? (
                  <span className="absolute left-[7px] top-5 h-full w-px bg-[#e0e6f0]" />
                ) : null}
                <span className={`relative z-10 mt-1 size-4 shrink-0 rounded-full ${stepStyles[step.type].dot}`} />
                <div className="min-w-0 flex-1 rounded-[16px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3">
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${stepStyles[step.type].label}`}>
                    {step.label}
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[#334463]">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
