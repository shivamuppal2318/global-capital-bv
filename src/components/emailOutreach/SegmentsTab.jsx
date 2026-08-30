import { useEffect, useState } from "react";
import { SearchIcon, XIcon } from "../Icons.jsx";
import { emailSegmentsApi } from "../../lib/emailSegmentsApi.js";

// Real field/operator vocabulary as a fallback for the one render before
// emailSegmentsApi.fields() resolves, and in case the backend is briefly
// unreachable — kept in sync by hand with lib/segmentMatching.js's exports,
// same set of six fields/four operators.
const FALLBACK_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: "country", label: "Country" },
  { key: "replyType", label: "Reply Type" }
];
const FALLBACK_OPERATORS = [
  { key: "contains", label: "Contains" },
  { key: "equals", label: "Equals" },
  { key: "startsWith", label: "Starts with" },
  { key: "endsWith", label: "Ends with" }
];

function emptyCondition() {
  return { field: "email", operator: "contains", value: "" };
}

function matchTypeLabel(matchType) {
  return matchType === "ANY" ? "Any condition (OR)" : "All conditions (AND)";
}

function conditionsSummary(conditions, matchType, fieldLabelByKey, operatorLabelByKey) {
  const usable = (conditions ?? []).filter((c) => c.value?.trim());
  if (!usable.length) return "No conditions — matches everyone in scope";
  const joiner = matchType === "ANY" ? " OR " : " AND ";
  return usable.map((c) => `${fieldLabelByKey[c.field] ?? c.field} ${(operatorLabelByKey[c.operator] ?? c.operator).toLowerCase()} "${c.value}"`).join(joiner);
}

