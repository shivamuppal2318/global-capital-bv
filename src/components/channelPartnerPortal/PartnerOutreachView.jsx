import { useEffect, useState } from "react";
import { FunnelIcon } from "../Icons";
import { Card, SectionTitle, StatCard } from "../ui";
import { outreachDoeApi } from "../../lib/outreachDoeApi";

// A Channel Partner's read-only view of Outreach/DOE, scoped to their own
// referred cold-outreach leads (server/src/routes/outreachDoe.js scopes
// via EmailCampaign.ownerChannelPartnerId, same mechanism Email Automation
// itself already uses). WhatsApp/Zoom company-wide numbers are nulled out
// server-side for this tier -- there's no scoping mechanism for those at
// all, unlike everything else in this response, so they're just omitted
// here rather than shown as a company-wide figure attributed to one
// partner's leads.
export function PartnerOutreachView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    outreachDoeApi
      .get()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="px-5 py-5">
      <SectionTitle icon={FunnelIcon} iconClass="text-[#5769d4]" subtitle="Cold-outreach performance for your own referred leads.">
        Outreach / DOE
      </SectionTitle>

      {loading ? (
        <p className="mt-5 text-[14px] text-[#8592ab]">Loading…</p>
      ) : error ? (
        <p className="mt-5 text-[14px] text-[#e0483f]">{error}</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard card={{ label: "Outreach sent", value: String(data.top.outreachSent), note: "Total", noteTone: "blue" }} />
          <StatCard card={{ label: "Responses", value: String(data.top.responses), note: "Positive replies", noteTone: "green" }} />
          <StatCard card={{ label: "Calls booked", value: String(data.top.callsBooked), note: "From replies", noteTone: "violet" }} />
          <StatCard
            card={{
              label: "Response rate",
              value: data.top.responseRate != null ? `${data.top.responseRate}%` : "—",
              note: `Target ${data.targets.positiveResponseRate}%`,
              noteTone: "amber"
            }}
          />
        </div>
      )}
    </Card>
  );
}
