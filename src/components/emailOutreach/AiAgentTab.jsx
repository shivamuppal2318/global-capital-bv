import { useMemo, useState } from "react";
import { CogIcon, SparklesIcon, SendIcon } from "../Icons.jsx";

const filters = ["All", "Drafts", "Sent", "Skipped", "Failed", "Queued"];

export function AiAgentTab({ mailing, onNavigateTab }) {
  const { repliedLeads, selectedLead, automationNotice } = mailing;
  const [activeFilter, setActiveFilter] = useState("All");

  const generatedReplies = useMemo(
    () =>
      repliedLeads.map((lead, index) => ({
        id: lead.id ?? `reply-${index}`,
        company: lead.company || lead.name || "Unknown lead",
        preview: lead.replyPreview || "AI draft ready for review.",
        status: index % 4 === 0 ? "Drafts" : index % 4 === 1 ? "Queued" : index % 4 === 2 ? "Sent" : "Skipped",
        model: "claude-opus-4-8",
        provider: "anthropic"
      })),
    [repliedLeads]
  );

  const visibleReplies =
    activeFilter === "All" ? generatedReplies : generatedReplies.filter((item) => item.status === activeFilter);

  return (
    <section className="space-y-5">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SparklesIcon className="size-5 text-[#2a2d4f]" />
              <h2 className="text-[18px] font-semibold text-[#222347]">AI Agent</h2>
              <span className="rounded-full bg-[#ece7f7] px-3 py-1 text-[12px] font-semibold text-[#7d719e]">Disabled</span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-[#6c7891]">
              The AI Agent reads incoming mailbox messages and drafts replies. Configure the provider and behaviour under Settings.
            </p>
            <p className="mt-3 text-[14px] text-[#6c7891]">
              AI Provider: anthropic | Model: claude-opus-4-8 | Auto-send replies without review: Disabled
            </p>
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
              onClick={() => onNavigateTab?.("replies")}
              className="inline-flex items-center gap-2 rounded-[12px] bg-[#19b7d4] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
            >
              <SendIcon className="size-4" />
              Run Agent Now
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold text-[#222347]">Generated Replies</h3>
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => {
              const active = filter === activeFilter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium ${
                    active ? "border-[#4d7cff] text-[#2144da] shadow-[inset_0_0_0_1px_rgba(77,124,255,0.35)]" : "border-[#d6deea] text-[#48536d]"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visibleReplies.length ? (
            visibleReplies.map((reply) => (
              <div key={reply.id} className="rounded-[16px] border border-[#e7edf5] bg-[#fbfcff] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[#102246]">{reply.company}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#6a7790]">{reply.preview}</p>
                  </div>
                  <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-[12px] font-semibold text-[#4766cc]">{reply.status}</span>
                </div>
                <p className="mt-2 text-[12px] text-[#8a94aa]">
                  Provider: {reply.provider} | Model: {reply.model}
                </p>
              </div>
            ))
          ) : (
            <p className="text-[14px] text-[#6a7790]">No messages.</p>
          )}
        </div>

        {selectedLead ? (
          <div className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#f8fbff] px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#5f6f89]">Current focus</p>
            <p className="mt-2 text-[14px] font-medium text-[#102246]">{selectedLead.name} · {selectedLead.company}</p>
            <p className="mt-1 text-[13px] text-[#6a7790]">{automationNotice}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
