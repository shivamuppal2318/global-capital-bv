import { useState } from "react";
import { ActionButton, Field, noteToneClass } from "../ui.jsx";
import { UsersIcon, SearchIcon, PlusIcon, UploadIcon } from "../Icons.jsx";
import { buildLeadsCsv } from "../../lib/csvLeads.js";

const csvTemplateExampleRow = { name: "Deepa Paul", company: "Nordwind Energy", email: "deepa@nordwind.de", owner: "Rahul R" };

function downloadCsvFile(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const leadStatusLabel = {
  NO_REPLY: "No reply yet",
  INTERESTED: "Interested",
  ZOOM_REQUEST: "Wants Zoom",
  INFO_REQUEST: "Asked for info"
};

const leadStatusToneClass = {
  NO_REPLY: "bg-[#edf2f7] text-[#748096]",
  INTERESTED: noteToneClass.green,
  ZOOM_REQUEST: noteToneClass.indigo,
  INFO_REQUEST: noteToneClass.amber
};

// leadScoreBand/qualification come from the backend (server/src/lib/leadScoring.js),
// computed from this lead's real activity log (opens, clicks, NDA, calls, bounces)
// — not recomputed here, so the badge always matches what the server qualified/rejected.
const leadScoreBandToneClass = {
  hot: noteToneClass.green,
  warm: noteToneClass.amber,
  cold: noteToneClass.slate,
  risk: noteToneClass.red
};

// Lead intake and the full roster for the selected campaign — adding leads
// (single or CSV) and seeing everyone enrolled. What happens once a lead
// replies (detection, draft, timeline, workflow) lives in RepliesTab.jsx;
// the follow-up cadence config lives in AutomationTab.jsx — kept separate so
// this tab stays a quick, scannable "who's in this campaign" view instead of
// stacking every reply-handling concern underneath it.
export function LeadsTab({ mailing }) {
  const {
    allLeads, handleDeleteLead,
    selectedCampaign, newLeadForm, setNewLeadForm, handleAddLead, csvText, handleCsvTextChange, csvPreview, handlePreviewCsv,
    handleImportCsv, csvImportBusy, csvPreviewBusy, automationNotice
  } = mailing;

  async function handleCsvFileUpload(event) {
    const file = event.target.files?.[0];
    // Reset immediately (not after reading) so selecting the same file again
    // later still fires onChange — browsers otherwise treat re-picking an
    // identical path as a no-op change event.
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    handleCsvTextChange(text);
  }
  // Purely a UI toggle (which entry method is showing) — doesn't need to
  // survive switching tabs, so it stays local instead of living in the
  // shared mailing state.
  const [leadEntryMode, setLeadEntryMode] = useState("single");
  // "All leads" pagination is purely a display concern over data the hook
  // already loaded in full (allLeads) — no reason to push page/pageSize into
  // the shared hook or re-fetch per page.
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPerPage, setLeadsPerPage] = useState(25);
  const leadsTotalPages = Math.max(1, Math.ceil(allLeads.length / leadsPerPage));
  const leadsPageSafe = Math.min(leadsPage, leadsTotalPages);
  const pagedLeads = allLeads.slice((leadsPageSafe - 1) * leadsPerPage, leadsPageSafe * leadsPerPage);
  const leadScoreCounts = {
    hot: allLeads.filter((lead) => lead.leadScoreBand === "hot").length,
    warm: allLeads.filter((lead) => lead.leadScoreBand === "warm").length,
    cold: allLeads.filter((lead) => lead.leadScoreBand === "cold").length,
    risk: allLeads.filter((lead) => lead.leadScoreBand === "risk").length
  };

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-[#e7edf5] px-4 py-3.5">
          <div>
            <div className="flex items-center gap-3">
              <PlusIcon className="size-5 text-[#2b9b60]" />
              <p className="text-[15px] font-semibold text-[#102246]">Add leads</p>
            </div>
            <p className="mt-0.5 pl-8 text-[13px] text-[#8593ac]">
              Adds them to {selectedCampaign?.name ?? "the selected campaign"} and starts the automatic follow-up emails.
            </p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-[10px] bg-[#f0f3f9] p-1">
            <button
              type="button"
              onClick={() => setLeadEntryMode("single")}
              className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                leadEntryMode === "single" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
              }`}
            >
              Single lead
            </button>
            <button
              type="button"
              onClick={() => setLeadEntryMode("csv")}
              className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                leadEntryMode === "csv" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
              }`}
            >
              CSV import
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          {leadEntryMode === "single" ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name">
                  <input
                    value={newLeadForm.name}
                    onChange={(event) => setNewLeadForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={newLeadForm.company}
                    onChange={(event) => setNewLeadForm((current) => ({ ...current, company: event.target.value }))}
                    className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(event) => setNewLeadForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <ActionButton label="Add lead" icon={PlusIcon} primary onClick={handleAddLead} />
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-5 text-[#6a7790]">
                Upload a .csv file or paste rows with a header of{" "}
                <code className="rounded bg-[#f0f3f9] px-1.5 py-0.5 text-[12px]">name,company,email,owner</code> (owner is
                optional). One bad row won't block the rest of the batch.{" "}
                <button
                  type="button"
                  onClick={() => downloadCsvFile("leads-template.csv", buildLeadsCsv([csvTemplateExampleRow]))}
                  className="font-semibold text-[#3046b2] underline-offset-2 hover:underline"
                >
                  Download template
                </button>
              </p>
              <div className="mt-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] font-medium text-[#435471] hover:bg-[#f7f9fc]">
                  <UploadIcon className="size-4" />
                  Upload CSV file
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvFileUpload} className="hidden" />
                </label>
              </div>
              <textarea
                rows={5}
                placeholder={"name,company,email,owner\nDeepa Paul,Nordwind Energy,deepa@nordwind.de,Rahul R"}
                value={csvText}
                onChange={(event) => handleCsvTextChange(event.target.value)}
                className="mt-3 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[13px] font-mono text-[#102246] outline-none focus:border-[#3046b2]"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton
                  label={csvPreviewBusy ? "Checking emails…" : "Preview CSV"}
                  icon={SearchIcon}
                  onClick={handlePreviewCsv}
                  disabled={!csvText.trim() || csvImportBusy || csvPreviewBusy}
                />
                <ActionButton
                  label={csvImportBusy ? "Importing…" : csvPreview ? `Import ${csvPreview.readyCount} ready row(s)` : "Import CSV"}
                  icon={UploadIcon}
                  primary
                  onClick={handleImportCsv}
                  disabled={!csvText.trim() || csvImportBusy || csvPreviewBusy || (csvPreview ? csvPreview.readyCount === 0 : false)}
                />
              </div>

              {csvPreview ? (
                <div className="mt-4 rounded-[14px] border border-[#e7edf5] bg-[#f8faff] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass.green}`}>
                        {csvPreview.readyCount} ready
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass.amber}`}>
                        {csvPreview.duplicateCount} duplicate
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass.red}`}>
                        {csvPreview.invalidCount} invalid
                      </span>
                    </div>
                    {csvPreview.readyCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          downloadCsvFile("leads-ready.csv", buildLeadsCsv(csvPreview.rows.filter((row) => row.status === "ready")))
                        }
                        className="text-[12px] font-semibold text-[#3046b2] underline-offset-2 hover:underline"
                      >
                        Download ready rows
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-[10px] border border-[#e7edf5]">
                    <table className="w-full text-left text-[13px]">
                      <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-[#8593ac]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 font-semibold">Company</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.rows.map((row, index) => (
                          <tr key={`${row.email || "row"}-${index}`} className="border-t border-[#e7edf5] bg-white">
                            <td className="px-3 py-2 text-[#102246]">{row.name || "—"}</td>
                            <td className="px-3 py-2 text-[#5f6f89]">{row.company || "—"}</td>
                            <td className="px-3 py-2 text-[#5f6f89]">{row.email || "—"}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  row.status === "ready" ? noteToneClass.green : row.status === "invalid" ? noteToneClass.red : noteToneClass.amber
                                }`}
                              >
                                {row.status === "ready" ? "ready" : row.status === "invalid" ? "invalid" : "duplicate"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#8593ac]">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-[#e7edf5] bg-[#f8faff] px-4 py-3">
          <p className="text-[13px] font-medium text-[#102246]">{automationNotice}</p>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UsersIcon className="size-5 text-[#4766cc]" />
            <p className="text-[15px] font-semibold text-[#102246]">All leads in {selectedCampaign?.name ?? "this campaign"}</p>
          </div>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">{allLeads.length} total</span>
        </div>
        <p className="mt-1 text-[13px] text-[#8593ac]">
          Every lead enrolled here, whether they've replied yet or not — this is what confirms "Add lead" actually saved something.
        </p>

        {allLeads.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <div className="rounded-[12px] border border-[#cce7d6] bg-[#f1fbf5] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2b9b60]">Hot</p>
                <p className="mt-1 text-[20px] font-bold text-[#102246]">{leadScoreCounts.hot}</p>
              </div>
              <div className="rounded-[12px] border border-[#ffe9d0] bg-[#fff8ee] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#c07c1f]">Warm</p>
                <p className="mt-1 text-[20px] font-bold text-[#102246]">{leadScoreCounts.warm}</p>
              </div>
              <div className="rounded-[12px] border border-[#e7edf5] bg-[#f8faff] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#748096]">Cold</p>
                <p className="mt-1 text-[20px] font-bold text-[#102246]">{leadScoreCounts.cold}</p>
              </div>
              <div className="rounded-[12px] border border-[#ffe3e3] bg-[#fff5f5] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#e0483f]">Risk / rejected</p>
                <p className="mt-1 text-[20px] font-bold text-[#102246]">{leadScoreCounts.risk}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#e7edf5] bg-[#f8faff] px-3 py-2.5">
              <p className="text-[13px] text-[#5f6f89]">
                Showing {(leadsPageSafe - 1) * leadsPerPage + 1}-{Math.min(leadsPageSafe * leadsPerPage, allLeads.length)} of {allLeads.length} leads
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[#8593ac]">Per page</span>
                <select
                  value={leadsPerPage}
                  onChange={(event) => {
                    setLeadsPerPage(Number(event.target.value));
                    setLeadsPage(1);
                  }}
                  className="h-8 rounded-[8px] border border-[#d6deea] bg-white px-2 text-[12px] text-[#435471]"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={leadsPageSafe <= 1}
                  onClick={() => setLeadsPage((current) => Math.max(1, current - 1))}
                  className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471] disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="min-w-[5rem] text-center text-[12px] text-[#5f6f89]">Page {leadsPageSafe} / {leadsTotalPages}</span>
                <button
                  type="button"
                  disabled={leadsPageSafe >= leadsTotalPages}
                  onClick={() => setLeadsPage((current) => Math.min(leadsTotalPages, current + 1))}
                  className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-[16px] border border-[#e7edf5]">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-[#e7edf5] bg-white text-[13px] font-medium text-[#8593ac]">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Name</th>
                    <th className="px-5 py-3.5 font-medium">Company</th>
                    <th className="px-5 py-3.5 font-medium">Email</th>
                    <th className="px-5 py-3.5 font-medium">Owner</th>
                    <th className="px-5 py-3.5 font-medium">Status</th>
                    <th className="px-5 py-3.5 font-medium">Score</th>
                    <th className="px-5 py-3.5 font-medium">Flags</th>
                    <th className="px-5 py-3.5 font-medium">Added</th>
                    <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7edf5]">
                  {pagedLeads.map((lead) => (
                    <tr key={lead.id} className="group bg-white transition hover:bg-[#f8faff]">
                      <td className="px-5 py-5 align-top font-semibold text-[#102246]">{lead.name}</td>
                      <td className="px-5 py-5 align-top text-[#435471]">{lead.company}</td>
                      <td className="px-5 py-5 align-top text-[#435471]">{lead.email}</td>
                      <td className="px-5 py-5 align-top text-[#435471]">{lead.owner}</td>
                      <td className="px-5 py-5 align-top">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${leadStatusToneClass[lead.replyType] ?? "bg-[#edf2f7] text-[#748096]"}`}>
                          {leadStatusLabel[lead.replyType] ?? lead.replyType}
                        </span>
                      </td>
                      <td className="px-5 py-5 align-top">
                        <span
                          title={lead.leadScoreReasons?.length ? lead.leadScoreReasons.join(", ") : "No engagement recorded yet"}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${leadScoreBandToneClass[lead.leadScoreBand] ?? noteToneClass.slate}`}
                        >
                          {lead.leadScore}/100 {lead.leadScoreBand}
                        </span>
                      </td>
                      <td className="px-5 py-5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {lead.bounced ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${noteToneClass.red}`}>Bounced</span> : null}
                          {lead.unsubscribed ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${noteToneClass.slate}`}>Unsubscribed</span> : null}
                          {lead.ndaSignedAt ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${noteToneClass.green}`}>NDA signed</span> : null}
                          {!lead.bounced && !lead.unsubscribed && !lead.ndaSignedAt ? <span className="text-[13px] text-[#c7cedb]">—</span> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 align-top text-[#8593ac]">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-5 align-top text-right">
                        <button
                          type="button"
                          title="Delete lead"
                          aria-label="Delete lead"
                          onClick={() => {
                            if (window.confirm(`Delete ${lead.name} (${lead.company})? This also removes their reply/activity history.`)) {
                              handleDeleteLead(lead);
                            }
                          }}
                          className="grid size-7 place-items-center rounded-[8px] text-[#c7cedb] opacity-0 transition group-hover:opacity-100 hover:bg-[#fdecf1] hover:text-[#a13a56]"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">No leads in this campaign yet — add one above.</p>
        )}
      </div>
    </section>
  );
}
