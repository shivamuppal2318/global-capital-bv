import { useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { SearchIcon } from "../Icons.jsx";
import { buildLeadsCsv } from "../../lib/csvLeads.js";

function downloadSampleLeadsCsv() {
  const csv = buildLeadsCsv([{ name: "Jane Doe", company: "Acme Inc", email: "jane@acme.com", owner: "", country: "" }]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-subscribers.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function LeadsTab({ mailing }) {
  const {
    campaigns, allLeads, automationForm, handleFormChange, handleSaveAutomation, automationNotice,
    selectedCampaign, selectedCampaignId, setSelectedCampaignId,
    newLeadForm, setNewLeadForm, handleAddLead, handleDeleteLead,
    csvText, handleCsvTextChange, csvPreview, handlePreviewCsv, handleImportCsv, csvPreviewBusy, csvImportBusy
  } = mailing;
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [doubleOptIn, setDoubleOptIn] = useState(false);
  const [listDescription, setListDescription] = useState("");
  const [leadStatus, setLeadStatus] = useState("Customer");
  const [leadSource, setLeadSource] = useState("Facebook\nGoogle");
  const [city, setCity] = useState("");

  const filteredRows = campaigns.filter((campaign) => {
    const haystack = `${campaign.name} ${campaign.status}`.toLowerCase();
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
            Back to lists
          </button>
        </div>

        <div className="mx-auto max-w-[660px] rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="-mx-4 -mt-4 rounded-t-[24px] border-b border-[#e7edf5] px-4 py-4">
            <h2 className="text-[17px] font-semibold text-[#222347]">New List</h2>
          </div>

          <div className="mt-4 space-y-4">
            <Field label="List Name">
              <input
                value={automationForm.campaignName}
                onChange={(event) => handleFormChange("campaignName", event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
              />
            </Field>

            <Field label="Description">
              <textarea
                rows={4}
                value={listDescription}
                onChange={(event) => setListDescription(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-5 text-[#102246] outline-none"
              />
            </Field>

            <label className="flex items-center gap-2 text-[13px] font-medium text-[#435471]">
              <input type="checkbox" checked={doubleOptIn} onChange={(event) => setDoubleOptIn(event.target.checked)} className="h-4 w-4 rounded border-[#b9c4d8]" />
              Enable double opt-in
            </label>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleSaveAutomation}
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

  if (viewMode === "sync") {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
          >
            <span aria-hidden="true">←</span>
            Back to lists
          </button>
        </div>

        <div className="mx-auto max-w-[820px] rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="-mx-5 -mt-5 rounded-t-[24px] border-b border-[#e7edf5] px-5 py-5">
            <h2 className="text-[18px] font-semibold text-[#222347]">Sync CRM Leads</h2>
            <p className="mt-2 text-[13px] leading-5 text-[#7a86a0]">
              Import your AVP CRM leads into a MailX list. Filter by lead status, source and city — leave a filter empty to include all.
            </p>
          </div>

          <div className="mt-5 space-y-5">
            <Field label="Import into list *">
              <select
                value={automationForm.campaignName}
                onChange={(event) => handleFormChange("campaignName", event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] text-[#4b5370] outline-none"
              >
                <option value="">Select list</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.name}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setViewMode("form")}
                className="mt-2 text-[13px] font-medium text-[#5c6cff]"
              >
                New List
              </button>
            </Field>

            <Field label="Lead Status">
              <textarea
                rows={4}
                value={leadStatus}
                onChange={(event) => setLeadStatus(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-6 text-[#102246] outline-none"
              />
            </Field>

            <Field label="Lead Source">
              <textarea
                rows={4}
                value={leadSource}
                onChange={(event) => setLeadSource(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-6 text-[#102246] outline-none"
              />
            </Field>

            <Field label="City">
              <textarea
                rows={5}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-6 text-[#102246] outline-none"
              />
            </Field>

            <p className="-mt-2 text-[12px] text-[#7a86a0]">Hold Ctrl (Cmd on Mac) to select more than one.</p>

            <div className="rounded-[4px] border-l-[4px] border-[#47b8ff] bg-[#eef6ff] px-5 py-4 text-[14px] text-[#3867e8]">
              Matching leads: {allLeads.length}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleSaveAutomation}
                className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (viewMode === "subscribers") {
    return (
      <SubscribersView
        selectedCampaign={selectedCampaign}
        selectedCampaignId={selectedCampaignId}
        allLeads={allLeads}
        newLeadForm={newLeadForm}
        setNewLeadForm={setNewLeadForm}
        handleAddLead={handleAddLead}
        handleDeleteLead={handleDeleteLead}
        csvText={csvText}
        handleCsvTextChange={handleCsvTextChange}
        csvPreview={csvPreview}
        handlePreviewCsv={handlePreviewCsv}
        handleImportCsv={handleImportCsv}
        csvPreviewBusy={csvPreviewBusy}
        csvImportBusy={csvImportBusy}
        automationNotice={automationNotice}
        onBack={() => setViewMode("list")}
      />
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
              New List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("sync")}
              className="rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#435471]"
            >
              Sync CRM Leads
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
                <th className="px-4 py-3">List Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Subscribers</th>
                <th className="px-4 py-3">Hosted Signup Form URL</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                    <td className="px-4 py-3 font-medium text-[#102246]">{row.name}</td>
                    <td className="px-4 py-3">Campaign-backed list</td>
                    <td className="px-4 py-3">{row.leadCount ?? allLeads.length}</td>
                    <td className="px-4 py-3">—</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCampaignId(row.id);
                            setViewMode("subscribers");
                          }}
                          className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleFormChange("campaignName", row.name);
                            setViewMode("form");
                          }}
                          className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471]"
                        >
                          Settings
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
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}

// One list's subscribers — the screen a "New List"/"Open" is actually
// missing today: add one subscriber at a time, or a whole CSV, and see
// who's already on the list. Every field here (allLeads, newLeadForm,
// handleAddLead, the CSV preview/import pair) already existed in
// useEmailOutreachState.js — built for this screen but never rendered
// anywhere, so this wires up existing plumbing rather than adding new
// backend surface.
function SubscribersView({
  selectedCampaign, selectedCampaignId, allLeads,
  newLeadForm, setNewLeadForm, handleAddLead, handleDeleteLead,
  csvText, handleCsvTextChange, csvPreview, handlePreviewCsv, handleImportCsv, csvPreviewBusy, csvImportBusy,
  automationNotice, onBack
}) {
  const inputClass = "w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none";

  function handleCsvFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleCsvTextChange(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
        >
          <span aria-hidden="true">←</span>
          Back to lists
        </button>
        <p className="text-[13px] text-[#6a7790]">{selectedCampaign?.name ?? "List"}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.4fr] xl:items-start">
        <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[15px] font-semibold text-[#222347]">Add Subscriber</h2>
          <div className="mt-3 space-y-3">
            <Field label="Email">
              <input
                type="email"
                value={newLeadForm.email}
                onChange={(event) => setNewLeadForm((current) => ({ ...current, email: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Name">
              <input
                value={newLeadForm.name}
                onChange={(event) => setNewLeadForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Company Name">
              <input
                value={newLeadForm.company}
                onChange={(event) => setNewLeadForm((current) => ({ ...current, company: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <ActionButton label="Add Subscriber" primary onClick={handleAddLead} disabled={!selectedCampaignId} />
          </div>

          <div className="mt-5 border-t border-[#e7edf5] pt-4">
            <h3 className="text-[13px] font-semibold text-[#222347]">Import (CSV)</h3>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} className="mt-2 text-[13px] text-[#5d6286]" />
            <p className="mt-2 text-[11px] leading-4 text-[#8593ac]">
              CSV columns: name, company, email, owner (optional), country (optional). A header row is required.
            </p>
            <button type="button" onClick={downloadSampleLeadsCsv} className="mt-1 text-[12px] font-medium text-[#3046b2] hover:underline">
              Download sample CSV
            </button>

            {csvText ? (
              <div className="mt-3 space-y-2">
                {csvPreview ? (
                  <p className="text-[12px] text-[#5d6286]">
                    {csvPreview.readyCount} ready · {csvPreview.duplicateCount} duplicate(s) · {csvPreview.invalidCount} invalid
                  </p>
                ) : null}
                <ActionButton
                  label={csvPreviewBusy ? "Checking…" : csvImportBusy ? "Importing…" : csvPreview ? "Import CSV" : "Preview CSV"}
                  primary
                  disabled={csvPreviewBusy || csvImportBusy || !selectedCampaignId}
                  onClick={csvPreview ? handleImportCsv : handlePreviewCsv}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[15px] font-semibold text-[#222347]">
            {selectedCampaign?.name ?? "List"} ({allLeads.length} Subscribers)
          </h2>
          <div className="mt-3 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Subscribed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allLeads.length ? (
                  allLeads.map((lead) => (
                    <tr key={lead.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                      <td className="px-4 py-3 font-medium text-[#102246]">{lead.email}</td>
                      <td className="px-4 py-3">{lead.name}</td>
                      <td className="px-4 py-3">{lead.company}</td>
                      <td className="px-4 py-3">{lead.stage}</td>
                      <td className="px-4 py-3">{lead.unsubscribed ? "No" : "Yes"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#e0483f]"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-4 py-5 text-[13px] text-[#7a7d9c]">
                      No subscribers yet — add one above or import a CSV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}
