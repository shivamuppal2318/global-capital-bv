import { useState } from "react";
import { PlusIcon, SlidersIcon } from "../Icons";
import { ActionButton, Card, SectionTitle, Toggle } from "../ui";
import { automationData } from "../../data/whatsappData";

export function AutomationTab() {
  const [rules, setRules] = useState(automationData.rules);

  const toggleRule = (name) => {
    setRules((prev) => prev.map((rule) => (rule.name === name ? { ...rule, status: !rule.status } : rule)));
  };

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={SlidersIcon}
          iconClass="text-[#3046b2]"
          subtitle="Broader workflow rules that route, escalate and hand off conversations automatically."
          action={<ActionButton label="New automation" icon={PlusIcon} primary small />}
        >
          Automation rules
        </SectionTitle>

        <div className="mt-5 space-y-3">
          {rules.map((rule) => (
            <div key={rule.name} className="rounded-[18px] border border-[#e7edf5] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#102246]">{rule.name}</p>
                  <p className="mt-2 text-[14px] leading-6 text-[#5f6f89]">
                    <span className="font-semibold text-[#4766cc]">When</span> {rule.condition}
                  </p>
                  <p className="mt-1 text-[14px] leading-6 text-[#5f6f89]">
                    <span className="font-semibold text-[#2b9b60]">Then</span> {rule.action}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Toggle checked={rule.status} onChange={() => toggleRule(rule.name)} />
                  <span className="text-[12px] text-[#8592ab]">{rule.executions} runs (30d)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
