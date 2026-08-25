import { useEffect, useState } from "react";
import { ActionButton } from "../ui.jsx";
import { RadarIcon, SendIcon, SparklesIcon } from "../Icons.jsx";
import { marketIntelligenceApi } from "../../lib/marketIntelligenceApi.js";
import { ChatBubble } from "./ChatBubble.jsx";

const signalStatusToneClass = {
  PENDING: "bg-[#edf2f7] text-[#748096]",
  PROCESSED: "bg-[#dff5e7] text-[#2b9b60]",
  DUPLICATE: "bg-[#edf2f7] text-[#748096]",
  IGNORED: "bg-[#fff4e7] text-[#f29b3a]",
  FAILED: "bg-[#ffe4ee] text-[#ef5b8f]"
};

const signalSourceLabel = {
  GOOGLE_NEWS: "Google News",
  NEWSAPI: "NewsAPI.ai",
  EXA: "Exa Search",
  FIRECRAWL: "Firecrawl"
};

const signalTypeConfig = {
  FUNDING: { label: "Funding", tone: "bg-[#dff5e7] text-[#2b9b60]" },
  ACQUISITION: { label: "Acquisition", tone: "bg-[#e6ebff] text-[#5769d4]" },
  EXPANSION: { label: "Expansion", tone: "bg-[#dff2ff] text-[#2995db]" },
  LEADERSHIP_CHANGE: { label: "Leadership change", tone: "bg-[#ffe9d0] text-[#f29c38]" },
  DISTRESS: { label: "Distress", tone: "bg-[#ffe3e3] text-[#e0483f]" },
  OTHER: { label: "Other", tone: "bg-[#edf2f7] text-[#748096]" }
};

