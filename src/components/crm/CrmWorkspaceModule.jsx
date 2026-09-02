import { useEffect, useState } from "react";
import {
  FunnelIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RadarIcon,
  SendIcon,
  TagIcon,
  UploadIcon,
  UserCheckIcon
} from "../Icons";
import { ActionButton, Card, noteToneClass, SectionTitle, StatCard } from "../ui";
import { leadsApi } from "../../lib/leadsApi";
import { universalFiltersApi } from "../../lib/universalFiltersApi";
import { parseCrmLeadsCsv } from "../../lib/csvCrmLeads";

const avatarToneClass = {
  blue: "bg-[#dff1ff] text-[#2f96da]",
  amber: "bg-[#ffe6cc] text-[#f29b3a]",
  green: "bg-[#dff5e7] text-[#2a9c60]",
  violet: "bg-[#efe5ff] text-[#8b52d0]",
  sky: "bg-[#def1ff] text-[#2b94da]"
};

const STATUS_LABEL = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", NEGOTIATION: "Negotiation", CONVERTED: "Converted", LOST: "Lost" };

const TEMPERATURE_OPTIONS = ["HOT", "WARM", "COLD"];

// Per-lead "Deal Journey" tracker styling — deliberately distinct from the
// pipeline-by-stage bar chart above and from Executive Dashboard's
// company-wide Funnel Health chart: this is one lead's real stage-by-stage
// status, sourced from server/src/lib/leadPipeline.js.
const PIPELINE_STATUS_STYLE = {
  done: { dot: "bg-[#2a9c60] text-white", line: "bg-[#2a9c60]", label: "text-[#2a9c60]" },
  in_progress: { dot: "bg-[#f29b3a] text-white", line: "bg-[#e7edf5]", label: "text-[#f29b3a]" },
  blocked: { dot: "bg-[#e0483f] text-white", line: "bg-[#e7edf5]", label: "text-[#e0483f]" },
  not_started: { dot: "border-2 border-[#d6deea] bg-white text-[#aab4c6]", line: "bg-[#e7edf5]", label: "text-[#8592ab]" }
};

