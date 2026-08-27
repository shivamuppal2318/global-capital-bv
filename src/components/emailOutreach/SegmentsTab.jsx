import { useState } from "react";
import { SearchIcon, XIcon } from "../Icons.jsx";

export function SegmentsTab({ mailing }) {
  const { campaigns, allLeads, automationNotice } = mailing;
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [matchType, setMatchType] = useState("All conditions (AND)");
  const [fieldName, setFieldName] = useState("Email");
  const [operator, setOperator] = useState("Contains");
  const [fieldValue, setFieldValue] = useState("");

  const rows = [];
  const filteredRows = rows.filter((row) => {
    const haystack = `${row.name} ${row.match} ${row.conditions}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

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
            <h2 className="text-[18px] font-semibold text-[#222347]">New Segment</h2>
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
                value={selectedList}
                onChange={(event) => setSelectedList(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
              >
                <option value="">Select List</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.name}>
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
                <option>All conditions (AND)</option>
                <option>Any condition (OR)</option>
              </select>
            </label>

            <div>
              <p className="mb-2 text-[14px] font-semibold text-[#303750]">Conditions</p>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <select
                  value={fieldName}
                  onChange={(event) => setFieldName(event.target.value)}
                  className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
                >
                  <option>Email</option>
                  <option>Name</option>
                  <option>Company</option>
                  <option>Status</option>
                  <option>Source</option>
                  <option>City</option>
                </select>
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                  className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
                >
                  <option>Contains</option>
                  <option>Equals</option>
                  <option>Starts with</option>
                  <option>Ends with</option>
                </select>
                <input
                  value={fieldValue}
                  onChange={(event) => setFieldValue(event.target.value)}
                  className="rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#102246] outline-none"
                />
                <button type="button" className="grid h-12 w-12 place-items-center rounded-full bg-[#ff4d68] text-white">
                  <XIcon className="size-4" />
                </button>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#435471]"
                >
                  Add Condition
                </button>
              </div>
            </div>

            <div className="border-t border-[#e7edf5] pt-5">
              <button
                type="button"
                className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
              >
                Save
              </button>
            </div>

            <p className="text-[11px] leading-4 text-[#8593ac]">{automationNotice}</p>
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
              onClick={() => setViewMode("form")}
              className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
            >
              New Segment
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] text-[#6a7790]">25</div>
            <button
              type="button"
              className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] font-medium text-[#6a7790]"
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

        <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-4 py-3">Segment Name</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Conditions</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                    <td className="px-4 py-3 font-medium text-[#102246]">{row.name}</td>
                    <td className="px-4 py-3">{row.match}</td>
                    <td className="px-4 py-3">{row.conditions}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setViewMode("form")}
                        className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-4 py-5 text-[13px] text-[#7a7d9c]">
                    No entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[12px] text-[#8593ac]">Available list subscribers: {allLeads.length}</p>
      </div>
    </section>
  );
}
