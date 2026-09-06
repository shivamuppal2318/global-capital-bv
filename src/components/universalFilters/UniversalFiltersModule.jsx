import { useCallback, useEffect, useMemo, useState } from "react";
import { universalFiltersApi } from "../../lib/universalFiltersApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import {
  CalendarIcon,
  GridIcon,
  LinkIcon,
  RadarIcon,
  SlidersIcon,
  TagIcon,
  UserCheckIcon,
  UsersIcon,
  WorkflowIcon,
  XIcon
} from "../Icons";

const inputClass =
  "w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";

const LIFECYCLE_STAGES = [
  { key: "lead", label: "Lead" },
  { key: "outreach", label: "Outreach" },
  { key: "nda", label: "NDA" },
  { key: "zoom", label: "Zoom call 1" },
  { key: "dataRoom", label: "Data room" },
  { key: "ioi", label: "IOI" },
  { key: "zoomCall2", label: "Zoom call 2" },
  { key: "fieldVisit", label: "Field visit" },
  { key: "termSheet", label: "Term sheet" }
];

const TICKET_SIZE_BANDS = [
  { key: "under_1m", label: "Under $1M" },
  { key: "1m_5m", label: "$1M–$5M" },
  { key: "5m_20m", label: "$5M–$20M" },
  { key: "20m_plus", label: "$20M+" },
  { key: "unspecified", label: "Unspecified" }
];

const TEMPERATURES = [
  { key: "HOT", label: "Hot" },
  { key: "WARM", label: "Warm" },
  { key: "COLD", label: "Cold" }
];

const STATUSES = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "NEGOTIATION", label: "Negotiation" },
  { key: "CONVERTED", label: "Converted" },
  { key: "LOST", label: "Lost" }
];

const DUE_WINDOWS = [
  { key: "overdue", label: "Overdue" },
  { key: "due_7d", label: "Due within 7 days" },
  { key: "due_30d", label: "Due within 30 days" },
  { key: "none", label: "No action due" }
];

const TEMPERATURE_TONE = { HOT: "red", WARM: "amber", COLD: "blue" };
const STATUS_TONE = {
  NEW: "blue",
  CONTACTED: "amber",
  QUALIFIED: "green",
  NEGOTIATION: "violet",
  CONVERTED: "green",
  LOST: "red"
};
const DUE_TONE = { overdue: "red", due_7d: "amber", due_30d: "blue", none: "slate" };

const asOptions = (list) => list.map((v) => ({ key: v, label: v }));

