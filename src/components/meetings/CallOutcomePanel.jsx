import { useState } from "react";
import { ActionButton } from "../ui";
import { callsApi } from "../../lib/relationshipsApi";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const asDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");

// Everything captured after the call has happened: who was actually in the
// room, how long it really ran, what was said, and what happens next.
export function CallOutcomePanel({ meeting, onSaved }) {
  const [form, setForm] = useState({
    clientAttendees: meeting.clientAttendees ?? "",
    ourAttendees: meeting.ourAttendees ?? "",
    actualDurationMinutes: meeting.actualDurationMinutes ?? "",
    notes: meeting.notes ?? "",
    nextAction: meeting.nextAction ?? "",
    nextActionDueAt: asDateInput(meeting.nextActionDueAt),
    nextMeetingScheduled: Boolean(meeting.nextMeetingScheduled),
    recordingLink: meeting.recordingLink ?? "",
    clientSatisfaction: meeting.clientSatisfaction ?? 0
  });
  const [saving, setSaving] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(meeting.aiSummary ?? null);
  const [summaryAt, setSummaryAt] = useState(meeting.aiSummaryUpdatedAt ?? null);
  const [transcript, setTranscript] = useState(meeting.transcriptText ?? null);
  const [transcriptSummary, setTranscriptSummary] = useState(meeting.transcriptSummary ?? null);
  const [transcriptSummaryAt, setTranscriptSummaryAt] = useState(meeting.transcriptSummaryUpdatedAt ?? null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError(null);
    try {
      const updated = await callsApi.update(meeting.id, {
        ...form,
        actualDurationMinutes: form.actualDurationMinutes === "" ? null : form.actualDurationMinutes,
        nextActionDueAt: form.nextActionDueAt || null,
        clientSatisfaction: form.clientSatisfaction || null
      });
      onSaved?.(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Summarising reads the notes stored on the server, so unsaved edits in
  // this textarea are saved first — otherwise the user summarises the old
  // version of their own notes without realising.
  async function summarise() {
    setSummarising(true);
    setError(null);
    try {
      if (form.notes !== (meeting.notes ?? "")) {
        await callsApi.update(meeting.id, { notes: form.notes });
      }
      const updated = await callsApi.summarise(meeting.id);
      setSummary(updated.aiSummary);
      setSummaryAt(updated.aiSummaryUpdatedAt);
      onSaved?.(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSummarising(false);
    }
  }

  // Pulls Zoom's own Cloud Recording transcript and AI-summarizes it in one
  // step — the manual fallback for whenever the automatic recording.completed
  // webhook hasn't fired yet (Zoom's processing lag, a missed delivery, or
  // this call simply predates the webhook being wired up).
  async function fetchTranscript() {
    setFetchingTranscript(true);
    setTranscriptError(null);
    try {
      const updated = await callsApi.fetchTranscript(meeting.id);
      setTranscript(updated.transcriptText);
      setTranscriptSummary(updated.transcriptSummary);
      setTranscriptSummaryAt(updated.transcriptSummaryUpdatedAt);
      setTranscriptOpen(true);
      onSaved?.(updated);
    } catch (err) {
      setTranscriptError(err.message);
    } finally {
      setFetchingTranscript(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 rounded-[14px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Client attendees</label>
          <input
            className={inputClass}
            value={form.clientAttendees}
            onChange={(e) => set("clientAttendees", e.target.value)}
            placeholder="Who actually joined from their side"
          />
        </div>
        <div>
          <label className={labelClass}>Our attendees</label>
          <input
            className={inputClass}
            value={form.ourAttendees}
            onChange={(e) => set("ourAttendees", e.target.value)}
            placeholder="Who joined from ours"
          />
        </div>

        <div>
          <label className={labelClass}>Actual duration (minutes)</label>
          <input
            type="number"
            min="1"
            className={inputClass}
            value={form.actualDurationMinutes}
            onChange={(e) => set("actualDurationMinutes", e.target.value)}
            placeholder={`Booked for ${meeting.durationMinutes}`}
          />
        </div>
        <div>
          <label className={labelClass}>Recording link</label>
          <input
            className={inputClass}
            value={form.recordingLink}
            onChange={(e) => set("recordingLink", e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Call notes</label>
          <textarea
            rows={5}
            className={`${inputClass} resize-y`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="What was discussed, what they asked for, what was agreed"
          />
        </div>

        <div>
          <label className={labelClass}>Next action</label>
          <input
            className={inputClass}
            value={form.nextAction}
            onChange={(e) => set("nextAction", e.target.value)}
            placeholder="Send teaser, share data room access…"
          />
        </div>
        <div>
          <label className={labelClass}>Next action due</label>
          <input
            type="date"
            className={inputClass}
            value={form.nextActionDueAt}
            onChange={(e) => set("nextActionDueAt", e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Client satisfaction</label>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set("clientSatisfaction", form.clientSatisfaction === n ? 0 : n)}
                className={`size-9 rounded-[10px] border text-[14px] font-semibold ${
                  form.clientSatisfaction >= n
                    ? "border-[#3046b2] bg-[#3046b2] text-white"
                    : "border-[#d6deea] bg-white text-[#5c6b87]"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-[12px] text-[#8592ab]">
              {form.clientSatisfaction ? "Click again to clear" : "Not rated"}
            </span>
          </div>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-[14px] font-medium text-[#334463]">
            <input
              type="checkbox"
              checked={form.nextMeetingScheduled}
              onChange={(e) => set("nextMeetingScheduled", e.target.checked)}
            />
            A next meeting came out of this call
          </label>
        </div>
      </div>

      {summary ? (
        <div className="mt-4 rounded-[12px] border border-[#dfe6f5] bg-white px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3046b2]">AI summary</p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#334463]">{summary}</p>
          {summaryAt ? (
            <p className="mt-2 text-[11px] text-[#8592ab]">
              Generated {new Date(summaryAt).toLocaleString()} from the notes above — check it before sending it on.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton label={saving ? "Saving…" : "Save call record"} primary small onClick={save} disabled={saving} />
        <ActionButton
          label={summarising ? "Summarising…" : summary ? "Regenerate AI summary" : "Summarise with AI"}
          small
          onClick={summarise}
          disabled={summarising || !form.notes.trim()}
        />
      </div>

      <div className="mt-5 border-t border-[#e7edf5] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3046b2]">Zoom transcript</p>
          <ActionButton
            label={fetchingTranscript ? "Fetching…" : transcript ? "Refresh from Zoom" : "Fetch Transcript & Summary"}
            small
            onClick={fetchTranscript}
            disabled={fetchingTranscript}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-[#8592ab]">
          Pulled automatically from Zoom Cloud Recording once the call ends, or fetch it here if that hasn't happened yet.
        </p>
        {transcriptError ? <p className="mt-2 text-[13px] font-medium text-[#e0483f]">{transcriptError}</p> : null}

        {transcriptSummary ? (
          <div className="mt-3 rounded-[12px] border border-[#dfe6f5] bg-white px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#3046b2]">Transcript summary</p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#334463]">{transcriptSummary}</p>
            {transcriptSummaryAt ? (
              <p className="mt-2 text-[11px] text-[#8592ab]">
                Generated {new Date(transcriptSummaryAt).toLocaleString()} from what Zoom actually recorded — check it before sending it on.
              </p>
            ) : null}
          </div>
        ) : null}

        {transcript ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setTranscriptOpen((o) => !o)}
              className="text-[13px] font-semibold text-[#3046b2] hover:underline"
            >
              {transcriptOpen ? "Hide full transcript" : "Show full transcript"}
            </button>
            {transcriptOpen ? (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-[12px] border border-[#e7edf5] bg-white px-4 py-3">
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#334463]">{transcript}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
