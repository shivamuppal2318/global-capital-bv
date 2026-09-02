import { useEffect, useState } from "react";
import { RadarIcon, UsersIcon } from "../Icons";
import { Card, SectionTitle } from "../ui";
import { leadsApi } from "../../lib/leadsApi";

// A Channel Partner's own view of CRM Workspace -- deliberately NOT a reuse
// of CrmWorkspaceModule.jsx, which is full of Edit/Convert/Send-Mail/Delete
// actions that only make sense for staff and would just 403 for a partner
// token (see server/src/routes/leads.js's blockChannelPartner -- this tier
// is read-only by design). Real data, real scoping: the backend already
// filters GET /api/leads and GET /:id/pipeline to only this partner's own
// referred leads (Lead.channelPartner matching their business name, see
// server/src/lib/channelPartnerLeadScope.js) -- this component doesn't
// filter anything client-side, it just renders whatever the API actually
// returns.
const STATUS_LABEL = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", NEGOTIATION: "Negotiation", CONVERTED: "Converted", LOST: "Lost" };

const PIPELINE_STATUS_STYLE = {
  done: { dot: "bg-[#2a9c60] text-white", label: "text-[#2a9c60]" },
  in_progress: { dot: "bg-[#f29b3a] text-white", label: "text-[#f29b3a]" },
  blocked: { dot: "bg-[#e0483f] text-white", label: "text-[#e0483f]" },
  not_started: { dot: "border-2 border-[#d6deea] bg-white text-[#aab4c6]", label: "text-[#8592ab]" }
};

export function PartnerLeadsView() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState(null);

  useEffect(() => {
    leadsApi
      .list()
      .then((data) => {
        setLeads(data);
        if (data.length) setSelectedId(data[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPipeline(null);
      return;
    }
    setPipelineLoading(true);
    setPipelineError(null);
    leadsApi
      .pipeline(selectedId)
      .then(setPipeline)
      .catch((err) => setPipelineError(err.message))
      .finally(() => setPipelineLoading(false));
  }, [selectedId]);

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={UsersIcon}
          iconClass="text-[#3046b2]"
          subtitle="Leads you've referred, tracked against Global Capital BV's real deal pipeline -- read-only."
        >
          Your Referred Leads
        </SectionTitle>

        {loading ? (
          <p className="mt-5 text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="mt-5 text-[14px] text-[#e0483f]">{error}</p>
        ) : leads.length === 0 ? (
          <p className="mt-5 text-[14px] text-[#8592ab]">
            No referred leads yet. Once one of your referrals is added to CRM Workspace, it'll show up here.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-[16px] border border-[#e7edf5]">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="bg-[#f0f3ff] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Capital ask</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedId(lead.id)}
                    className={`cursor-pointer border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286] hover:bg-[#f8faff] ${
                      selectedId === lead.id ? "bg-[#f5f8fd]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-[#102246]">{lead.name}</td>
                    <td className="px-4 py-3">{lead.company}</td>
                    <td className="px-4 py-3">{STATUS_LABEL[lead.status] ?? lead.status}</td>
                    <td className="px-4 py-3">{lead.capitalAsk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedLead ? (
        <Card className="px-5 py-5">
          <SectionTitle icon={RadarIcon} iconClass="text-[#2f96da]" subtitle={`Where ${selectedLead.name} at ${selectedLead.company} stands right now.`}>
            Deal Journey
          </SectionTitle>
          <div className="mt-5 min-w-0">
            {pipelineLoading ? (
              <p className="text-[14px] text-[#8592ab]">Loading…</p>
            ) : pipelineError ? (
              <p className="text-[14px] text-[#e0483f]">{pipelineError}</p>
            ) : pipeline ? (
              <div className="flex w-full min-w-0 items-start overflow-x-auto pb-2">
                {pipeline.map((stage, idx) => {
                  const style = PIPELINE_STATUS_STYLE[stage.status] ?? PIPELINE_STATUS_STYLE.not_started;
                  return (
                    <div key={stage.id} className="flex min-w-[110px] flex-col items-center text-center">
                      <div className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${style.dot}`}>
                        {stage.status === "done" ? "✓" : stage.status === "blocked" ? "✕" : idx + 1}
                      </div>
                      <p className={`mt-2 text-[13px] font-semibold ${style.label}`}>{stage.label}</p>
                      <p className="mt-1 text-[12px] leading-4 text-[#8592ab]">{stage.detail}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
