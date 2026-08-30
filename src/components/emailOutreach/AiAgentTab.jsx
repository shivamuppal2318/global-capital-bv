import { useEffect, useState } from "react";
import { CogIcon, SparklesIcon, SendIcon } from "../Icons.jsx";
import { emailAiAgentApi } from "../../lib/emailAiAgentApi.js";

const FILTERS = [
  { label: "All", status: null },
  { label: "Drafts", status: "DRAFT" },
  { label: "Sent", status: "SENT" },
  { label: "Skipped", status: "SKIPPED" },
  { label: "Failed", status: "FAILED" }
];

const STATUS_BADGE_CLASS = {
  DRAFT: "bg-[#eef4ff] text-[#4766cc]",
  SENT: "bg-[#e7f8ef] text-[#1f9d55]",
  SKIPPED: "bg-[#f3f0fb] text-[#7d63c9]",
  FAILED: "bg-[#fdeceb] text-[#e0483f]"
};

export function AiAgentTab({ mailing, onNavigateTab }) {
  const { repliedLeads, selectedLead } = mailing;
  const [activeFilter, setActiveFilter] = useState("All");
  const [status, setStatus] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [busyDraftId, setBusyDraftId] = useState(null);
  const [busyLeadId, setBusyLeadId] = useState(null);

  useEffect(() => {
    emailAiAgentApi
      .status()
      .then(setStatus)
      .catch((error) => setLoadError(error.message));
  }, []);

  function loadDrafts(filterStatus) {
    emailAiAgentApi
      .listDrafts(filterStatus)
      .then((backendDrafts) => {
        setDrafts(backendDrafts);
        setLoadError(null);
      })
      .catch((error) => setLoadError(error.message));
  }

  useEffect(() => {
    const filter = FILTERS.find((f) => f.label === activeFilter) ?? FILTERS[0];
    loadDrafts(filter.status);
  }, [activeFilter]);

  function refreshCurrentFilter() {
    const filter = FILTERS.find((f) => f.label === activeFilter) ?? FILTERS[0];
    loadDrafts(filter.status);
  }

  // Generates (or refreshes) a real Claude-drafted reply for every lead
  // that has actually replied — replaces the old fabricated
  // index % 4 status assignment with genuine backend-generated drafts.
  async function handleRunAgent() {
    if (!status?.configured) {
      setNotice("AI Agent isn't configured — add a Claude API key under Admin Panel → AI Assistant first.");
      return;
    }
    if (!repliedLeads.length) {
      setNotice("No replied leads yet — nothing for the AI Agent to draft a reply for.");
      return;
    }

    setRunning(true);
    let succeeded = 0;
    let failed = 0;
    for (const lead of repliedLeads) {
      try {
        await emailAiAgentApi.generate(lead.id);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    setRunning(false);
    setNotice(`AI Agent ran: ${succeeded} draft(s) generated${failed ? `, ${failed} failed` : ""}.`);
    refreshCurrentFilter();
  }

  async function handleGenerateForSelected() {
    if (!selectedLead) return;
    setBusyLeadId(selectedLead.id);
    try {
      await emailAiAgentApi.generate(selectedLead.id);
      setNotice(`Draft generated for ${selectedLead.name}.`);
      refreshCurrentFilter();
    } catch (error) {
      setNotice(`Could not generate a draft for ${selectedLead.name} (${error.message}).`);
    } finally {
      setBusyLeadId(null);
    }
  }

  async function handleSend(draft) {
    setBusyDraftId(draft.id);
    try {
      await emailAiAgentApi.send(draft.id);
      setNotice(`Sent to ${draft.lead?.name ?? "the lead"} (${draft.lead?.company ?? ""}).`);
      refreshCurrentFilter();
    } catch (error) {
      setNotice(`Could not send this draft (${error.message}).`);
      refreshCurrentFilter();
    } finally {
      setBusyDraftId(null);
    }
  }

  async function handleSkip(draft) {
    setBusyDraftId(draft.id);
    try {
      await emailAiAgentApi.skip(draft.id);
      refreshCurrentFilter();
    } catch (error) {
      setNotice(`Could not skip this draft (${error.message}).`);
    } finally {
      setBusyDraftId(null);
    }
  }

  async function handleDiscard(draft) {
    setBusyDraftId(draft.id);
    try {
      await emailAiAgentApi.discard(draft.id);
      setDrafts((current) => current.filter((d) => d.id !== draft.id));
    } catch (error) {
      setNotice(`Could not discard this draft (${error.message}).`);
    } finally {
      setBusyDraftId(null);
    }
  }

  async function handleRegenerate(draft) {
    setBusyDraftId(draft.id);
    try {
      await emailAiAgentApi.generate(draft.leadId);
      refreshCurrentFilter();
    } catch (error) {
      setNotice(`Could not regenerate a draft (${error.message}).`);
    } finally {
      setBusyDraftId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SparklesIcon className="size-5 text-[#2a2d4f]" />
              <h2 className="text-[18px] font-semibold text-[#222347]">AI Agent</h2>
              <span
                className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                  status?.configured ? "bg-[#e7f8ef] text-[#1f9d55]" : "bg-[#ece7f7] text-[#7d719e]"
                }`}
              >
                {status ? (status.configured ? "Enabled" : "Disabled") : "Checking…"}
              </span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-[#6c7891]">
              The AI Agent drafts a reply for each lead who has actually responded, grounded in their real message. Every draft waits
              for a human to review and click Send below — nothing goes out automatically.
            </p>
            <p className="mt-3 text-[14px] text-[#6c7891]">
              AI Provider: anthropic | Model: {status?.model ?? "—"} | Auto-send replies without review: Disabled
            </p>
            {loadError ? <p className="mt-2 text-[13px] text-[#e0483f]">{loadError}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab?.("settings")}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#2d3553]"
            >
              <CogIcon className="size-4" />
              Settings
            </button>
            <button
              type="button"
              onClick={handleRunAgent}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-[12px] bg-[#19b7d4] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)] disabled:opacity-60"
            >
              <SendIcon className="size-4" />
              {running ? "Running…" : "Run Agent Now"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold text-[#222347]">Generated Replies</h3>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => {
              const active = filter.label === activeFilter;
              return (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => setActiveFilter(filter.label)}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium ${
                    active ? "border-[#4d7cff] text-[#2144da] shadow-[inset_0_0_0_1px_rgba(77,124,255,0.35)]" : "border-[#d6deea] text-[#48536d]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {drafts.length ? (
            drafts.map((draft) => {
              const busy = busyDraftId === draft.id;
              return (
                <div key={draft.id} className="rounded-[16px] border border-[#e7edf5] bg-[#fbfcff] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#102246]">
                        {draft.lead?.company ?? "Unknown lead"} <span className="font-normal text-[#8a94aa]">· {draft.lead?.name}</span>
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[#334463]">{draft.subject}</p>
                      <p className="mt-1 text-[13px] leading-5 text-[#6a7790]">
                        {draft.body.length > 220 ? `${draft.body.slice(0, 220)}…` : draft.body}
                      </p>
                      {draft.status === "FAILED" && draft.error ? (
                        <p className="mt-1 text-[12px] text-[#e0483f]">Send failed: {draft.error}</p>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_BADGE_CLASS[draft.status] ?? ""}`}>
                      {draft.status.charAt(0) + draft.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-[#8a94aa]">Provider: anthropic | Model: {draft.model ?? "—"}</p>
                    <div className="flex flex-wrap gap-2">
                      {draft.status === "DRAFT" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSend(draft)}
                            disabled={busy}
                            className="rounded-[8px] bg-[#18b6d3] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                          >
                            {busy ? "…" : "Send"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSkip(draft)}
                            disabled={busy}
                            className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#48536d] disabled:opacity-60"
                          >
                            Skip
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscard(draft)}
                            disabled={busy}
                            className="rounded-[8px] border border-[#f3c9cc] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#e0483f] disabled:opacity-60"
                          >
                            Discard
                          </button>
                        </>
                      ) : null}
                      {(draft.status === "SKIPPED" || draft.status === "FAILED") ? (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(draft)}
                          disabled={busy}
                          className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#48536d] disabled:opacity-60"
                        >
                          Regenerate
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-[14px] text-[#6a7790]">No messages.</p>
          )}
        </div>

        {selectedLead ? (
          <div className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#f8fbff] px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#5f6f89]">Current focus</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] font-medium text-[#102246]">
                {selectedLead.name} · {selectedLead.company}
              </p>
              <button
                type="button"
                onClick={handleGenerateForSelected}
                disabled={busyLeadId === selectedLead.id}
                className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2d3553] disabled:opacity-60"
              >
                {busyLeadId === selectedLead.id ? "Generating…" : "Generate draft for this lead"}
              </button>
            </div>
            {notice ? <p className="mt-1 text-[13px] text-[#6a7790]">{notice}</p> : null}
          </div>
        ) : notice ? (
          <p className="mt-4 text-[13px] text-[#6a7790]">{notice}</p>
        ) : null}
      </div>
    </section>
  );
}
