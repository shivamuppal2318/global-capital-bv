import { useEffect, useState } from "react";
import { ShieldIcon } from "../Icons";
import { Badge, Card, SectionTitle } from "../ui";
import { ndaApi, ioiApi, visitPlansApi } from "../../lib/relationshipsApi";

// A Channel Partner's read-only view of NDA / IOI / Visit Planning for
// their own referred leads -- one component with three simple tabs rather
// than three separate screens, since all three are structurally the same
// ("dated records against my leads") and none need any edit affordance
// (see the matching blockChannelPartner guards in ndaRecords.js/
// ioiRecords.js/visitPlans.js -- this tier is read-only by design). The
// backend already scopes every list call to this partner's own referred
// leads (relatedLeadOwnerWhereClause) -- no client-side filtering here.
const TABS = [
  { id: "nda", label: "NDA" },
  { id: "ioi", label: "IOI" },
  { id: "visit-planning", label: "Visit Planning" }
];

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
    const api = tab === "nda" ? ndaApi : tab === "ioi" ? ioiApi : visitPlansApi;
    api
      .list()
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
                ) : (
                  <>
                    <span>Planned: {formatDate(r.plannedFor)}</span>
                    <span>Completed: {formatDate(r.completedAt)}</span>
                    {r.location ? <span>Location: {r.location}</span> : null}
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