const EMPTY_FILTERS = {
  leadId: "",
  channelPartner: "",
  doe: "",
  timeFrom: "",
  timeTo: "",
  lifecyclePhase: "",
  industry: "",
  ticketSizeBand: "",
  geography: "",
  temperature: "",
  teamLeader: "",
  manager: "",
  leadSource: "",
  status: "",
  dueWindow: ""
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");

function Select({ label, value, onChange, options, placeholder = "All" }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">{label}</label>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterCard({ icon: Icon, label, children }) {
  return (
    <div className="rounded-[16px] border border-[#e7edf5] bg-white px-4 py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eef2ff] text-[#3046b2]">
          <Icon className="size-4" />
        </span>
        <span className="text-[13px] font-semibold text-[#102246]">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function UniversalFiltersModule() {
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showMore, setShowMore] = useState(false);

  // Previously swallowed silently — a facets-load failure (403 from the
  // module permission gate, an expired session, network issue) left every
  // dropdown looking empty/broken with zero indication why, while the
  // search error below (same backend gate) was already surfaced. Now uses
  // that same error banner so a real cause is always visible instead of a
  // mysterious "options don't work."
  useEffect(() => {
    universalFiltersApi
      .facets()
      .then(setFacets)
      .catch((err) => setError(`Could not load filter options: ${err.message}`));
  }, []);

  const runSearch = useCallback(() => {
    setLoading(true);
    universalFiltersApi
      .search(filters)
      .then((r) => {
        setResults(r);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  // Every filter here is now select-driven (Lead included, since it's a
  // dropdown of real leads rather than a typed search box), so this can
  // just run immediately instead of debouncing.
  useEffect(() => {
    runSearch();
  }, [runSearch]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const activeCount = Object.values(filters).filter(Boolean).length;
  const reset = () => setFilters(EMPTY_FILTERS);

  const leadOptions = useMemo(
    () => (facets?.leads ?? []).map((l) => ({ key: l.id, label: `${l.name} — ${l.company}` })),
    [facets]
  );
  const doeOptions = useMemo(() => asOptions(facets?.does ?? []), [facets]);
  const channelPartnerOptions = useMemo(() => asOptions(facets?.channelPartners ?? []), [facets]);
  const industryOptions = useMemo(() => asOptions(facets?.industries ?? []), [facets]);
  const geographyOptions = useMemo(() => asOptions(facets?.geographies ?? []), [facets]);
  const teamLeaderOptions = useMemo(() => asOptions(facets?.teamLeaders ?? []), [facets]);
  const managerOptions = useMemo(() => asOptions(facets?.managers ?? []), [facets]);
  const leadSourceOptions = useMemo(() => asOptions(facets?.leadSources ?? []), [facets]);

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          Intelligence
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
          Universal Filters
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          The same 14 filter dimensions, available across every report — filter the full lead pipeline by any
          combination of them.
        </p>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={SlidersIcon}
          iconClass="text-[#3046b2]"
          subtitle="These satisfy Requirement #2 — universal filters available in every report."
          action={
            activeCount ? (
              <ActionButton label={`Reset (${activeCount})`} icon={XIcon} small onClick={reset} />
            ) : undefined
          }
        >
          Universal Filters
        </SectionTitle>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterCard icon={UserCheckIcon} label="DOE (Deal Originator Executive)">
            <Select label="" value={filters.doe} onChange={set("doe")} options={doeOptions} />
          </FilterCard>

          <FilterCard icon={UsersIcon} label="Lead">
            <Select label="" value={filters.leadId} onChange={set("leadId")} options={leadOptions} />
          </FilterCard>

          <FilterCard icon={LinkIcon} label="Channel Partner">
            <Select label="" value={filters.channelPartner} onChange={set("channelPartner")} options={channelPartnerOptions} />
          </FilterCard>

          <FilterCard icon={CalendarIcon} label="Time Window">
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className={inputClass} value={filters.timeFrom} onChange={(e) => set("timeFrom")(e.target.value)} />
              <input type="date" className={inputClass} value={filters.timeTo} onChange={(e) => set("timeTo")(e.target.value)} />
            </div>
          </FilterCard>

          <FilterCard icon={WorkflowIcon} label="Lifecycle Phase">
            <Select label="" value={filters.lifecyclePhase} onChange={set("lifecyclePhase")} options={LIFECYCLE_STAGES.map((s) => ({ key: s.key, label: s.label }))} />
          </FilterCard>

          <FilterCard icon={GridIcon} label="Industry">
            <Select label="" value={filters.industry} onChange={set("industry")} options={industryOptions} />
          </FilterCard>

          <FilterCard icon={TagIcon} label="Ticket Size">
            <Select label="" value={filters.ticketSizeBand} onChange={set("ticketSizeBand")} options={TICKET_SIZE_BANDS} />
          </FilterCard>

          <FilterCard icon={RadarIcon} label="Geography">
            <Select label="" value={filters.geography} onChange={set("geography")} options={geographyOptions} />
          </FilterCard>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-4 text-[13px] font-semibold text-[#3046b2] hover:underline"
        >
          {showMore ? "Hide additional filters" : "Show additional filters"}
        </button>

        {showMore ? (
          <div className="mt-3 grid gap-3 rounded-[16px] border border-dashed border-[#d6deea] p-4 sm:grid-cols-2 xl:grid-cols-3">
            <Select label="Hot / Warm / Cold" value={filters.temperature} onChange={set("temperature")} options={TEMPERATURES} />
            <Select label="Team Leader" value={filters.teamLeader} onChange={set("teamLeader")} options={teamLeaderOptions} />
            <Select label="Manager" value={filters.manager} onChange={set("manager")} options={managerOptions} />
            <Select label="Lead Source" value={filters.leadSource} onChange={set("leadSource")} options={leadSourceOptions} />
            <Select label="Status" value={filters.status} onChange={set("status")} options={STATUSES} />
            <Select label="Next Action Due" value={filters.dueWindow} onChange={set("dueWindow")} options={DUE_WINDOWS} />
          </div>
        ) : null}
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={GridIcon} iconClass="text-[#3046b2]" subtitle="Up to 500 matching leads, most recent first.">
          Results
        </SectionTitle>

        {error ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                {["Lead", "Status", "Lifecycle Phase", "Industry", "Geography", "Ticket Size", "Temp", "Owner", "Next Action Due"].map((h) => (
                  <th key={h} className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(results?.leads ?? []).map((lead) => (
                <tr key={lead.id} className="border-b border-[#f1f4f9] last:border-0">
                  <td className="py-3 pr-4 text-[13px]">
                    <p className="font-semibold text-[#102246]">{lead.name}</p>
                    <p className="text-[12px] text-[#8592ab]">{lead.company}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATUS_TONE[lead.status]}>{lead.status}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{lead.lifecyclePhaseLabel}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{lead.industry ?? "—"}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{lead.territory ?? "—"}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">
                    {TICKET_SIZE_BANDS.find((b) => b.key === lead.ticketSizeBand)?.label ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {lead.temperature ? <Badge tone={TEMPERATURE_TONE[lead.temperature]}>{lead.temperature}</Badge> : "—"}
                  </td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{lead.owner ?? "Unassigned"}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={DUE_TONE[lead.dueWindow]}>{lead.nextActionDue ? fmtDate(lead.nextActionDue) : "—"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && results && results.leads.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No leads match this combination of filters.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
