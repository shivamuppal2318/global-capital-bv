import { useState } from "react";
import { ClockIcon, PlusIcon, SparklesIcon, ZapIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, Toggle } from "../ui";
import { autoRepliesData } from "../../data/whatsappData";

export function AutoRepliesTab() {
  const [greetingOn, setGreetingOn] = useState(autoRepliesData.greeting.enabled);
  const [awayOn, setAwayOn] = useState(autoRepliesData.away.enabled);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={SparklesIcon} iconClass="text-[#2b9b60]">
              Greeting message
            </SectionTitle>
            <Toggle checked={greetingOn} onChange={setGreetingOn} />
          </div>
          <p className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3 text-[14px] leading-6 text-[#435471]">
            {autoRepliesData.greeting.message}
          </p>
          <p className="mt-3 text-[12px] text-[#8592ab]">Sent once, the first time a contact messages you.</p>
        </Card>

        <Card className="px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={ClockIcon} iconClass="text-[#f29b3a]">
              Away message
            </SectionTitle>
            <Toggle checked={awayOn} onChange={setAwayOn} />
          </div>
          <p className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3 text-[14px] leading-6 text-[#435471]">
            {autoRepliesData.away.message}
          </p>
          <p className="mt-3 text-[12px] text-[#8592ab]">{autoRepliesData.away.hours}</p>
        </Card>
      </div>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={ZapIcon}
          iconClass="text-[#f29b3a]"
          subtitle="Keyword matches trigger an instant reply before a human ever sees the conversation."
          action={<ActionButton label="New rule" icon={PlusIcon} primary small />}
        >
          Keyword rules
        </SectionTitle>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                <th className="pb-3 font-medium">Keyword</th>
                <th className="pb-3 font-medium">Match type</th>
                <th className="pb-3 font-medium">Reply</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 text-right font-medium">Triggered</th>
              </tr>
            </thead>
            <tbody>
              {autoRepliesData.rules.map((rule) => (
                <tr key={rule.keyword} className="border-t border-[#e7edf5]">
                  <td className="py-4 text-[15px] font-medium text-[#102246]">{rule.keyword}</td>
                  <td className="py-4 text-[14px] text-[#5f6f89]">{rule.matchType}</td>
                  <td className="py-4 text-[14px] text-[#5f6f89]">{rule.reply}</td>
                  <td className="py-4">
                    <Badge tone={rule.status === "Active" ? "green" : "slate"}>{rule.status}</Badge>
                  </td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{rule.triggered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
