import { ChartBarIcon, ClockIcon, SendIcon, UsersIcon } from "../Icons";
import { Card, ProgressBar, SectionTitle } from "../ui";
import { dashboardData } from "../../data/whatsappData";

const toneBarClass = {
  cyan: "bg-[#1b97d2]",
  violet: "bg-[#8b52d0]",
  amber: "bg-[#ff9f35]",
  green: "bg-[#2ba84a]"
};

const activityToneDot = {
  green: "bg-[#2b9b60]",
  violet: "bg-[#8b52d0]",
  amber: "bg-[#f29b3a]",
  blue: "bg-[#3046b2]",
  cyan: "bg-[#1192cb]"
};

export function DashboardTab() {
  const maxVolume = Math.max(...dashboardData.volume.map((d) => d.sent));

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <Card className="px-5 py-5">
        <SectionTitle icon={ChartBarIcon}>Message volume (7 days)</SectionTitle>
        <div className="mt-6 flex items-end justify-between gap-3">
          {dashboardData.volume.map((day) => (
            <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                <div
                  className="w-3.5 rounded-t-full bg-[#3046b2]"
                  style={{ height: `${(day.sent / maxVolume) * 100}%` }}
                  title={`Sent: ${day.sent}`}
                />
                <div
                  className="w-3.5 rounded-t-full bg-[#9fb4ea]"
                  style={{ height: `${(day.received / maxVolume) * 100}%` }}
                  title={`Received: ${day.received}`}
                />
              </div>
              <p className="text-[12px] font-medium text-[#6a7790]">{day.day}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-5 border-t border-dashed border-[#d9e2ef] pt-4 text-[13px] text-[#5f6f89]">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#3046b2]" /> Sent
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#9fb4ea]" /> Received
          </span>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={UsersIcon} iconClass="text-[#8b52d0]">
          Conversation funnel
        </SectionTitle>
        <div className="mt-6 space-y-5">
          {dashboardData.funnel.map((row) => (
            <div key={row.stage}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <p className="text-[14px] font-semibold text-[#12213a]">{row.stage}</p>
                <p className="text-[14px] text-[#5f6f89]">{row.count}</p>
              </div>
              <ProgressBar width={row.width} tone={toneBarClass[row.tone]} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={SendIcon}>Top performing templates</SectionTitle>
        <div className="mt-5 space-y-3">
          {dashboardData.topTemplates.map(([name, sent, read, reply]) => (
            <div key={name} className="flex items-center justify-between gap-4 rounded-[16px] border border-[#e7edf5] px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#102246]">{name}</p>
              <p className="w-24 shrink-0 text-right text-[13px] text-[#5f6f89]">{sent}</p>
              <p className="w-20 shrink-0 text-right text-[13px] text-[#5f6f89]">{read}</p>
              <p className="w-20 shrink-0 text-right text-[13px] font-semibold text-[#2b9b60]">{reply}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={ClockIcon} iconClass="text-[#f29b3a]">
          Recent activity
        </SectionTitle>
        <div className="mt-5 space-y-4">
          {dashboardData.activity.map((item) => (
            <div key={`${item.who}-${item.time}`} className="flex items-start gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${activityToneDot[item.tone]}`} />
              <div className="min-w-0">
                <p className="text-[14px] text-[#12213a]">
                  <span className="font-semibold">{item.who}</span> {item.what}
                </p>
                <p className="mt-0.5 text-[12px] text-[#8592ab]">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5 xl:col-span-2">
        <SectionTitle icon={UsersIcon} iconClass="text-[#2995db]">
          Agent performance
        </SectionTitle>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                <th className="pb-3 font-medium">Agent</th>
                <th className="pb-3 font-medium">Assigned</th>
                <th className="pb-3 font-medium">Resolved</th>
                <th className="pb-3 font-medium">Avg response</th>
                <th className="pb-3 text-right font-medium">CSAT</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.agents.map(([name, assigned, resolved, avg, csat]) => (
                <tr key={name} className="border-t border-[#e7edf5]">
                  <td className="py-3 text-[14px] font-medium text-[#102246]">{name}</td>
                  <td className="py-3 text-[14px] text-[#5f6f89]">{assigned}</td>
                  <td className="py-3 text-[14px] text-[#5f6f89]">{resolved}</td>
                  <td className="py-3 text-[14px] text-[#5f6f89]">{avg}</td>
                  <td className="py-3 text-right text-[14px] font-semibold text-[#2b9b60]">{csat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
