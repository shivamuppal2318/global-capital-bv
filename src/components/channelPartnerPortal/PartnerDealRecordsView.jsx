import { useEffect, useState } from "react";
import { ShieldIcon } from "../Icons";
import { Badge, Card, SectionTitle } from "../ui";
import { ndaApi, ioiApi, visitPlansApi, callsApi } from "../../lib/relationshipsApi";
import { dealStagesApi } from "../../lib/dealStagesApi";

// A Channel Partner's read-only view of NDA / IOI / Visit Planning / Zoom
// Call / Field Visit / Term Sheet for their own referred leads -- one
// component with simple tabs rather than six separate screens, since all
// six are structurally the same ("dated records against my leads") and
// none need any edit affordance (see the matching blockChannelPartner
// guards in ndaRecords.js/ioiRecords.js/visitPlans.js/meetings.js/
// dealStages.js -- this tier is read-only by design). The backend already
// scopes every list call to this partner's own referred leads
// (relatedLeadOwnerWhereClause) -- no client-side filtering here. Field
// Visit and Term Sheet share DealStageRecord (they haven't outgrown that
// shared table the way NDA/IOI/Visit Planning did), fetched via
// dealStagesApi with a stage filter rather than a dedicated API module.
const TABS = [
  { id: "nda", label: "NDA" },
  { id: "meetings", label: "Zoom Call" },
  { id: "ioi", label: "IOI" },
  { id: "visit-planning", label: "Visit Planning" },
  { id: "field-visit", label: "Field Visit" },
  { id: "term-sheet", label: "Term Sheet" }
];

const API_BY_TAB = {
  nda: () => ndaApi.list(),
  ioi: () => ioiApi.list(),
  "visit-planning": () => visitPlansApi.list(),
  meetings: () => callsApi.list(),
  "field-visit": () => dealStagesApi.list({ stage: "FIELD_VISIT" }),
  "term-sheet": () => dealStagesApi.list({ stage: "TERM_SHEET" })
};

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export function PartnerDealRecordsView({ permissions = [] }) {
  const visibleTabs = TABS.filter((t) => permissions.includes(t.id));
  const [tab, setTab] = useState(visibleTabs[0]?.id ?? "nda");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    API_BY_TAB[tab]()
      .then(setRecords)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <Card className="px-5 py-5">
      <SectionTitle icon={ShieldIcon} iconClass="text-[#3046b2]" subtitle="Progress on your own referred leads -- read-only.">
        Deal Records
      </SectionTitle>

      <div className="mt-4 flex gap-1.5 border-b border-[#e7edf5]">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-[13px] font-medium ${
              tab === t.id ? "border-[#3046b2] text-[#3046b2]" : "border-transparent text-[#5f6f89] hover:text-[#334463]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="text-[14px] text-[#e0483f]">{error}</p>
        ) : records.length === 0 ? (
          <p className="text-[14px] text-[#8592ab]">No {TABS.find((t) => t.id === tab).label} records yet for your referred leads.</p>
        ) : (
          records.map((r) => (
            <div key={r.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[14px] font-medium text-[#102246]">{r.lead?.name ?? "Unlinked lead"}</p>
                  <p className="text-[12px] text-[#8592ab]">{r.lead?.company ?? "—"}</p>
                </div>
                <Badge tone="slate">{r.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-[#5f6f89]">
                {tab === "nda" ? (
                  <>
                    <span>Sent: {formatDate(r.sentAt)}</span>
                    <span>Signed: {formatDate(r.signedAt)}</span>
                  </>
                ) : tab === "ioi" ? (
                  <>
                    <span>Sent: {formatDate(r.sentAt)}</span>
                    <span>Signed: {formatDate(r.signedAt)}</span>
                    {r.value ? <span>Value: {r.valueCurrency ?? ""} {r.value.toLocaleString()}</span> : null}
                  </>
                ) : tab === "visit-planning" ? (
                  <>
                    <span>Planned: {formatDate(r.plannedFor)}</span>
                    <span>Completed: {formatDate(r.completedAt)}</span>
                    {r.location ? <span>Location: {r.location}</span> : null}
                  </>
                ) : tab === "meetings" ? (
                  <>
                    <span>When: {r.startTime ? new Date(r.startTime).toLocaleString() : "—"}</span>
                    {r.durationMinutes ? <span>Duration: {r.durationMinutes} min</span> : null}
                    {r.topic ? <span>Topic: {r.topic}</span> : null}
                  </>
                ) : (
                  // field-visit / term-sheet — both DealStageRecord, same shape.
                  <>
                    <span>Scheduled: {formatDate(r.scheduledAt)}</span>
                    <span>Completed: {formatDate(r.completedAt)}</span>
                    {r.location ? <span>Location: {r.location}</span> : null}
                    {r.amount ? <span>Amount: {r.amount}</span> : null}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
