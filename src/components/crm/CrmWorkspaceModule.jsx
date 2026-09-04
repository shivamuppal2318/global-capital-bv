import { useEffect, useState } from "react";
import {
  FunnelIcon,
  GlobeIcon,
  MailIcon,
  PencilIcon,
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
import { emailCampaignsApi } from "../../lib/emailCampaignsApi";
import { emailLeadsApi } from "../../lib/emailLeadsApi";

const avatarToneClass = {
  blue: "bg-[#dff1ff] text-[#2f96da]",
  amber: "bg-[#ffe6cc] text-[#f29b3a]",
  green: "bg-[#dff5e7] text-[#2a9c60]",
  violet: "bg-[#efe5ff] text-[#8b52d0]",
  sky: "bg-[#def1ff] text-[#2b94da]"
};

const STATUS_LABEL = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", NEGOTIATION: "Negotiation", CONVERTED: "Converted", LOST: "Lost" };

const TEMPERATURE_OPTIONS = ["HOT", "WARM", "COLD"];

// ZoomInfo's own controlled vocabulary for its contacts/search
// `managementLevel` filter — confirmed live against the real API (any
// other value 400s and the error response itself names this exact set).
const MANAGEMENT_LEVEL_OPTIONS = ["Board Member", "C Level Exec", "VP Level Exec", "Director", "Manager", "Non Manager"];

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
  previewLoading, previewError, onViewClientDashboard,
  onConvert, converting, convertError,
  onOpenSendMail,
  tagsEditing, tagsDraft, setTagsDraft, onOpenTags, onCloseTags, onSaveTags, savingTags, tagsError,
  timeline, timelineLoading, interactions, interactionsLoading,
  onEnrich, enriching, enrichResult
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
              {lead.tags?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {lead.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#eef1ff] px-2 py-0.5 text-[11px] font-semibold text-[#4766cc]">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
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
            <ActionButton label="Send Mail" icon={MailIcon} primary onClick={onOpenSendMail} disabled={!lead.email} />
            <ActionButton label="WhatsApp" icon={SendIcon} />
            <ActionButton
              label={converting ? "Converting…" : "Convert"}
              icon={UserCheckIcon}
              onClick={onConvert}
              disabled={converting || lead.status === "CONVERTED"}
            />
            <ActionButton label={editing ? "Editing…" : "Edit"} icon={PencilIcon} onClick={startEdit} disabled={editing} />
            <ActionButton label="Tags" icon={TagIcon} active={tagsEditing} onClick={onOpenTags} />
            <ActionButton
              label={inviting ? "Inviting…" : "Send Portal Invite"}
              icon={SendIcon}
              onClick={onSendInvite}
              disabled={inviting || Boolean(lead.clientUser)}
            />
            <ActionButton label={enriching ? "Enriching…" : "Enrich"} icon={GlobeIcon} onClick={onEnrich} disabled={enriching} />
          </div>

          {!lead.email ? <p className="mt-2 text-[12px] text-[#8592ab]">Send Mail needs an email address on file for this lead.</p> : null}
          {convertError ? <p className="mt-2 text-[13px] font-medium text-[#e0483f]">{convertError}</p> : null}
          {enrichResult ? (
            <p className={`mt-2 text-[13px] font-medium ${enrichResult.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>
              {enrichResult.text}
            </p>
          ) : null}

          {tagsEditing ? (
            <div className="mt-3 rounded-[14px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Tags</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tagsDraft.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-[#eef1ff] px-2.5 py-1 text-[12px] font-semibold text-[#4766cc]">
                    {tag}
                    <button type="button" onClick={() => setTagsDraft(tagsDraft.filter((t) => t !== tag))} className="text-[#8592ab] hover:text-[#e0483f]">
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="Type a tag, press Enter"
                  className="min-w-[140px] flex-1 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] text-[#102246] outline-none focus:border-[#3046b2]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target.value.trim()) {
                      e.preventDefault();
                      const value = e.target.value.trim();
                      if (!tagsDraft.includes(value)) setTagsDraft([...tagsDraft, value]);
                      e.target.value = "";
                    }
                  }}
                />
              </div>
              {tagsError ? <p className="mt-2 text-[13px] font-medium text-[#e0483f]">{tagsError}</p> : null}
              <div className="mt-3 flex gap-2">
                <ActionButton label={savingTags ? "Saving…" : "Save"} primary small onClick={onSaveTags} disabled={savingTags} />
                <ActionButton label="Cancel" small onClick={onCloseTags} disabled={savingTags} />
              </div>
            </div>
          ) : null}

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
                {lead.zoomInfoData ? (
                  <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Company Info (ZoomInfo)</p>
                    <div className="mt-3 grid gap-x-6 gap-y-2 text-[13px] text-[#334463] sm:grid-cols-2">
                      {lead.zoomInfoData.website ? <p><span className="text-[#8592ab]">Website</span> — {lead.zoomInfoData.website}</p> : null}
                      {lead.zoomInfoData.phone ? <p><span className="text-[#8592ab]">Phone</span> — {lead.zoomInfoData.phone}</p> : null}
                      {lead.zoomInfoData.employeeCount ? <p><span className="text-[#8592ab]">Employees</span> — {lead.zoomInfoData.employeeCount}</p> : null}
                      {lead.zoomInfoData.revenue ? <p><span className="text-[#8592ab]">Revenue</span> — ${Number(lead.zoomInfoData.revenue).toLocaleString()}k</p> : null}
                      {lead.zoomInfoData.foundedYear ? <p><span className="text-[#8592ab]">Founded</span> — {lead.zoomInfoData.foundedYear}</p> : null}
                      {lead.zoomInfoData.primaryIndustry?.length ? (
                        <p><span className="text-[#8592ab]">Industry</span> — {lead.zoomInfoData.primaryIndustry.join(", ")}</p>
                      ) : null}
                    </div>
                    {lead.zoomInfoData.description ? (
                      <p className="mt-3 text-[13px] leading-6 text-[#435471]">{lead.zoomInfoData.description}</p>
                    ) : null}
                  </div>
                ) : null}
                {lead.zoomInfoContactData ? (
                  <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Contact Info (ZoomInfo)</p>
                    <div className="mt-3 grid gap-x-6 gap-y-2 text-[13px] text-[#334463] sm:grid-cols-2">
                      {lead.zoomInfoContactData.jobTitle ? <p><span className="text-[#8592ab]">Title</span> — {lead.zoomInfoContactData.jobTitle}</p> : null}
                      {lead.zoomInfoContactData.managementLevel?.length ? (
                        <p><span className="text-[#8592ab]">Level</span> — {lead.zoomInfoContactData.managementLevel.join(", ")}</p>
                      ) : null}
                      {lead.zoomInfoContactData.mobilePhone ? <p><span className="text-[#8592ab]">Mobile</span> — {lead.zoomInfoContactData.mobilePhone}</p> : null}
                      {lead.zoomInfoContactData.directPhoneAlt?.[0]?.value ? (
                        <p><span className="text-[#8592ab]">Direct phone</span> — {lead.zoomInfoContactData.directPhoneAlt[0].value}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {lead.zoomInfoScoops?.length ? (
                  <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Recent Company Activity (ZoomInfo)</p>
                    <div className="mt-3 space-y-3">
                      {lead.zoomInfoScoops.map((scoop) => (
                        <div key={scoop.id} className="border-b border-dashed border-[#d9e2ef] pb-3 last:border-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#3046b2]">
                              {scoop.types?.join(", ") || "Update"}
                            </span>
                            <span className="text-[12px] text-[#8592ab]">
                              {scoop.publishedDate ? new Date(scoop.publishedDate).toLocaleDateString() : ""}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] leading-6 text-[#334463]">{scoop.description}</p>
                          {scoop.link ? (
                            <a href={scoop.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-[#3046b2] underline">
                              {scoop.linkText || "See details"}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : activeTab === "Timeline" ? (
              <EventList loading={timelineLoading} events={timeline} emptyText="No deal-progression events recorded yet." />
            ) : (
              <EventList
                loading={interactionsLoading}
                events={interactions?.map((a) => ({ at: a.createdAt, title: a.title, detail: a.detail }))}
                emptyText="No emails sent or status changes recorded yet."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared renderer for both the Timeline and Interactions tabs — same
// dot-and-connector convention as RepliesTab.jsx's "Lead activity timeline"
// card, just inline within this modal's already-labeled tab instead of a
// separately titled section.
function EventList({ loading, events, emptyText }) {
  if (loading) {
    return <p className="mt-6 text-[14px] text-[#8592ab]">Loading…</p>;
  }
  if (!events?.length) {
    return <p className="mt-6 text-[14px] text-[#8592ab]">{emptyText}</p>;
  }
  return (
    <div className="mt-6 space-y-4">
      {events.map((event, index) => (
        <div key={`${event.at}-${event.title}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#3046b2]" />
            {index !== events.length - 1 ? <span className="mt-2 h-full w-px bg-[#d9e2ef]" /> : null}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-[#102246]">{event.title}</p>
              <span className="text-[12px] text-[#6a7790]">{new Date(event.at).toLocaleString()}</span>
            </div>
            {event.detail ? <p className="mt-1 text-[13px] leading-5 text-[#435471]">{event.detail}</p> : null}
          </div>
        </div>
      ))}
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
  // Convert: promotes a lead to CONVERTED — a single-field shortcut from the
  // action bar onto the same PATCH the Edit form already uses.
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);
  // Tags editor — a draft array edited inline, only PATCHed to the lead on
  // explicit Save, so closing without saving discards changes (same pattern
  // as Edit).
  const [tagsEditing, setTagsEditing] = useState(false);
  const [tagsDraft, setTagsDraft] = useState([]);
  const [savingTags, setSavingTags] = useState(false);
  const [tagsError, setTagsError] = useState(null);
  // Timeline / Interactions tabs — fetched per lead, same load-on-selection
  // lifecycle as `pipeline` below rather than on every render.
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [interactions, setInteractions] = useState(null);
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  // Send Mail — a lightweight subject+body composer straight to the lead's
  // own email address, distinct from the cold-outreach campaign machinery in
  // Email Automation (no unsubscribe/bounce/daily-cap handling needed here).
  const [sendMailOpen, setSendMailOpen] = useState(false);
  const [sendMailForm, setSendMailForm] = useState({ subject: "", body: "" });
  const [sendMailSaving, setSendMailSaving] = useState(false);
  const [sendMailError, setSendMailError] = useState(null);
  // ZoomInfo company lookup — a manual, one-click action (not automatic on
  // lead creation) so every API credit spent is a rep's explicit choice.
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  // Bulk Enrich — same ZoomInfo lookup as the single-lead action, run
  // across every lead still missing industry/territory. Confirms the real
  // count with the rep first, since it's real API credits spent at once.
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkEnrichResult, setBulkEnrichResult] = useState(null);
  // "Find Companies (ZoomInfo)" — real prospecting search (not enrich: no
  // existing lead needed), see server/src/lib/zoominfoClient.js's
  // searchCompanies/searchContacts. Search itself is explicit (a "Search"
  // click, real API credits) same as Bulk Enrich's confirm-first
  // convention; results are browse-only until a rep picks "Add as Lead",
  // which just pre-fills the existing New Record form above — no direct,
  // silent Lead creation from a search result.
  const [zoomInfoPanelOpen, setZoomInfoPanelOpen] = useState(false);
  const [zoomInfoMode, setZoomInfoMode] = useState("companies");
  const [zoomInfoCompanyFilters, setZoomInfoCompanyFilters] = useState({ companyName: "", industryKeywords: "", employeeRangeMin: "", employeeRangeMax: "" });
  const [zoomInfoContactFilters, setZoomInfoContactFilters] = useState({ jobTitle: "", industryKeywords: "", managementLevel: [] });
  const [zoomInfoSearching, setZoomInfoSearching] = useState(false);
  const [zoomInfoError, setZoomInfoError] = useState(null);
  const [zoomInfoResults, setZoomInfoResults] = useState([]);
  const [zoomInfoTotalResults, setZoomInfoTotalResults] = useState(0);
  const [zoomInfoPage, setZoomInfoPage] = useState(1);
  const [zoomInfoHasSearched, setZoomInfoHasSearched] = useState(false);

  // "Add to List" — sends the currently-selected (already status-filtered)
  // leads into a real Email Automation List (an EmailCampaign) as real
  // EmailLead rows, reusing the exact bulk-create route CSV import already
  // uses (server/src/routes/emailLeads.js's POST /bulk) — no new backend
  // needed. selectedLeadIds resets on statusFilter change so a stale
  // selection from a different filter can't silently carry over.
  const [selectedLeadIds, setSelectedLeadIds] = useState(() => new Set());
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [addToListCampaigns, setAddToListCampaigns] = useState([]);
  const [addToListCampaignId, setAddToListCampaignId] = useState("");
  const [addToListBusy, setAddToListBusy] = useState(false);
  const [addToListResult, setAddToListResult] = useState(null);

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

  // A selection made under one status filter shouldn't silently carry over
  // once the filter changes to a different set of rows.
  useEffect(() => {
    setSelectedLeadIds(new Set());
  }, [statusFilter]);

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

  // Builds the real ZoomInfo filter payload from whichever mode's form is
  // active, dropping blank fields (an empty string filter would otherwise
  // narrow the search to "" instead of "not set").
  function buildZoomInfoFilters() {
    if (zoomInfoMode === "companies") {
      const { companyName, industryKeywords, employeeRangeMin, employeeRangeMax } = zoomInfoCompanyFilters;
      return {
        ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
        ...(industryKeywords.trim() ? { industryKeywords: industryKeywords.trim() } : {}),
        // ZoomInfo's own API requires these as numeric STRINGS, not numbers
        // — confirmed live (a real number 400s with "Invalid field type").
        ...(employeeRangeMin.trim() ? { employeeRangeMin: employeeRangeMin.trim() } : {}),
        ...(employeeRangeMax.trim() ? { employeeRangeMax: employeeRangeMax.trim() } : {})
      };
    }
    const { jobTitle, industryKeywords, managementLevel } = zoomInfoContactFilters;
    return {
      ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
      ...(industryKeywords.trim() ? { industryKeywords: industryKeywords.trim() } : {}),
      // Comma-delimited from ZoomInfo's own controlled vocabulary — see
      // MANAGEMENT_LEVEL_OPTIONS below.
      ...(managementLevel.length ? { managementLevel: managementLevel.join(",") } : {})
    };
  }

  async function handleZoomInfoSearch(page = 1) {
    setZoomInfoSearching(true);
    setZoomInfoError(null);
    try {
      const result = await leadsApi.zoomInfoSearch({ mode: zoomInfoMode, filters: buildZoomInfoFilters(), page });
      setZoomInfoResults(result.results);
      setZoomInfoTotalResults(result.totalResults);
      setZoomInfoPage(page);
      setZoomInfoHasSearched(true);
    } catch (err) {
      setZoomInfoError(err.message);
      setZoomInfoResults([]);
      setZoomInfoHasSearched(true);
    } finally {
      setZoomInfoSearching(false);
    }
  }

  // Pre-fills the existing "New Record" form from a chosen ZoomInfo
  // result and opens the same modal — the rep still reviews/completes
  // (capitalAsk especially, which ZoomInfo has no concept of) and saves
  // through the unchanged handleAddLead above. No silent auto-create.
  function handleAddZoomInfoResultAsLead(result) {
    if (zoomInfoMode === "companies") {
      const territory = [result.city, result.state, result.country].filter(Boolean).join(", ");
      setAddForm({ name: "", company: result.name ?? "", email: "", mobile: "", capitalAsk: "", owner: "", territory });
    } else {
      const name = [result.firstName, result.lastName].filter(Boolean).join(" ");
      setAddForm({ name, company: result.company?.name ?? "", email: "", mobile: "", capitalAsk: "", owner: "", territory: "" });
    }
    setZoomInfoPanelOpen(false);
    setAddModalOpen(true);
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

  useEffect(() => {
    if (!selectedId) {
      setTimeline(null);
      setInteractions(null);
      return;
    }
    setTimelineLoading(true);
    leadsApi
      .timeline(selectedId)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setTimelineLoading(false));

    setInteractionsLoading(true);
    leadsApi
      .interactions(selectedId)
      .then(setInteractions)
      .catch(() => setInteractions(null))
      .finally(() => setInteractionsLoading(false));
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

  const handleConvert = async () => {
    setConverting(true);
    setConvertError(null);
    try {
      const updated = await leadsApi.patch(selectedLead.id, { status: "CONVERTED" });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      leadsApi.dealBoard().then(setDealBoard).catch(() => {});
      leadsApi.timeline(selectedLead.id).then(setTimeline).catch(() => {});
      leadsApi.interactions(selectedLead.id).then(setInteractions).catch(() => {});
    } catch (err) {
      setConvertError(err.message);
    } finally {
      setConverting(false);
    }
  };

  const openTags = () => {
    setTagsDraft(selectedLead?.tags ?? []);
    setTagsError(null);
    setTagsEditing(true);
  };

  const closeTags = () => setTagsEditing(false);

  const saveTags = async () => {
    setSavingTags(true);
    setTagsError(null);
    try {
      const updated = await leadsApi.patch(selectedLead.id, { tags: tagsDraft });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setTagsEditing(false);
    } catch (err) {
      setTagsError(err.message);
    } finally {
      setSavingTags(false);
    }
  };

  const openSendMail = () => {
    setSendMailForm({ subject: "", body: "" });
    setSendMailError(null);
    setSendMailOpen(true);
  };

  const submitSendMail = async () => {
    if (!sendMailForm.subject.trim() || !sendMailForm.body.trim()) {
      setSendMailError("Subject and message are both required.");
      return;
    }
    setSendMailSaving(true);
    setSendMailError(null);
    try {
      await leadsApi.sendMail(selectedLead.id, sendMailForm);
      setSendMailOpen(false);
      leadsApi.interactions(selectedLead.id).then(setInteractions).catch(() => {});
    } catch (err) {
      setSendMailError(err.message);
    } finally {
      setSendMailSaving(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const result = await leadsApi.enrich(selectedLead.id);
      if (result.matched) {
        setLeads((prev) => prev.map((l) => (l.id === result.lead.id ? result.lead : l)));
        const parts = [];
        if (result.companyMatched) parts.push("company");
        if (result.contactMatched) parts.push("contact");
        if (result.scoopsMatched) parts.push("recent activity");
        setEnrichResult({ ok: true, text: `Enriched ${parts.join(", ")} data from ZoomInfo.` });
        leadsApi.timeline(selectedLead.id).then(setTimeline).catch(() => {});
      } else {
        setEnrichResult({ ok: false, text: result.message });
      }
    } catch (err) {
      setEnrichResult({ ok: false, text: err.message });
    } finally {
      setEnriching(false);
    }
  };

  const handleBulkEnrich = async () => {
    setBulkEnrichResult(null);
    try {
      const { count } = await leadsApi.enrichCandidatesCount();
      if (count === 0) {
        setBulkEnrichResult({ ok: true, text: "Every lead already has industry and territory set — nothing to enrich." });
        return;
      }
      if (!window.confirm(`Enrich ${count} lead(s) missing industry or territory via ZoomInfo? This uses ${count} real API lookup(s).`)) {
        return;
      }

      setBulkEnriching(true);
      const result = await leadsApi.bulkEnrich();
      setBulkEnrichResult({
        ok: true,
        text: `Processed ${result.processed} — ${result.companyMatchedCount} company, ${result.contactMatchedCount} contact, ${result.scoopsMatchedCount} activity matches; ${result.noMatchCount} no match, ${result.failedCount} failed.`
      });
      await refreshLeads();
    } catch (err) {
      setBulkEnrichResult({ ok: false, text: err.message });
    } finally {
      setBulkEnriching(false);
    }
  };

  function toggleLeadSelection(leadId) {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAllVisible(visibleLeadIds) {
    setSelectedLeadIds((current) => {
      const allSelected = visibleLeadIds.length > 0 && visibleLeadIds.every((id) => current.has(id));
      return allSelected ? new Set() : new Set(visibleLeadIds);
    });
  }

  function openAddToList() {
    setAddToListResult(null);
    setAddToListOpen(true);
    emailCampaignsApi.list().then(setAddToListCampaigns).catch(() => setAddToListCampaigns([]));
  }

  async function handleAddToList() {
    if (!addToListCampaignId) return;
    const selected = leads.filter((l) => selectedLeadIds.has(l.id));
    const withEmail = selected.filter((l) => l.email);
    const skippedNoEmail = selected.length - withEmail.length;

    if (withEmail.length === 0) {
      setAddToListResult({ ok: false, text: "None of the selected lead(s) have an email on file — nothing to add." });
      return;
    }

    setAddToListBusy(true);
    setAddToListResult(null);
    try {
      const rows = withEmail.map((l) => ({
        name: l.name,
        company: l.company,
        email: l.email,
        owner: l.owner || l.doe || "Unassigned"
      }));
      const result = await emailLeadsApi.bulkCreate(addToListCampaignId, rows);
      const listName = addToListCampaigns.find((c) => c.id === addToListCampaignId)?.name ?? "the list";
      const parts = [`${result.createdCount} added to "${listName}"`];
      if (result.duplicateCount) parts.push(`${result.duplicateCount} already there`);
      if (result.invalidCount) parts.push(`${result.invalidCount} failed a deliverability check`);
      if (result.failedCount) parts.push(`${result.failedCount} failed`);
      if (skippedNoEmail) parts.push(`${skippedNoEmail} skipped — no email on file`);

      // rows[] was built from withEmail in the same order, so a row number
      // from the API (1-based) maps straight back to the lead it came from
      // — lets the result show which lead each outcome belongs to, not just a count.
      const rowLead = (rowNumber) => withEmail[rowNumber - 1];
      const invalidDetails = (result.invalid || []).map((r) => ({
        name: rowLead(r.row)?.name ?? r.email,
        email: r.email,
        reason: r.reason
      }));
      const duplicateDetails = (result.duplicates || []).map((r) => ({
        name: rowLead(r.row)?.name ?? r.email,
        email: r.email,
        reason: r.reason
      }));
      const failedDetails = (result.failed || []).map((r) => ({
        name: rowLead(r.row)?.name ?? r.email,
        email: r.email,
        reason: r.reason
      }));
      const skippedNoEmailDetails = selected.filter((l) => !l.email).map((l) => ({ name: l.name }));

      setAddToListResult({
        ok: true,
        text: parts.join(", ") + ".",
        invalidDetails,
        duplicateDetails,
        failedDetails,
        skippedNoEmailDetails
      });
      setSelectedLeadIds(new Set());
    } catch (err) {
      setAddToListResult({ ok: false, text: err.message });
    } finally {
      setAddToListBusy(false);
    }
  }

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
        onFindCompanies={() => setZoomInfoPanelOpen((open) => !open)}
        zoomInfoPanelOpen={zoomInfoPanelOpen}
        viewsOpen={viewsOpen}
        setViewsOpen={setViewsOpen}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      {zoomInfoPanelOpen ? (
        <ZoomInfoSearchPanel
          mode={zoomInfoMode}
          setMode={setZoomInfoMode}
          companyFilters={zoomInfoCompanyFilters}
          setCompanyFilters={setZoomInfoCompanyFilters}
          contactFilters={zoomInfoContactFilters}
          setContactFilters={setZoomInfoContactFilters}
          searching={zoomInfoSearching}
          error={zoomInfoError}
          results={zoomInfoResults}
          totalResults={zoomInfoTotalResults}
          page={zoomInfoPage}
          hasSearched={zoomInfoHasSearched}
          onSearch={handleZoomInfoSearch}
          onAddAsLead={handleAddZoomInfoResultAsLead}
        />
      ) : null}

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
                            setEnrichResult(null);
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
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e7edf5] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#102246]">New Enquiries</h2>
            <p className="mt-1 text-[14px] text-[#6a7790]">
              {visibleLeads.length} of {leads.length} records
              {statusFilter !== "ALL" ? ` · filtered to ${STATUS_LABEL[statusFilter]}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                label={selectedLeadIds.size ? `Add to List (${selectedLeadIds.size})` : "Add to List"}
                icon={TagIcon}
                small
                onClick={openAddToList}
                disabled={selectedLeadIds.size === 0}
              />
              <ActionButton
                label={bulkEnriching ? "Enriching…" : "Bulk Enrich"}
                icon={GlobeIcon}
                small
                onClick={handleBulkEnrich}
                disabled={bulkEnriching}
              />
            </div>
            {bulkEnrichResult ? (
              <p className={`mt-1.5 max-w-[280px] text-[12px] font-medium ${bulkEnrichResult.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>
                {bulkEnrichResult.text}
              </p>
            ) : null}
          </div>
        </div>

        {addToListOpen ? (
          <div className="border-b border-[#e7edf5] bg-[#f8faff] px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#5f6f89]">
                  Add {selectedLeadIds.size} selected lead(s) to List
                </p>
                <select
                  value={addToListCampaignId}
                  onChange={(e) => setAddToListCampaignId(e.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none"
                >
                  <option value="">Select a List…</option>
                  {addToListCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <ActionButton
                label={addToListBusy ? "Adding…" : "Add"}
                primary
                small
                onClick={handleAddToList}
                disabled={addToListBusy || !addToListCampaignId}
              />
              <button
                type="button"
                onClick={() => setAddToListOpen(false)}
                className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] font-semibold text-[#435471]"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[#8592ab]">
              Creates real Email Automation subscribers — a lead already in that List is skipped, not duplicated. Leads
              with no email on file are skipped too.
            </p>
            {addToListResult ? (
              <div className="mt-2">
                <p className={`text-[13px] font-medium ${addToListResult.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>
                  {addToListResult.text}
                </p>
                {addToListResult.invalidDetails?.length ? (
                  <div className="mt-1.5 text-[12px] text-[#8592ab]">
                    <p className="font-semibold text-[#5f6f89]">Failed deliverability check:</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {addToListResult.invalidDetails.map((d, i) => (
                        <li key={i}>{d.name} ({d.email}) — {d.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {addToListResult.duplicateDetails?.length ? (
                  <div className="mt-1.5 text-[12px] text-[#8592ab]">
                    <p className="font-semibold text-[#5f6f89]">Already in this list:</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {addToListResult.duplicateDetails.map((d, i) => (
                        <li key={i}>{d.name} ({d.email})</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {addToListResult.failedDetails?.length ? (
                  <div className="mt-1.5 text-[12px] text-[#8592ab]">
                    <p className="font-semibold text-[#5f6f89]">Failed to add:</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {addToListResult.failedDetails.map((d, i) => (
                        <li key={i}>{d.name} ({d.email}) — {d.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {addToListResult.skippedNoEmailDetails?.length ? (
                  <div className="mt-1.5 text-[12px] text-[#8592ab]">
                    <p className="font-semibold text-[#5f6f89]">Skipped — no email on file:</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {addToListResult.skippedNoEmailDetails.map((d, i) => (
                        <li key={i}>{d.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-5 py-3">
                  <input
                    type="checkbox"
                    checked={visibleLeads.length > 0 && visibleLeads.every((l) => selectedLeadIds.has(l.id))}
                    onChange={() => toggleSelectAllVisible(visibleLeads.map((l) => l.id))}
                    className="h-4 w-4 rounded border-[#b9c4d8]"
                  />
                </th>
                <th className="px-4 py-3">Lead</th>
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
                    setEnrichResult(null);
                  }}
                  className={`cursor-pointer bg-white transition hover:bg-[#f8faff] ${lead.id === selectedId ? "bg-[#f5f8fd]" : ""}`}
                >
                  <td className="px-5 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLeadSelection(lead.id)}
                      className="h-4 w-4 rounded border-[#b9c4d8]"
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
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
                  <td colSpan={6} className="px-5 py-6 text-[14px] text-[#8592ab]">
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
            setEnrichResult(null);
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
          onConvert={handleConvert}
          converting={converting}
          convertError={convertError}
          onOpenSendMail={openSendMail}
          tagsEditing={tagsEditing}
          tagsDraft={tagsDraft}
          setTagsDraft={setTagsDraft}
          onOpenTags={openTags}
          onCloseTags={closeTags}
          onSaveTags={saveTags}
          savingTags={savingTags}
          tagsError={tagsError}
          timeline={timeline}
          timelineLoading={timelineLoading}
          interactions={interactions}
          interactionsLoading={interactionsLoading}
          onEnrich={handleEnrich}
          enriching={enriching}
          enrichResult={enrichResult}
        />
      ) : null}

      {sendMailOpen ? (
        <SendMailModal
          to={selectedLead?.email}
          form={sendMailForm}
          setForm={setSendMailForm}
          saving={sendMailSaving}
          error={sendMailError}
          onClose={() => setSendMailOpen(false)}
          onSend={submitSendMail}
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

// Real ZoomInfo prospecting search — finds NEW companies/people by
// criteria (unlike the per-lead "Enrich" action, which needs a company/
// contact name you already know). Browse-only: results never write
// anything by themselves, "Add as Lead" just hands the chosen result to
// the existing New Record modal for the rep to review and save.
function ZoomInfoSearchPanel({
  mode, setMode, companyFilters, setCompanyFilters, contactFilters, setContactFilters,
  searching, error, results, totalResults, page, hasSearched, onSearch, onAddAsLead
}) {
  const hasMore = page * 25 < totalResults;

  return (
    <Card className="px-5 py-5">
      <SectionTitle icon={GlobeIcon} iconClass="text-[#2f96da]">
        Find Companies (ZoomInfo)
      </SectionTitle>
      <p className="mt-1 text-[13px] text-[#6a7790]">
        Real search against ZoomInfo's database — a genuine API lookup, not a preview. Results are browse-only until
        you click "Add as Lead" on one.
      </p>

      <div className="mt-4 flex gap-2 rounded-[10px] bg-[#f0f3f9] p-1" style={{ width: "fit-content" }}>
        <button
          type="button"
          onClick={() => setMode("companies")}
          className={`rounded-[8px] px-4 py-1.5 text-[13px] font-semibold transition ${mode === "companies" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"}`}
        >
          Companies
        </button>
        <button
          type="button"
          onClick={() => setMode("contacts")}
          className={`rounded-[8px] px-4 py-1.5 text-[13px] font-semibold transition ${mode === "contacts" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"}`}
        >
          Contacts
        </button>
      </div>

      {mode === "companies" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <EditField label="Company Name" value={companyFilters.companyName} onChange={(v) => setCompanyFilters((c) => ({ ...c, companyName: v }))} placeholder="e.g. Salesforce" />
          <EditField label="Industry" value={companyFilters.industryKeywords} onChange={(v) => setCompanyFilters((c) => ({ ...c, industryKeywords: v }))} placeholder="e.g. Software" />
          <EditField label="Employees min" value={companyFilters.employeeRangeMin} onChange={(v) => setCompanyFilters((c) => ({ ...c, employeeRangeMin: v }))} placeholder="e.g. 50" />
          <EditField label="Employees max" value={companyFilters.employeeRangeMax} onChange={(v) => setCompanyFilters((c) => ({ ...c, employeeRangeMax: v }))} placeholder="e.g. 500" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Job Title" value={contactFilters.jobTitle} onChange={(v) => setContactFilters((c) => ({ ...c, jobTitle: v }))} placeholder="e.g. Chief Executive Officer" />
            <EditField label="Industry" value={contactFilters.industryKeywords} onChange={(v) => setContactFilters((c) => ({ ...c, industryKeywords: v }))} placeholder="e.g. Software" />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Management Level</p>
            <div className="flex flex-wrap gap-2">
              {MANAGEMENT_LEVEL_OPTIONS.map((level) => {
                const checked = contactFilters.managementLevel.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      setContactFilters((c) => ({
                        ...c,
                        managementLevel: checked ? c.managementLevel.filter((l) => l !== level) : [...c.managementLevel, level]
                      }))
                    }
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${checked ? "bg-[#3046b2] text-white" : "border border-[#d6deea] bg-white text-[#4f6181] hover:bg-[#f4f7fb]"}`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <ActionButton label={searching ? "Searching…" : "Search"} icon={GlobeIcon} primary onClick={() => onSearch(1)} disabled={searching} />
        {totalResults > 0 ? <p className="text-[13px] text-[#8592ab]">{totalResults.toLocaleString()} real match(es) on ZoomInfo</p> : null}
      </div>

      {error ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

      {results.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {results.map((result) =>
            mode === "companies" ? (
              <div key={result.id} className="flex items-center justify-between gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#102246]">{result.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[#6a7790]">
                    {[result.city, result.state, result.country].filter(Boolean).join(", ") || "Location unknown"}
                    {result.employeeCount ? ` · ${result.employeeCount} employees` : ""}
                    {result.website ? ` · ${result.website}` : ""}
                  </p>
                </div>
                <ActionButton label="Add as Lead" small onClick={() => onAddAsLead(result)} />
              </div>
            ) : (
              <div key={result.id} className="flex items-center justify-between gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#102246]">
                    {[result.firstName, result.lastName].filter(Boolean).join(" ") || "Unnamed contact"}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[#6a7790]">
                    {result.jobTitle ? `${result.jobTitle} — ` : ""}
                    {result.company?.name ?? "Company unknown"}
                  </p>
                </div>
                <ActionButton label="Add as Lead" small onClick={() => onAddAsLead(result)} />
              </div>
            )
          )}
          {hasMore ? (
            <div className="pt-1">
              <ActionButton label={searching ? "Loading…" : "Load more"} onClick={() => onSearch(page + 1)} disabled={searching} />
            </div>
          ) : null}
        </div>
      ) : !searching && !error && hasSearched ? (
        <p className="mt-4 text-[13px] text-[#9aa6ba]">No matches on ZoomInfo for these filters — try broadening them.</p>
      ) : !searching && !error ? (
        <p className="mt-4 text-[13px] text-[#9aa6ba]">No search run yet — set some filters above and click Search.</p>
      ) : null}
    </Card>
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

function Header({ stats, onNewRecord, onImport, onFindCompanies, zoomInfoPanelOpen, viewsOpen, setViewsOpen, statusFilter, setStatusFilter }) {
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
          <ActionButton label="Find Companies (ZoomInfo)" icon={GlobeIcon} active={zoomInfoPanelOpen} onClick={onFindCompanies} />
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

// A lightweight subject+body composer straight to a lead's own email —
// distinct from the cold-outreach campaign machinery in Email Automation
// (no unsubscribe/bounce/daily-cap handling applies to a direct CRM send).
function SendMailModal({ to, form, setForm, saving, error, onClose, onSend }) {
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
        className="w-full max-w-[560px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#e7edf5] px-6 py-5">
          <div>
            <p className="text-[18px] font-semibold text-[#102246]">Send Mail</p>
            <p className="mt-1 text-[13px] text-[#8592ab]">To {to}</p>
          </div>
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
          <EditField label="Subject" value={form.subject} onChange={(v) => setForm((c) => ({ ...c, subject: v }))} />
          <div>
            <label className="mb-1.5 block text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Message</label>
            <textarea
              value={form.body}
              onChange={(event) => setForm((c) => ({ ...c, body: event.target.value }))}
              rows={8}
              className="w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
            />
          </div>
          {error ? <p className="text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e7edf5] px-6 py-4">
          <ActionButton label="Cancel" small onClick={onClose} disabled={saving} />
          <ActionButton label={saving ? "Sending…" : "Send"} primary small onClick={onSend} disabled={saving} />
        </div>
      </div>
    </div>
  );
}
