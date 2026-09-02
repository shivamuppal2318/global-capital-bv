import { useEffect, useState } from "react";
import { CalendarIcon, CopyIcon, PlusIcon, VideoIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { meetingsApi } from "../../lib/zoomApi";
import { callsApi } from "../../lib/relationshipsApi";
import { leadsApi } from "../../lib/leadsApi";
import { CallOutcomePanel } from "./CallOutcomePanel";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function defaultStartTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function MeetingsModule() {
  const [meetings, setMeetings] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [leadId, setLeadId] = useState("");
  const [topic, setTopic] = useState("");
  const [startTime, setStartTime] = useState(defaultStartTime());
  const [duration, setDuration] = useState(30);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [inviteNote, setInviteNote] = useState(null);
  const [copied, setCopied] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [openCapture, setOpenCapture] = useState(null);

  const refresh = () =>
    Promise.all([meetingsApi.list(), callsApi.metrics()]).then(([m, k]) => {
      setMeetings(m);
      setMetrics(k);
    });

  useEffect(() => {
    Promise.all([meetingsApi.list(), leadsApi.list(), callsApi.metrics()])
      .then(([m, l, k]) => {
        setMeetings(m);
        setLeads(l);
        setMetrics(k);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleLeadChange = (id) => {
    setLeadId(id);
    const lead = leads.find((l) => l.id === id);
    if (lead && !topic) setTopic(`Call with ${lead.name} — ${lead.company}`);
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    setScheduling(true);
    setScheduleError(null);
    setInviteNote(null);
    try {
      const created = await meetingsApi.create({
        leadId: leadId || undefined,
        topic: topic || "Investor call",
        startTime: new Date(startTime).toISOString(),
        durationMinutes: Number(duration)
      });
      if (!leadId) {
        setInviteNote(null);
      } else if (created.inviteSent) {
        setInviteNote({ tone: "green", text: "Invite emailed to the lead." });
      } else {
        setInviteNote({
          tone: "amber",
          text: `Meeting created, but the invite wasn't emailed — ${created.inviteError ?? "the lead has no email on file"}. Share the join link yourself.`
        });
      }
      setTopic("");
      setLeadId("");
      await refresh();
    } catch (err) {
      setScheduleError(err.message);
    } finally {
      setScheduling(false);
    }
  };

  const handleCancel = async (id) => {
    await meetingsApi.patch(id, { status: "Cancelled" });
    refresh();
  };

  const handleCopy = async (id, url) => {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading meetings…</Card>
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

  const has = (v) => v !== null && v !== undefined;
  const stats = [
    {
      label: "Calls completed",
      value: String(metrics?.completed ?? 0),
      note: metrics?.upcoming ? `${metrics.upcoming} upcoming` : "None upcoming",
      noteTone: "blue"
    },
    {
      label: "Average duration",
      value: has(metrics?.avgDurationMinutes) ? `${metrics.avgDurationMinutes}m` : "\u2014",
      note: "Actual where recorded",
      noteTone: "green"
    },
    {
      label: "Follow-up created",
      value: has(metrics?.followUpRate) ? `${metrics.followUpRate}%` : "\u2014",
      note: metrics?.completed ? `${metrics.followUpCreated}/${metrics.completed} calls` : "No calls yet",
      noteTone: "amber"
    },
    {
      label: "Client satisfaction",
      value: has(metrics?.avgSatisfaction) ? `${metrics.avgSatisfaction}/5` : "\u2014",
      note: metrics?.ratedCount ? `${metrics.ratedCount} rated` : "Not rated yet",
      noteTone: "green"
    },
    {
      label: "Next meeting set",
      value: has(metrics?.nextMeetingRate) ? `${metrics.nextMeetingRate}%` : "\u2014",
      note: metrics?.completed ? `${metrics.nextMeetingScheduled}/${metrics.completed} calls` : "No calls yet",
      noteTone: "blue"
    }
  ];

  return (
    <div className="space-y-6">
      <Header stats={stats} />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="px-5 py-5">
          <SectionTitle icon={PlusIcon} iconClass="text-[#3046b2]">
            Schedule a Zoom call
          </SectionTitle>
          <form onSubmit={handleSchedule} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Lead</label>
              <select
                value={leadId}
                onChange={(e) => handleLeadChange(e.target.value)}
                className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
              >
                <option value="">No lead (general call)</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} — {lead.company}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Topic</label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Mandate fit call"
                className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Date & time</label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                >
                  {[15, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ActionButton label={scheduling ? "Scheduling…" : "Schedule Zoom call"} icon={VideoIcon} primary onClick={handleSchedule} />
            {scheduleError ? <p className="text-[13px] font-medium text-[#e0483f]">{scheduleError}</p> : null}
            {inviteNote ? (
              <p className={`text-[13px] font-medium ${inviteNote.tone === "green" ? "text-[#2b9b60]" : "text-[#c47f1a]"}`}>{inviteNote.text}</p>
            ) : null}
          </form>
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={CalendarIcon} iconClass="text-[#f29b3a]">
            Meetings
          </SectionTitle>
          <div className="mt-4 space-y-3">
            {meetings.length === 0 ? (
              <p className="text-[14px] text-[#8592ab]">No meetings yet — schedule one on the left.</p>
            ) : (
              meetings.map((m) => (
                <div key={m.id} className="rounded-[16px] border border-[#e7edf5] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[#102246]">{m.topic}</p>
                      <p className="mt-1 text-[13px] text-[#5f6f89]">
                        {formatDateTime(m.startTime)} · {m.durationMinutes}m
                        {m.lead ? ` · ${m.lead.name} (${m.lead.company})` : ""}
                      </p>
                    </div>
                    <Badge tone={m.status === "Scheduled" ? "green" : m.status === "Cancelled" ? "red" : "slate"}>{m.status}</Badge>
                  </div>
                  {m.joinUrl ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href={m.joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#2d8cff] hover:bg-[#f4f7fb]"
                      >
                        <VideoIcon className="size-4" /> Join
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.joinUrl)}
                        className="grid size-8 place-items-center rounded-[10px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                      >
                        <CopyIcon className="size-3.5" />
                      </button>
                      {copied === m.id ? <span className="text-[12px] text-[#2b9b60]">Copied.</span> : null}
                      {m.status === "Scheduled" ? (
                        <button
                          type="button"
                          onClick={() => handleCancel(m.id)}
                          className="ml-auto text-[13px] font-medium text-[#e0483f] hover:underline"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f0f3f8] pt-3">
                    <button
                      type="button"
                      onClick={() => setOpenCapture(openCapture === m.id ? null : m.id)}
                      className="text-[13px] font-semibold text-[#3046b2] hover:underline"
                    >
                      {openCapture === m.id ? "Hide call record" : m.notes ? "Edit call record" : "Log call outcome"}
                    </button>
                    {m.notes ? <Badge tone="green">Notes</Badge> : null}
                    {m.aiSummary ? <Badge tone="blue">AI summary</Badge> : null}
                    {m.nextAction ? <Badge tone="amber">Follow-up</Badge> : null}
                    {m.clientSatisfaction ? <Badge tone="slate">{m.clientSatisfaction}/5</Badge> : null}
                  </div>

                  {openCapture === m.id ? (
                    <CallOutcomePanel
                      // Keyed by id so switching between meetings resets the
                      // form rather than carrying the previous call's answers.
                      key={m.id}
                      meeting={m}
                      onSaved={() => refresh()}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Header({ stats }) {
  return (
    <section>
      <div className="max-w-3xl">
        <span className="inline-flex rounded-full bg-[#dff2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#2995db]">
          Module
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Zoom Call</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          Schedule Zoom calls against your leads, then capture what happened — attendees, duration, notes, an AI
          summary and the next action — so the follow-through is measurable.
        </p>
      </div>

      {stats ? (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