// The full single-lead workspace — identity, one-click actions, the Deal
// Journey tracker and the Overview/Timeline/Interactions tabs — all of it
// lives in this popup now rather than as a permanently-visible column next
// to the table: with the table already showing name/company/status, keeping
// a second full copy of the same lead on screen at all times was pure
// clutter. Opens only when a row in New Enquiries is clicked.
function LeadDetailModal({
  lead, overview, pipeline, pipelineLoading, onClose,
  editing, editForm, setEditForm, saving, saveError, startEdit, setEditing, saveEdit,
  activeTab, setActiveTab, facets, inviting, inviteResult, onSendInvite,
  previewLoading, previewError, onViewClientDashboard
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!lead) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[860px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7edf5] px-6 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className={`grid size-12 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${avatarToneClass[lead.tone]}`}>
              {lead.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-[#102246]">{lead.name}</p>
              <p className="mt-1 truncate text-[14px] text-[#5f6f89]">
                {lead.company} · Owner {lead.owner ?? "Unassigned"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${noteToneClass[lead.tone]}`}>{STATUS_LABEL[lead.status]}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-3">
            <ActionButton label="Send Mail" icon={MailIcon} primary />
            <ActionButton label="WhatsApp" icon={SendIcon} />
            <ActionButton label="Call" icon={PhoneIcon} />
            <ActionButton label="Convert" icon={UserCheckIcon} />
            <ActionButton label={editing ? "Editing…" : "Edit"} icon={PencilIcon} onClick={startEdit} disabled={editing} />
            <ActionButton label="Tags" icon={TagIcon} />
            <ActionButton
              label={inviting ? "Inviting…" : "Send Portal Invite"}
              icon={SendIcon}
              onClick={onSendInvite}
              disabled={inviting || Boolean(lead.clientUser)}
            />
          </div>

          {lead.clientUser ? (
            <div className="mt-4 rounded-[14px] border border-[#e7edf5] bg-[#f8faff] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-[#102246]">Client Portal Account</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    lead.clientUser.status === "SUSPENDED" ? noteToneClass.amber : noteToneClass.green
                  }`}
                >
                  {lead.clientUser.status === "SUSPENDED" ? "Suspended" : "Active"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-[13px] text-[#435471] sm:grid-cols-2">
                <p>
                  <span className="text-[#8592ab]">Login ID (email)</span>
                  <br />
                  <span className="font-medium text-[#102246]">{lead.clientUser.email}</span>
                </p>
                <p>
                  <span className="text-[#8592ab]">Last login</span>
                  <br />
                  <span className="font-medium text-[#102246]">
                    {lead.clientUser.lastLoginAt ? new Date(lead.clientUser.lastLoginAt).toLocaleString() : "Never"}
                  </span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton
                  label={previewLoading ? "Opening…" : "View Client Dashboard"}
                  icon={RadarIcon}
                  onClick={onViewClientDashboard}
                  disabled={previewLoading}
                />
              </div>
              {previewError ? <p className="mt-2 text-[12.5px] text-[#e0483f]">{previewError}</p> : null}
            </div>
          ) : null}

          {inviteResult ? (
            <div className="mt-3 rounded-[12px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3 text-[13px]">
              {inviteResult.ok ? (
                inviteResult.sent ? (
                  <p className="text-[#2a9c60]">Invite emailed to {lead.email}.</p>
                ) : (
                  <div>
                    <p className="text-[#c47f1a]">Not emailed — {inviteResult.reason} Copy the link below and send it manually:</p>
                    <p className="mt-1.5 break-all rounded-[8px] bg-white px-3 py-2 font-mono text-[12px] text-[#3046b2]">
                      {inviteResult.inviteUrl}
                    </p>
                  </div>
                )
              ) : (
                <p className="text-[#e0483f]">{inviteResult.error}</p>
              )}
            </div>
          ) : null}

          <div className="mt-6 border-t border-[#e7edf5] pt-6">
            <SectionTitle icon={RadarIcon} iconClass="text-[#2f96da]">
              Deal Journey
            </SectionTitle>
            <p className="mt-1 text-[13px] text-[#8592ab]">
              Where this lead stands right now, stage by stage — not the company-wide funnel above.
            </p>
            <div className="mt-6 min-w-0">
              {pipelineLoading ? (
                <p className="text-[14px] text-[#8592ab]">Loading…</p>
              ) : pipeline ? (
                <div className="flex w-full min-w-0 items-start overflow-x-auto pb-2">
                  {pipeline.map((stage, idx) => {
                    const style = PIPELINE_STATUS_STYLE[stage.status];
                    return (
                      <div key={stage.id} className="flex flex-1 items-start last:flex-none">
                        <div className="flex min-w-[100px] flex-col items-center text-center">
                          <div className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${style.dot}`}>
                            {stage.status === "done" ? "✓" : stage.status === "blocked" ? "✕" : idx + 1}
                          </div>
                          <p className={`mt-2 text-[13px] font-semibold ${style.label}`}>{stage.label}</p>
                          <p className="mt-1 text-[12px] leading-4 text-[#8592ab]">{stage.detail}</p>
                        </div>
                        {idx < pipeline.length - 1 ? <div className={`mt-[18px] h-[3px] flex-1 ${style.line}`} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[14px] text-[#8592ab]">No pipeline data available for this lead.</p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-[#e7edf5] pt-6">
            <div className="inline-flex rounded-[14px] bg-[#edf2f7] p-1">
              {["Overview", "Timeline", "Interactions"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-[12px] px-4 py-2 text-[15px] font-medium ${
                    tab === activeTab ? "bg-white text-[#102246] shadow-sm" : "text-[#5f6f89]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Overview" && editing ? (
              <div className="mt-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Edit lead</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <EditField label="Owner" value={editForm.owner} onChange={(v) => setEditForm({ ...editForm, owner: v })} />
                  <div>
                    <label className="mb-1.5 block text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Status</label>
                    <select
                      className="w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {Object.keys(STATUS_LABEL).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <EditField label="Capital Ask" value={editForm.capitalAsk} onChange={(v) => setEditForm({ ...editForm, capitalAsk: v })} placeholder="EUR 3M" />
                  <EditField label="Territory / Geography" value={editForm.territory} onChange={(v) => setEditForm({ ...editForm, territory: v })} />
                  <EditField label="Lead Source" value={editForm.leadSource} onChange={(v) => setEditForm({ ...editForm, leadSource: v })} />
                  <EditField label="Industry" value={editForm.industry} onChange={(v) => setEditForm({ ...editForm, industry: v })} list={facets?.industries} />
                  <EditField label="Channel Partner" value={editForm.channelPartner} onChange={(v) => setEditForm({ ...editForm, channelPartner: v })} list={facets?.channelPartners} />
                  <EditField label="Team Leader" value={editForm.teamLeader} onChange={(v) => setEditForm({ ...editForm, teamLeader: v })} list={facets?.teamLeaders} />
                  <EditField label="Manager" value={editForm.manager} onChange={(v) => setEditForm({ ...editForm, manager: v })} list={facets?.managers} />
                  <div>
                    <label className="mb-1.5 block text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Hot / Warm / Cold</label>
                    <select
                      className="w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      value={editForm.temperature}
                      onChange={(e) => setEditForm({ ...editForm, temperature: e.target.value })}
                    >
                      <option value="">Not rated</option>
                      {TEMPERATURE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <EditField
                    label="DOE (Deal Originator Executive)"
                    value={editForm.doe}
                    onChange={(v) => setEditForm({ ...editForm, doe: v })}
                    placeholder="Who first engaged this prospect"
                    list={facets?.does}
                  />
                </div>

                {saveError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{saveError}</p> : null}
                <div className="mt-4 flex gap-2">
                  <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={saveEdit} disabled={saving} />
                  <ActionButton label="Cancel" small onClick={() => setEditing(false)} disabled={saving} />
                </div>
              </div>
            ) : activeTab === "Overview" ? (
              <div className="mt-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Lead Information</p>
                <div className="mt-4 grid gap-x-6 gap-y-0 md:grid-cols-2">
                  {overview.map(([label, value]) => (
                    <div key={label} className="border-b border-dashed border-[#d9e2ef] py-4">
                      <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">{label}</p>
                      <p className="mt-2 text-[15px] font-medium text-[#102246]">{value}</p>
                    </div>
                  ))}
                </div>
                {lead.notes ? (
                  <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Notes from source</p>
                    <p className="mt-2 text-[14px] leading-6 text-[#334463]">{lead.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-6 text-[14px] text-[#8592ab]">Nothing recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CrmWorkspaceModule() {
  const [leads, setLeads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  // Existing values already in use across other leads (real, not a fixed
  // enum) — offered as autocomplete suggestions in the edit form so picking
  // "Iberia Solar Partners" again doesn't mean retyping it (or drifting into
  // a near-duplicate like "Iberia solar partners"). A genuinely new value
  // can still just be typed; this never restricts input like a <select> would.
  const [facets, setFacets] = useState(null);
  // Company-wide Kanban board: one column per pipeline stage, one card per
  // lead in its current stage — distinct from `pipeline` above (one lead's
  // own stage-by-stage detail, shown in the popup) and from Executive
  // Dashboard's fuller Funnel Health chart (which also shows conversion
  // rates between stages).
  const [dealBoard, setDealBoard] = useState(null);
  // "New record" — the header's create-lead modal.
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", company: "", email: "", mobile: "", capitalAsk: "", owner: "", territory: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  // "Import" — the header's CSV-paste modal.
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  // "Views" — a quick client-side status filter over the already-loaded
  // leads list (New Enquiries table below); no new backend call needed
  // since every lead's status is already in `leads`.
  const [viewsOpen, setViewsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  function refreshLeads() {
    return leadsApi
      .list()
      .then((data) => {
        setLeads(data);
        return data;
      })
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    universalFiltersApi.facets().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    leadsApi.dealBoard().then(setDealBoard).catch(() => {});
  }, []);

  useEffect(() => {
    refreshLeads()
      .then((data) => {
        if (data?.length > 0) setSelectedId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleAddLead() {
    if (!addForm.name.trim()) {
      setAddError("Name is required.");
      return;
    }
    if (!addForm.email.trim() && !addForm.mobile.trim()) {
      setAddError("At least one contact method is required (email or mobile).");
      return;
    }

    setAddSaving(true);
    setAddError(null);
    try {
      const created = await leadsApi.create({
        name: addForm.name.trim(),
        company: addForm.company.trim() || undefined,
        email: addForm.email.trim() || undefined,
        mobile: addForm.mobile.trim() || undefined,
        capitalAsk: addForm.capitalAsk.trim() || undefined,
        owner: addForm.owner.trim() || undefined,
        territory: addForm.territory.trim() || undefined
      });
      await refreshLeads();
      leadsApi.dealBoard().then(setDealBoard).catch(() => {});
      setSelectedId(created.id);
      setAddModalOpen(false);
      setAddForm({ name: "", company: "", email: "", mobile: "", capitalAsk: "", owner: "", territory: "" });
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  async function handleImportLeads() {
    const { rows, errors: parseErrors } = parseCrmLeadsCsv(importText);
    if (rows.length === 0) {
      setImportResult({ createdCount: 0, failedCount: 0, errors: parseErrors.length ? parseErrors : ["No valid rows found."] });
      return;
    }

    setImportBusy(true);
    try {
      const result = await leadsApi.bulkCreate(rows);
      setImportResult({ ...result, errors: [...parseErrors, ...result.errors] });
      await refreshLeads();
      leadsApi.dealBoard().then(setDealBoard).catch(() => {});
    } catch (err) {
      setImportResult({ createdCount: 0, failedCount: rows.length, errors: [...parseErrors, err.message] });
    } finally {
      setImportBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setPipeline(null);
      return;
    }
    setPipelineLoading(true);
    leadsApi
      .pipeline(selectedId)
      .then(setPipeline)
      .catch(() => setPipeline(null))
      .finally(() => setPipelineLoading(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading leads…</Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="px-5 py-6 text-[14px] text-[#e0483f]">
          Could not reach the backend at http://localhost:4000 — is the API server running? ({loadError})
        </Card>
      </div>
    );
  }

  const selectedLead = leads.find((l) => l.id === selectedId) ?? leads[0];

  const startEdit = () => {
    if (!selectedLead) return;
    setSaveError(null);
    setEditForm({
      owner: selectedLead.owner ?? "",
      status: selectedLead.status,
      territory: selectedLead.territory ?? "",
      leadSource: selectedLead.leadSource ?? "",
      capitalAsk: selectedLead.capitalAsk ?? "",
      industry: selectedLead.industry ?? "",
      channelPartner: selectedLead.channelPartner ?? "",
      teamLeader: selectedLead.teamLeader ?? "",
      manager: selectedLead.manager ?? "",
      temperature: selectedLead.temperature ?? "",
      doe: selectedLead.doe ?? ""
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await leadsApi.patch(selectedLead.id, {
        ...editForm,
        doe: editForm.doe
      });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setEditing(false);
      // Status changed could move this lead's card to a different column —
      // keep the board in sync rather than leaving it stale until the next
      // full page load.
      leadsApi.dealBoard().then(setDealBoard).catch(() => {});
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendPortalInvite = async () => {
    setInviting(true);
    setInviteResult(null);
    try {
      const result = await leadsApi.sendPortalInvite(selectedLead.id);
      setInviteResult({ ok: true, ...result });
    } catch (err) {
      setInviteResult({ ok: false, error: err.message });
    } finally {
      setInviting(false);
    }
  };

  const viewClientDashboard = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await leadsApi.clientPortalPreviewLink(selectedLead.id);
      window.open(result.previewUrl, "_blank", "noopener");
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const unassigned = leads.filter((l) => !l.owner).length;
  const convertedPct = leads.length ? ((leads.filter((l) => l.status === "CONVERTED").length / leads.length) * 100).toFixed(1) : "0.0";
  const qualifiedCount = leads.filter((l) => l.qualified).length;

  const stats = [
    { label: "Total records", value: String(leads.length), note: "Live from Postgres", noteTone: "blue" },
    { label: "Unassigned", value: String(unassigned), note: "Assignment rules", noteTone: "amber" },
    { label: "Converted", value: `${convertedPct}%`, note: "Lead → deal", noteTone: "green" },
    { label: "Qualified", value: String(qualifiedCount), note: "Ready for outreach", noteTone: "cyan" }
  ];

  const overview = selectedLead
    ? [
        ["Lead Owner", selectedLead.owner ?? "Unassigned"],
        ["Legal Entity Name", selectedLead.company],
        ["Email", selectedLead.email ?? "—"],
        ["Mobile", selectedLead.mobile ?? "—"],
        ["Lead Source", selectedLead.leadSource ?? "—"],
        ["Lead Status", STATUS_LABEL[selectedLead.status]],
        ["Capital Ask", selectedLead.capitalAsk],
        ["Territory / Geography", selectedLead.territory ?? "—"],
        ["Engagement Stage", selectedLead.engagementStage ?? "—"],
        ["Industry", selectedLead.industry ?? "—"],
        ["Channel Partner", selectedLead.channelPartner ?? "—"],
        ["Hot / Warm / Cold", selectedLead.temperature ?? "Not rated"],
        ["Team Leader", selectedLead.teamLeader ?? "—"],
        ["Manager", selectedLead.manager ?? "—"],
        ["DOE (Deal Originator Executive)", selectedLead.doe ?? "—"],
        ["Consent (GDPR)", selectedLead.consentGdpr ?? "—"]
      ]
    : [];

  const visibleLeads = statusFilter === "ALL" ? leads : leads.filter((lead) => lead.status === statusFilter);

  return (
    <div className="space-y-6">
      <Header
        stats={stats}
        onNewRecord={() => setAddModalOpen(true)}
        onImport={() => setImportModalOpen(true)}
        viewsOpen={viewsOpen}
        setViewsOpen={setViewsOpen}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      {dealBoard ? (
        <Card className="px-5 py-5">
          <SectionTitle icon={RadarIcon} iconClass="text-[#2f96da]">
            Deal pipeline
          </SectionTitle>
          <div className="mt-5 overflow-x-auto">
            <div className="flex gap-4" style={{ minWidth: "max-content" }}>
              {dealBoard.map((column) => (
                <div key={column.id} className="w-[260px] shrink-0 rounded-[16px] bg-[#f7f9fc] p-3">
                  <div className="flex items-center justify-between px-1 pb-3">
                    <p className="text-[13px] font-semibold text-[#12213a]">{column.label}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#5f6f89] shadow-[0_2px_6px_rgba(30,48,87,0.06)]">
                      {column.deals.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {column.deals.length ? (
                      column.deals.map((deal) => (
                        <div
                          key={deal.id}
                          onClick={() => {
                            setSelectedId(deal.id);
                            setDetailOpen(true);
                            setInviteResult(null);
                          }}
                          className="cursor-pointer rounded-[14px] border border-[#e7edf5] bg-white px-3 py-3 shadow-[0_2px_8px_rgba(30,48,87,0.04)] transition hover:border-[#c3cfe6]"
                        >
                          <p className="truncate text-[13.5px] font-semibold text-[#102246]">{deal.name}</p>
                          <p className="mt-1 truncate text-[12px] text-[#5f6f89]">{deal.company}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] font-semibold text-[#3046b2]">{deal.capitalAsk}</span>
                            <span className="shrink-0 text-[11px] text-[#8592ab]">{new Date(deal.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="px-1 text-[12px] text-[#8592ab]">No deals here</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="w-full">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">New Enquiries</h2>
          <p className="mt-1 text-[14px] text-[#6a7790]">
            {visibleLeads.length} of {leads.length} records
            {statusFilter !== "ALL" ? ` · filtered to ${STATUS_LABEL[statusFilter]}` : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-5 py-3">Lead</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Capital Ask</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf5]">
              {visibleLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => {
                    setSelectedId(lead.id);
                    setDetailOpen(true);
                    setInviteResult(null);
                  }}
                  className={`cursor-pointer bg-white transition hover:bg-[#f8faff] ${lead.id === selectedId ? "bg-[#f5f8fd]" : ""}`}
                >
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-center gap-3">
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${avatarToneClass[lead.tone]}`}>
                        {lead.initials}
                      </div>
                      <p className="truncate text-[15px] font-semibold text-[#102246]">{lead.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-[#435471]">{lead.company}</td>
                  <td className="px-4 py-4 align-top text-[#435471]">{lead.capitalAsk}</td>
                  <td className="px-4 py-4 align-top text-[#435471]">{lead.owner || "Unassigned"}</td>
                  <td className="px-4 py-4 align-top text-right">
                    <span className={`inline-block rounded-full px-2 py-1 text-[10.5px] font-semibold leading-tight ${noteToneClass[lead.tone]}`}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {visibleLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-[14px] text-[#8592ab]">
                    {leads.length === 0
                      ? "No leads yet — add one with \"New record\", import a CSV, send one in via the webhook (Settings → Integrations & API), or wait for one to arrive from WhatsApp."
                      : `No leads with status "${STATUS_LABEL[statusFilter]}".`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {detailOpen ? (
        <LeadDetailModal
          lead={selectedLead}
          overview={overview}
          pipeline={pipeline}
          pipelineLoading={pipelineLoading}
          onClose={() => {
            setDetailOpen(false);
            setEditing(false);
          }}
          editing={editing}
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          saveError={saveError}
          startEdit={startEdit}
          setEditing={setEditing}
          saveEdit={saveEdit}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          facets={facets}
          inviting={inviting}
          inviteResult={inviteResult}
          onSendInvite={sendPortalInvite}
          previewLoading={previewLoading}
          previewError={previewError}
          onViewClientDashboard={viewClientDashboard}
        />
      ) : null}

      {addModalOpen ? (
        <AddLeadModal
          form={addForm}
          setForm={setAddForm}
          saving={addSaving}
          error={addError}
          onClose={() => {
            setAddModalOpen(false);
            setAddError(null);
          }}
          onSave={handleAddLead}
        />
      ) : null}

      {importModalOpen ? (
        <ImportLeadsModal
          text={importText}
          setText={setImportText}
          busy={importBusy}
          result={importResult}
          onClose={() => {
            setImportModalOpen(false);
            setImportText("");
            setImportResult(null);
          }}
          onImport={handleImportLeads}
        />
      ) : null}
    </div>
  );
}

// `list` is optional — when given (real values already in use across other
// leads, e.g. Channel Partner), the field offers them as autocomplete
// suggestions via a native <datalist> rather than forcing a rigid dropdown:
// picking an existing partner is one click, but a genuinely new one can
// still just be typed. Matches the same pattern Data Room's upload
// Category field already uses.
function EditField({ label, value, onChange, placeholder, list }) {
  const listId = list ? `editfield-list-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined;
  return (
    <div>
      <label className="mb-1.5 block text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">{label}</label>
      <input
        className="w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
      />
      {list ? (
        <datalist id={listId}>
          {list.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

const VIEW_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "CONVERTED", label: "Converted" },
  { value: "LOST", label: "Lost" }
];

function Header({ stats, onNewRecord, onImport, viewsOpen, setViewsOpen, statusFilter, setStatusFilter }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[#dfe6ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3556be]">
            Module
          </span>
          <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">CRM Workspace</h1>
        </div>
        <div className="relative flex flex-wrap justify-end gap-3 pt-1">
          <ActionButton label="New record" icon={PlusIcon} primary onClick={onNewRecord} />
          <ActionButton label="Import" icon={UploadIcon} onClick={onImport} />
          <ActionButton
            label="Views"
            icon={FunnelIcon}
            active={Boolean(statusFilter && statusFilter !== "ALL")}
            onClick={() => setViewsOpen?.((open) => !open)}
          />

          {viewsOpen ? (
            <div className="absolute right-0 top-[52px] z-20 w-56 rounded-[14px] border border-[#d6deea] bg-white p-2 shadow-[0_12px_32px_rgba(15,31,61,0.14)]">
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8592ab]">Filter by status</p>
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter?.(option.value);
                    setViewsOpen?.(false);
                  }}
                  className={`block w-full rounded-[10px] px-3 py-2 text-left text-[13px] font-medium ${
                    statusFilter === option.value ? "bg-[#eef2ff] text-[#3046b2]" : "text-[#435471] hover:bg-[#f7f9fc]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {stats ? (
        <div className="mt-7 grid gap-4 xl:grid-cols-4">
          {stats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AddLeadModal({ form, setForm, saving, error, onClose, onSave }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7edf5] px-6 py-5">
          <p className="text-[18px] font-semibold text-[#102246]">New record</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <EditField label="Name" value={form.name} onChange={(v) => setForm((c) => ({ ...c, name: v }))} placeholder="Full name" />
          <EditField label="Company" value={form.company} onChange={(v) => setForm((c) => ({ ...c, company: v }))} />
          <EditField label="Email" value={form.email} onChange={(v) => setForm((c) => ({ ...c, email: v }))} placeholder="name@company.com" />
          <EditField label="Mobile" value={form.mobile} onChange={(v) => setForm((c) => ({ ...c, mobile: v }))} />
          <EditField label="Capital Ask" value={form.capitalAsk} onChange={(v) => setForm((c) => ({ ...c, capitalAsk: v }))} placeholder="EUR 3M" />
          <EditField label="Owner" value={form.owner} onChange={(v) => setForm((c) => ({ ...c, owner: v }))} />
          <EditField label="Territory / Geography" value={form.territory} onChange={(v) => setForm((c) => ({ ...c, territory: v }))} />
          <p className="text-[12px] text-[#8592ab]">At least one of Email or Mobile is required, along with Name.</p>
          {error ? <p className="text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e7edf5] px-6 py-4">
          <ActionButton label="Cancel" small onClick={onClose} disabled={saving} />
          <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={onSave} disabled={saving} />
        </div>
      </div>
    </div>
  );
}

function ImportLeadsModal({ text, setText, busy, result, onClose, onImport }) {
  const [fileName, setFileName] = useState(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
    // Lets picking the same file again re-trigger onChange (e.g. after
    // editing it on disk and re-selecting it).
    event.target.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-[640px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7edf5] px-6 py-5">
          <p className="text-[18px] font-semibold text-[#102246]">Import leads</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="text-[13px] text-[#5f6f89]">
            Upload a .csv file or paste rows below. Header required:{" "}
            <code className="rounded bg-[#f4f7fb] px-1.5 py-0.5 text-[12px]">name,company,email,mobile,capitalask,owner,territory</code>.
            Each row needs a name and at least one of email/mobile.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#2d3553] transition hover:bg-[#f7f9fc]">
              <UploadIcon className="size-4" />
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>
            {fileName ? <span className="truncate text-[13px] text-[#5f6f89]">{fileName}</span> : null}
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder={"name,company,email,mobile,capitalask,owner,territory\nJane Doe,Acme Corp,jane@acme.com,,EUR 2M,Rahul R,NL"}
            className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 font-mono text-[13px] text-[#102246] outline-none"
          />

          {result ? (
            <div className="rounded-[12px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3 text-[13px]">
              <p className="font-medium text-[#102246]">
                {result.createdCount} created, {result.failedCount} failed.
              </p>
              {result.errors?.length ? (
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-[12px] text-[#8592ab]">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e7edf5] px-6 py-4">
          <ActionButton label="Close" small onClick={onClose} disabled={busy} />
          <ActionButton label={busy ? "Importing…" : "Import"} primary small onClick={onImport} disabled={busy || !text.trim()} />
        </div>
      </div>
    </div>
  );
}