function relevanceBarTone(score) {
  if (score >= 70) return "bg-[#2b9b60]";
  if (score >= 40) return "bg-[#f29b3a]";
  return "bg-[#9aa6ba]";
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// No AI provider configured — this is a plain keyword search over the real
// captured signals, not a language model. Still genuinely useful (real
// data, real matches), just not "understanding" the question the way the
// real assistant (marketIntelligenceApi.chat, once an AI key exists) does.
// Kept honestly labeled as a fallback in the UI rather than dressed up to
// look smarter than it is.
function buildFallbackAnswer(message, signals) {
  const terms = message
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const matches = signals.filter((signal) => {
    const haystack = `${signal.entityName ?? ""} ${signal.rawTitle} ${signal.rawContent ?? ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });

  if (!matches.length) {
    return `No captured signals matched "${message}". Try different keywords, or connect an AI provider for a real understanding of the question.`;
  }

  const preview = matches
    .slice(0, 5)
    .map((signal) => `• ${signal.entityName ?? signal.rawTitle}`)
    .join("\n");
  const remainder = matches.length > 5 ? `\n…and ${matches.length - 5} more.` : "";
  return `Found ${matches.length} captured signal${matches.length === 1 ? "" : "s"} matching "${message}":\n${preview}${remainder}`;
}

// Scans Google News RSS (live, no key needed) + stubbed NewsAPI/Exa/
// Firecrawl/Apollo for funding/acquisition/expansion signals, routes them
// against EmailLead.company, and offers a grounded chat assistant (falls
// back to real keyword search when no ANTHROPIC_API_KEY is configured).
export function MarketIntelligenceModule() {
  const [status, setStatus] = useState(null);
  const [signals, setSignals] = useState([]);
  const [notice, setNotice] = useState("Checking backend connectivity…");
  const [running, setRunning] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const loadStatusAndSignals = () => {
    marketIntelligenceApi
      .status()
      .then((result) => {
        setStatus(result);
        setNotice((current) => (current === "Checking backend connectivity…" ? "Connected to the backend." : current));
      })
      .catch((error) => {
        setStatus(null);
        setNotice(`Backend unreachable (${error.message}) — this page needs the API running to show anything real.`);
      });

    marketIntelligenceApi
      .signals()
      .then((result) => setSignals(result))
      .catch(() => {
        // Keep whatever signals are already shown (likely none) — the
        // status fetch above already surfaces the connectivity problem.
      });
  };

  useEffect(() => {
    loadStatusAndSignals();
  }, []);

  async function handleRunPipeline() {
    setRunning(true);
    try {
      const summary = await marketIntelligenceApi.run({});
      if (summary.skippedSources?.length === 5 || (status && Object.values(status).every((v) => !v))) {
        setNotice(`Ran, but every source is unconfigured — nothing to fetch. Skipped: ${summary.skippedSources?.join(", ") ?? "all"}.`);
      } else {
        setNotice(
          `Run complete — fetched ${summary.fetched}, ${summary.duplicates} duplicate(s), ${summary.matched} matched to existing leads, ${summary.created} new lead(s) created, ${summary.ignored} ignored, ${summary.failed} failed.`
        );
      }
      loadStatusAndSignals();
    } catch (error) {
      setNotice(`Run failed via the backend (${error.message}).`);
    } finally {
      setRunning(false);
    }
  }

  const services = status
    ? [
        { key: "googleNews", label: "Google News RSS" },
        { key: "newsApi", label: "NewsAPI.ai" },
        { key: "exa", label: "Exa Search" },
        { key: "firecrawl", label: "Firecrawl" },
        { key: "apollo", label: "Apollo" },
        { key: "aiProcessor", label: "AI processing (Claude)" }
      ]
    : [];

  // Real counts computed from the signals actually stored in the DB — not
  // fabricated. Duplicates aren't included: the pipeline detects and skips
  // those before a MarketSignal row is ever created.
  const signalStats = {
    total: signals.length,
    processed: signals.filter((s) => s.status === "PROCESSED").length,
    matched: signals.filter((s) => s.matchedLeadId).length,
    created: signals.filter((s) => s.createdLeadId).length,
    failed: signals.filter((s) => s.status === "FAILED").length
  };

  // KPI Framework's Hot/Warm/Cold bands (80-100 / 50-79 / below 50), applied
  // to the real relevanceScore the AI processor already assigns each signal
  // — no new field or computation needed, just aggregated. Signals not yet
  // AI-scored (PENDING/FAILED) are excluded rather than counted as Cold, so
  // an unconfigured AI processor doesn't silently show every signal as
  // low-quality.
  const scoredSignals = signals.filter((s) => s.relevanceScore != null);
  const hotSignals = scoredSignals.filter((s) => s.relevanceScore >= 80);
  const warmSignals = scoredSignals.filter((s) => s.relevanceScore >= 50 && s.relevanceScore < 80);
  const coldSignals = scoredSignals.filter((s) => s.relevanceScore < 50);
  const avgIntentScore =
    scoredSignals.length > 0 ? Math.round(scoredSignals.reduce((sum, s) => sum + s.relevanceScore, 0) / scoredSignals.length) : null;
  // "High confidence companies" per the KPI Framework — Hot-tier signals
  // that haven't already been routed to a lead, i.e. still actionable.
  const aiRecommendedCount = hotSignals.filter((s) => !s.matchedLeadId && !s.createdLeadId).length;

  const filteredSignals = searchText.trim()
    ? signals.filter((s) => `${s.entityName ?? ""} ${s.rawTitle}`.toLowerCase().includes(searchText.trim().toLowerCase()))
    : signals;

  const chatEnabled = Boolean(status?.aiProcessor);

  async function handleSendChat() {
    const message = chatInput.trim();
    if (!message || chatLoading) {
      return;
    }
    const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
    setChatMessages((current) => [...current, { role: "user", content: message }]);
    setChatInput("");

    // No AI provider connected — answer with a real (if dumb) keyword
    // search over the actual captured signals instead of leaving the input
    // unusable until someone wires ANTHROPIC_API_KEY.
    if (!chatEnabled) {
      setChatMessages((current) => [...current, { role: "assistant", content: buildFallbackAnswer(message, signals), isFallback: true }]);
      return;
    }

    setChatLoading(true);
    try {
      const { reply } = await marketIntelligenceApi.chat(message, history);
      setChatMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch (error) {
      setChatMessages((current) => [...current, { role: "assistant", content: `Couldn't get a response (${error.message}).`, isError: true }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="max-w-3xl">
          <h1 className="text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Market Intelligence</h1>
          <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
            Scans news, the open web, and press pages for funding/acquisition/expansion signals, then matches them to existing
            deals or sources a new one via Apollo.
          </p>
        </div>
      </section>

      {signals.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Companies scanned", value: signalStats.total },
              { label: "Processed", value: signalStats.processed },
              { label: "Matched to lead", value: signalStats.matched },
              { label: "New leads created", value: signalStats.created },
              { label: "Failed (AI not configured)", value: signalStats.failed }
            ].map((stat) => (
              <div key={stat.label} className="rounded-[16px] border border-[#d6deea] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(30,48,87,0.04)]">
                <p className="text-[1.6rem] font-semibold leading-none text-[#102246]">{stat.value}</p>
                <p className="mt-1.5 text-[12px] text-[#8593ac]">{stat.label}</p>
              </div>
            ))}
          </div>

          {scoredSignals.length > 0 ? (
            <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#5f6f89]">Hot • Warm • Cold intelligence</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-[16px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3">
                  <p className="text-[1.6rem] font-semibold leading-none text-[#102246]">{avgIntentScore}</p>
                  <p className="mt-1.5 text-[12px] text-[#8593ac]">Avg intent score (0–100)</p>
                </div>
                <div className="rounded-[16px] border border-[#cce7d6] bg-[#f1fbf5] px-4 py-3">
                  <p className="text-[1.6rem] font-semibold leading-none text-[#2b9b60]">{hotSignals.length}</p>
                  <p className="mt-1.5 text-[12px] text-[#5c8a72]">Hot — 80–100</p>
                </div>
                <div className="rounded-[16px] border border-[#ffe9d0] bg-[#fff8ee] px-4 py-3">
                  <p className="text-[1.6rem] font-semibold leading-none text-[#c07c1f]">{warmSignals.length}</p>
                  <p className="mt-1.5 text-[12px] text-[#a1885f]">Warm — 50–79</p>
                </div>
                <div className="rounded-[16px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3">
                  <p className="text-[1.6rem] font-semibold leading-none text-[#748096]">{coldSignals.length}</p>
                  <p className="mt-1.5 text-[12px] text-[#8593ac]">Cold — below 50</p>
                </div>
              </div>
              <p className="mt-4 rounded-[12px] bg-[#eef1ff] px-4 py-2.5 text-[13px] font-medium text-[#3046b2]">
                {aiRecommendedCount} AI-recommended lead{aiRecommendedCount === 1 ? "" : "s"} — Hot-tier signal
                {aiRecommendedCount === 1 ? "" : "s"} not yet matched or converted to a lead.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="overflow-hidden rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e7edf5] bg-[linear-gradient(90deg,#2a3d8f_0%,#5a3fa8_100%)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-white/15">
              <SparklesIcon className="size-4 text-white" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-white">Signals assistant</p>
              <p className="text-[12px] text-white/70">
                Grounded in {signals.length} captured signal{signals.length === 1 ? "" : "s"} — won't invent companies or news
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
              chatEnabled ? "bg-[#2b9b60] text-white" : "bg-white/15 text-white/85"
            }`}
          >
            <span className={`size-1.5 rounded-full ${chatEnabled ? "bg-white" : "bg-white/60"}`} />
            {chatEnabled ? "Online — AI answers" : "Offline — keyword search only"}
          </span>
        </div>

        <div className="max-h-[360px] space-y-3 overflow-y-auto bg-[#f8faff] p-4">
          {chatMessages.length === 0 ? (
            <ChatBubble role="assistant">
              {chatEnabled
                ? `Hi! Ask me anything about the ${signals.length} captured signal${signals.length === 1 ? "" : "s"} — e.g. "any renewable energy funding signals?" or "summarize the most relevant one."`
                : `No AI provider connected yet, so I can't truly understand questions — but ask me anything and I'll keyword-search the ${signals.length} captured signal${signals.length === 1 ? "" : "s"} for you. Connect ANTHROPIC_API_KEY (see "Data sources" below) for real AI answers.`}
            </ChatBubble>
          ) : null}

          {chatMessages.map((message, index) => (
            <ChatBubble key={index} role={message.role} isError={message.isError} isFallback={message.isFallback}>
              {message.content}
            </ChatBubble>
          ))}
          {chatLoading ? <ChatBubble role="assistant" typing /> : null}
        </div>

        <div className="flex gap-3 border-t border-[#e7edf5] bg-white p-4">
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSendChat();
              }
            }}
            placeholder="Ask a question about the captured signals…"
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
          />
          <ActionButton label={chatLoading ? "Asking…" : "Ask"} icon={SendIcon} primary onClick={handleSendChat} disabled={chatLoading} />
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-semibold text-[#102246]">Captured signals</h2>
            <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
              {filteredSignals.length}{filteredSignals.length !== signals.length ? ` of ${signals.length}` : ""}
            </span>
          </div>
          {signals.length > 0 ? (
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search captured headlines…"
              className="w-full max-w-[280px] rounded-[10px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[13px] text-[#102246] outline-none focus:border-[#3046b2]"
            />
          ) : null}
        </div>

        {filteredSignals.length > 0 ? (
          <div className="mt-5 space-y-3">
            {filteredSignals.map((signal) => {
              const hasAiData = Boolean(signal.entityName);
              const typeConfig = signalTypeConfig[signal.signalType] ?? null;
              return (
                <div key={signal.id} className="rounded-[16px] border border-[#e7edf5] px-4 py-4 transition hover:border-[#c6d2e6]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[13px] font-semibold text-[#4766cc]">
                        {initialsFor(signal.entityName ?? signal.rawTitle)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold text-[#102246]">{signal.entityName ?? "Not yet identified"}</p>
                          {typeConfig ? (
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeConfig.tone}`}>{typeConfig.label}</span>
                          ) : null}
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${signalStatusToneClass[signal.status]}`}>
                            {signal.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] text-[#8593ac]">
                          {signal.sourceUrl ? (
                            <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-[#3046b2] hover:underline">
                              {signal.rawTitle}
                            </a>
                          ) : (
                            signal.rawTitle
                          )}
                        </p>
                        {hasAiData && signal.aiSummary ? (
                          <p className="mt-2.5 text-[14px] leading-6 text-[#435471]">{signal.aiSummary}</p>
                        ) : null}
                      </div>
                    </div>

                    {signal.relevanceScore != null ? (
                      <div className="w-[110px] shrink-0 text-right">
                        <p className="text-[18px] font-semibold leading-none text-[#102246]">{signal.relevanceScore}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-[#edf2f7]">
                          <div
                            className={`h-1.5 rounded-full ${relevanceBarTone(signal.relevanceScore)}`}
                            style={{ width: `${signal.relevanceScore}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#9aa6ba]">Relevance</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#f0f3f9] pt-3 text-[12px] text-[#8593ac]">
                    <span>{signalSourceLabel[signal.source] ?? signal.source}</span>
                    <span>{signal.rawPublishedAt ? new Date(signal.rawPublishedAt).toLocaleDateString() : "No date"}</span>
                    {signal.matchedLeadId ? <span className="font-medium text-[#2b9b60]">Matched to an existing lead</span> : null}
                    {signal.createdLeadId ? <span className="font-medium text-[#2b9b60]">New lead created</span> : null}
                    {signal.sourceUrl ? (
                      <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-[#3046b2] hover:underline">
                        View article ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[#9aa6ba]">
            {signals.length > 0
              ? `No captured headlines match "${searchText}".`
              : "No signals captured yet — either the backend's unreachable, or a data source needs configuring below."}
          </p>
        )}
      </div>

      <div className="rounded-[18px] border border-[#e7edf5] bg-[#f8faff] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <RadarIcon className="size-4 text-[#8853d0]" />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5f6f89]">Data sources (technical)</h2>
          </div>
          <ActionButton label={running ? "Running…" : "Run pipeline now"} icon={SendIcon} onClick={handleRunPipeline} />
        </div>

        {status ? (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            {services.map((service) => (
              <div key={service.key} className="rounded-[12px] border border-[#e7edf5] bg-white px-3 py-2.5">
                <p className="text-[12px] font-medium text-[#334463]">{service.label}</p>
                <span
                  className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    status[service.key] ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#94a0b3]"
                  }`}
                >
                  {status[service.key] ? "Connected" : "Not configured"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-[#9aa6ba]">No status available — backend unreachable.</p>
        )}

        <p className="mt-3 text-[12px] text-[#8593ac]">{notice}</p>
      </div>
    </div>
  );
}
