import { useCallback, useEffect, useMemo, useState } from "react";
import { channelPartnersApi } from "../../lib/relationshipsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { LinkIcon, PlusIcon, SearchIcon, XIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const STATUSES = ["ACTIVE", "INACTIVE", "PROSPECTIVE"];

const STATUS_LABEL = { ACTIVE: "Active", INACTIVE: "Inactive", PROSPECTIVE: "Prospective" };
const STATUS_TONE = { ACTIVE: "green", INACTIVE: "slate", PROSPECTIVE: "amber" };

const has = (v) => v !== null && v !== undefined;

// A directory of the partner organisations that refer/introduce leads —
// distinct from the "Channel Partner" filter tag on a Lead itself (Universal
// Filters, CRM Workspace edit form), which is just a free-text label. This
// is the partner as its own record: who to contact, what they're owed,
// whether the relationship is still live, and how many real leads (matched
// by name) they've actually referred.
export function ChannelPartnerModule() {
  const [partners, setPartners] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([channelPartnersApi.list({ status: statusFilter, q: query }), channelPartnersApi.metrics()])
      .then(([rows, m]) => {
        setPartners(rows);
        setMetrics(m);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const startNew = () =>
    setEditing({ name: "", contactName: "", contactEmail: "", contactPhone: "", region: "", commissionPct: "", status: "ACTIVE", notes: "" });

  const startEdit = (p) =>
    setEditing({
      id: p.id,
      name: p.name,
      contactName: p.contactName ?? "",
      contactEmail: p.contactEmail ?? "",
      contactPhone: p.contactPhone ?? "",
      region: p.region ?? "",
      commissionPct: has(p.commissionPct) ? String(p.commissionPct) : "",
      status: p.status,
      notes: p.notes ?? ""
    });

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!editing.name.trim()) return setFormError("Give the partner a name.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing, commissionPct: editing.commissionPct === "" ? null : Number(editing.commissionPct) };
      if (editing.id) await channelPartnersApi.update(editing.id, body);
      else await channelPartnersApi.create(body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(partner) {
    if (!window.confirm(`Delete "${partner.name}"? This cannot be undone.`)) return;
    setBusyId(partner.id);
    try {
      await channelPartnersApi.remove(partner.id);
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const cards = useMemo(
    () => [
      { label: "Total partners", value: String(metrics?.totalPartners ?? 0), note: "In the directory", noteTone: "blue" },
      { label: "Active", value: String(metrics?.active ?? 0), note: "Currently referring", noteTone: "green" },
      { label: "Prospective", value: String(metrics?.prospective ?? 0), note: "Not yet active", noteTone: "amber" },
      {
        label: "Leads referred",
        value: String(metrics?.totalLeadsReferred ?? 0),
        note: metrics?.topPartner ? `Top: ${metrics.topPartner.name} (${metrics.topPartner.referredLeads})` : "None matched yet",
        noteTone: "violet"
      }
    ],
    [metrics]
  );

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          Relationships
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Channel Partner</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          The organisations that refer or introduce deals — who to contact, what they're owed, and how many real leads
          each one has actually sent in.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={LinkIcon}
          iconClass="text-[#3046b2]"
          subtitle="Referred-leads count matches this partner's name against Lead.channelPartner — set on a lead from CRM Workspace's edit form."
          action={
            <ActionButton
              label={editing ? "Cancel" : "Add partner"}
              icon={editing ? XIcon : PlusIcon}
              small
              onClick={() => (editing ? setEditing(null) : startNew())}
            />
          }
        >
          Partner directory
        </SectionTitle>

        {editing ? (
          <form onSubmit={handleSave} className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Partner name</label>
                <input
                  className={inputClass}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Iberia Solar Partners"
                  disabled={Boolean(editing.id)}
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Contact name</label>
                <input className={inputClass} value={editing.contactName} onChange={(e) => setEditing({ ...editing, contactName: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Region</label>
                <input className={inputClass} value={editing.region} onChange={(e) => setEditing({ ...editing, region: e.target.value })} placeholder="e.g. Iberia" />
              </div>
              <div>
                <label className={labelClass}>Contact email</label>
                <input className={inputClass} value={editing.contactEmail} onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })} placeholder="name@partner.com" />
              </div>
              <div>
                <label className={labelClass}>Contact phone</label>
                <input className={inputClass} value={editing.contactPhone} onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Commission %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className={inputClass}
                  value={editing.commissionPct}
                  onChange={(e) => setEditing({ ...editing, commissionPct: e.target.value })}
                  placeholder="e.g. 2.5"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-y`}
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="How the relationship started, anything worth remembering"
                />
              </div>
            </div>

            {formError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}
            <div className="mt-4">
              <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving} />
            </div>
          </form>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9aa6bd]" />
            <input
              className={`${inputClass} pl-10`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search partner, contact or region"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                statusFilter === s ? "bg-[#21439b] text-white" : "border border-[#d6deea] bg-white text-[#4f6181]"
              }`}
            >
              {s === "All" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {notice ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{notice}</p> : null}
        {error ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <div className="mt-4 space-y-3">
          {loading ? <p className="text-[14px] text-[#5c6b87]">Loading…</p> : null}
          {!loading && partners.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No channel partners yet. Add one to start tracking who's referring deals.
            </p>
          ) : null}

          {partners.map((p) => (
            <div key={p.id} className="rounded-[16px] border border-[#e7edf5] bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-[#102246]">{p.name}</p>
                  <p className="mt-1 text-[13px] text-[#5c6b87]">
                    {p.contactName ? `${p.contactName} · ` : ""}
                    {p.contactEmail ?? "No contact email"}
                    {p.contactPhone ? ` · ${p.contactPhone}` : ""}
                    {p.region ? ` · ${p.region}` : ""}
                    {has(p.commissionPct) ? ` · ${p.commissionPct}% commission` : ""}
                  </p>
                  {p.notes ? <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#4f6181]">{p.notes}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{p.referredLeads} lead{p.referredLeads === 1 ? "" : "s"} referred</Badge>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ActionButton small label="Edit" onClick={() => startEdit(p)} disabled={busyId === p.id} />
                <ActionButton small label="Delete" onClick={() => remove(p)} disabled={busyId === p.id} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