// Builds a downloadable CSV from the real saved segments — replaces the
// mockup's Export button, which previously had no onClick handler at all.
function downloadSegmentsCsv(segments, fieldLabelByKey, operatorLabelByKey) {
  const header = ["Segment Name", "List", "Match", "Conditions", "Matching leads"];
  const rows = segments.map((segment) => [
    segment.name,
    segment.campaign?.name ?? "All lists",
    matchTypeLabel(segment.matchType),
    conditionsSummary(segment.conditions, segment.matchType, fieldLabelByKey, operatorLabelByKey),
    String(segment.matchingCount ?? 0)
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "segments.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function SegmentsTab({ mailing }) {
  const { campaigns } = mailing;
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [segments, setSegments] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState("");
  const [fieldOptions, setFieldOptions] = useState(FALLBACK_FIELDS);
  const [operatorOptions, setOperatorOptions] = useState(FALLBACK_OPERATORS);

  const [editingSegmentId, setEditingSegmentId] = useState(null);
  const [segmentName, setSegmentName] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [matchType, setMatchType] = useState("ALL");
  const [conditions, setConditions] = useState([emptyCondition()]);
  const [saving, setSaving] = useState(false);

  function loadSegments() {
    emailSegmentsApi
      .list()
      .then((backendSegments) => {
        setSegments(backendSegments);
        setLoadError(null);
      })
      .catch((error) => setLoadError(error.message));
  }

  useEffect(() => {
    loadSegments();
    emailSegmentsApi
      .fields()
      .then(({ fields, operators }) => {
        setFieldOptions(fields);
        setOperatorOptions(operators);
      })
      .catch(() => {
        // Backend unreachable — keep the fallback lists above.
      });
  }, []);

  const fieldLabelByKey = Object.fromEntries(fieldOptions.map((f) => [f.key, f.label]));
  const operatorLabelByKey = Object.fromEntries(operatorOptions.map((o) => [o.key, o.label]));

  const filteredSegments = segments.filter((segment) => {
    const haystack = `${segment.name} ${segment.campaign?.name ?? ""} ${conditionsSummary(segment.conditions, segment.matchType, fieldLabelByKey, operatorLabelByKey)}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

  function openNewForm() {
    setEditingSegmentId(null);
    setSegmentName("");
    setSelectedCampaignId("");
    setMatchType("ALL");
    setConditions([emptyCondition()]);
    setNotice("");
    setViewMode("form");
  }

  function openEditForm(segment) {
    setEditingSegmentId(segment.id);
    setSegmentName(segment.name);
    setSelectedCampaignId(segment.campaignId ?? "");
    setMatchType(segment.matchType);
    setConditions(segment.conditions?.length ? segment.conditions.map((c) => ({ ...c })) : [emptyCondition()]);
    setNotice("");
    setViewMode("form");
  }

  function updateCondition(index, patch) {
    setConditions((current) => current.map((condition, i) => (i === index ? { ...condition, ...patch } : condition)));
  }

  function addCondition() {
    setConditions((current) => [...current, emptyCondition()]);
  }

  function removeCondition(index) {
    setConditions((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function handleSave() {
    if (!segmentName.trim()) {
      setNotice("Give this segment a name before saving.");
      return;
    }

    const payload = {
      name: segmentName.trim(),
      campaignId: selectedCampaignId || null,
      matchType,
      conditions: conditions.filter((c) => c.value?.trim())
    };

    setSaving(true);
    try {
      if (editingSegmentId) {
        await emailSegmentsApi.update(editingSegmentId, payload);
        setNotice(`"${payload.name}" updated.`);
      } else {
        await emailSegmentsApi.create(payload);
        setNotice(`"${payload.name}" saved.`);
      }
      loadSegments();
      setViewMode("list");
    } catch (error) {
      setNotice(`Could not save this segment (${error.message}).`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(segment) {
    try {
      await emailSegmentsApi.remove(segment.id);
      setSegments((current) => current.filter((s) => s.id !== segment.id));
    } catch (error) {
      setLoadError(`Could not delete "${segment.name}" (${error.message}).`);
    }
  }

  if (viewMode === "form") {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
          >
            <span aria-hidden="true">←</span>
            Back to segments
          </button>
        </div>

        <div className="mx-auto max-w-[820px] rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="-mx-5 -mt-5 rounded-t-[24px] border-b border-[#e7edf5] px-5 py-5">
            <h2 className="text-[18px] font-semibold text-[#222347]">{editingSegmentId ? "Edit Segment" : "New Segment"}</h2>
          </div>

          <div className="mt-5 space-y-5">
            <label className="block">
              <p className="mb-2 text-[14px] font-semibold text-[#303750]">Segment Name</p>
              <input
                value={segmentName}
                onChange={(event) => setSegmentName(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#102246] outline-none"
              />
            </label>

            <label className="block">
              <p className="mb-2 text-[14px] font-semibold text-[#303750]">List</p>
              <select
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
              >
                <option value="">All lists (every campaign)</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <p className="mb-2 text-[14px] font-semibold text-[#303750]">Match</p>
              <select
                value={matchType}
                onChange={(event) => setMatchType(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
              >
                <option value="ALL">All conditions (AND)</option>
                <option value="ANY">Any condition (OR)</option>
              </select>
            </label>

            <div>
              <p className="mb-2 text-[14px] font-semibold text-[#303750]">Conditions</p>
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <select
                      value={condition.field}
                      onChange={(event) => updateCondition(index, { field: event.target.value })}
                      className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
                    >
                      {fieldOptions.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(event) => updateCondition(index, { operator: event.target.value })}
                      className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
                    >
                      {operatorOptions.map((operator) => (
                        <option key={operator.key} value={operator.key}>
                          {operator.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={condition.value}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                      className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#102246] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      disabled={conditions.length === 1}
                      className="grid h-12 w-12 place-items-center rounded-full bg-[#ff4d68] text-white disabled:opacity-40"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={addCondition}
                  className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#435471]"
                >
                  Add Condition
                </button>
              </div>
            </div>

            <div className="border-t border-[#e7edf5] pt-5">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            {notice ? <p className="text-[11px] leading-4 text-[#8593ac]">{notice}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewForm}
              className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
            >
              New Segment
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] text-[#6a7790]">{segments.length}</div>
            <button
              type="button"
              onClick={() => downloadSegmentsCsv(segments, fieldLabelByKey, operatorLabelByKey)}
              disabled={!segments.length}
              className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] font-medium text-[#6a7790] disabled:opacity-40"
            >
              Export
            </button>
            <div className="flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#5f6f89]">
              <SearchIcon className="size-4" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search..."
                className="w-36 bg-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {loadError ? <p className="mt-3 text-[13px] text-[#e0483f]">{loadError}</p> : null}

        <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-4 py-3">Segment Name</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Conditions</th>
                <th className="px-4 py-3">Matching leads</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSegments.length ? (
                filteredSegments.map((segment) => (
                  <tr key={segment.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                    <td className="px-4 py-3 font-medium text-[#102246]">
                      {segment.name}
                      <p className="mt-0.5 text-[11px] font-normal text-[#8a94aa]">{segment.campaign?.name ?? "All lists"}</p>
                    </td>
                    <td className="px-4 py-3">{matchTypeLabel(segment.matchType)}</td>
                    <td className="px-4 py-3">{conditionsSummary(segment.conditions, segment.matchType, fieldLabelByKey, operatorLabelByKey)}</td>
                    <td className="px-4 py-3">
                      {segment.matchingCount} / {segment.totalInScope}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(segment)}
                          className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(segment)}
                          className="rounded-[10px] border border-[#f3c9cc] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#e0483f]"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-5 text-[13px] text-[#7a7d9c]">
                    No entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[12px] text-[#8593ac]">Available list subscribers: {mailing.allLeads.length}</p>
      </div>
    </section>
  );
}
