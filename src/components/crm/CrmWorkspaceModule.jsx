import { useEffect, useState } from "react";
import {
  AttachmentIcon,
  CalendarIcon,
  FunnelIcon,
  GridIcon,
  MailIcon,
  NoteIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SendIcon,
  TagIcon,
  UploadIcon,
  UserCheckIcon
} from "../Icons";
import { ActionButton, Card, noteToneClass, StatCard } from "../ui";
import { leadsApi } from "../../lib/leadsApi";

const avatarToneClass = {
  blue: "bg-[#dff1ff] text-[#2f96da]",
  amber: "bg-[#ffe6cc] text-[#f29b3a]",
  green: "bg-[#dff5e7] text-[#2a9c60]",
  violet: "bg-[#efe5ff] text-[#8b52d0]",
  sky: "bg-[#def1ff] text-[#2b94da]"
};

const STATUS_LABEL = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", NEGOTIATION: "Negotiation", CONVERTED: "Converted", LOST: "Lost" };

const relatedIcons = {
  Notes: NoteIcon,
  Attachments: AttachmentIcon,
  Emails: MailIcon,
  Calls: PhoneIcon,
  Meetings: CalendarIcon,
  Cadences: SendIcon
};

export function CrmWorkspaceModule() {
  const [leads, setLeads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");

  useEffect(() => {
    leadsApi
      .list()
      .then((data) => {
        setLeads(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
        ["Territory", selectedLead.territory ?? "—"],
        ["Engagement Stage", selectedLead.engagementStage ?? "—"],
        ["Consent (GDPR)", selectedLead.consentGdpr ?? "—"]
      ]
    : [];

  const related = [
    ["Notes", 0],
    ["Attachments", 0],
    ["Emails", 0],
    ["Calls", 0],
    ["Meetings", 0],
    ["Cadences", 0]
  ];

  return (
    <div className="space-y-6">
      <Header stats={stats} />

      <section className="grid gap-4 xl:grid-cols-[320px_1fr_260px]">
        <Card>
          <div className="border-b border-[#e7edf5] px-5 py-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">New Enquiries</h2>
            <p className="mt-1 text-[14px] text-[#6a7790]">{leads.length} of {leads.length} records</p>
          </div>
          <div>
            {leads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => setSelectedId(lead.id)}
                className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                  lead.id === selectedId ? "bg-[#f5f8fd]" : ""
                }`}
              >
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${avatarToneClass[lead.tone]}`}>
                  {lead.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold text-[#102246]">{lead.name}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[lead.tone]}`}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[14px] text-[#435471]">
                    {lead.company} · {lead.capitalAsk}
                  </p>
                </div>
              </button>
            ))}
            {leads.length === 0 ? (
              <p className="px-5 py-6 text-[14px] text-[#8592ab]">
                No leads yet — send one in via the webhook (Settings → Integrations & API) or wait for one to arrive from WhatsApp.
              </p>
            ) : null}
          </div>
        </Card>

        {selectedLead ? (
          <div className="space-y-4">
            <Card className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`grid size-12 place-items-center rounded-full text-[15px] font-semibold ${avatarToneClass[selectedLead.tone]}`}>
                    {selectedLead.initials}
                  </div>
                  <div>
                    <p className="text-[18px] font-semibold text-[#102246]">{selectedLead.name}</p>
                    <p className="mt-1 text-[14px] text-[#5f6f89]">
                      {selectedLead.company} · Owner {selectedLead.owner ?? "Unassigned"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <ActionButton label="Send Mail" icon={MailIcon} primary />
                  <ActionButton label="WhatsApp" icon={SendIcon} />
                  <ActionButton label="Call" icon={PhoneIcon} />
                  <ActionButton label="Convert" icon={UserCheckIcon} />
                  <ActionButton label="Edit" icon={PencilIcon} />
                  <ActionButton label="Tags" icon={TagIcon} />
                </div>
              </div>
            </Card>

            <Card className="px-5 py-5">
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

              {activeTab === "Overview" ? (
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
                  {selectedLead.notes ? (
                    <div className="mt-4 rounded-[16px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3">
                      <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Notes from source</p>
                      <p className="mt-2 text-[14px] leading-6 text-[#334463]">{selectedLead.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-6 text-[14px] text-[#8592ab]">Nothing recorded yet.</p>
              )}
            </Card>
          </div>
        ) : (
          <Card className="px-5 py-10 text-center text-[14px] text-[#8592ab]">Select a lead to see its details.</Card>
        )}

        <Card className="px-5 py-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Related Lists</p>
          <div className="mt-6 space-y-5">
            {related.map(([label, count]) => {
              const Icon = relatedIcons[label] ?? GridIcon;
              return (
                <div key={label} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-[#102246]">
                    <Icon className="size-4 text-[#5f6f89]" />
                    <span className="text-[15px] font-medium">{label}</span>
                  </div>
                  <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[12px] font-semibold text-[#5f6f89]">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Header({ stats }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[#dfe6ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3556be]">
            Module
          </span>
          <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">CRM Workspace</h1>
          <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
            Zoho-style enquiry management: records, related lists, timelines and one-click outreach across email, WhatsApp and phone.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <ActionButton label="New record" icon={PlusIcon} primary />
          <ActionButton label="Import" icon={UploadIcon} />
          <ActionButton label="Views" icon={FunnelIcon} />
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
