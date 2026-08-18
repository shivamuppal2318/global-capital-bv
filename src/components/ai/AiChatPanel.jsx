import { useEffect, useRef, useState } from "react";
import { SendIcon, SparklesIcon, XIcon } from "../Icons";
import { sendChatMessage } from "../../lib/aiApi";

const GREETING = {
  role: "assistant",
  content:
    "Hi! I have live access to your leads, WhatsApp conversations, templates, campaigns and team data. Ask me anything about the business."
};

const SUGGESTIONS = [
  "How many leads do we have, and which are qualified?",
  "What stage is Deepa Paul in?",
  "Summarize this week's WhatsApp activity",
  "Which leads have no owner assigned?"
];

export function AiChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const handleSend = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const history = messages
      .filter((m) => m !== GREETING)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);
    try {
      const reply = await sendChatMessage(content, history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Couldn't reach the AI backend — is it running at localhost:4000? (${err.message})` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-[#3046b2] text-white shadow-[0_8px_24px_rgba(48,70,178,0.4)] transition hover:bg-[#28399190]"
        >
          <SparklesIcon className="size-6" />
        </button>
      ) : null}

      <div
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col border-l border-[#d6deea] bg-white shadow-[-8px_0_32px_rgba(15,32,66,0.12)] transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#e7edf5] bg-[#f7f9fc] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-[#3046b2] text-white">
              <SparklesIcon className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-[#102246]">AI Assistant</p>
              <p className="text-[12px] text-[#6a7790]">Full access to your business data</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid size-8 place-items-center rounded-full text-[#5f6f89] hover:bg-[#edf2f7]"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.map((m, index) => (
            <div key={index} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[14px] leading-6 ${
                  m.role === "user" ? "bg-[#3046b2] text-white" : "bg-[#f0f3f9] text-[#12213a]"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-[16px] bg-[#f0f3f9] px-4 py-3 text-[14px] text-[#8592ab]">Thinking…</div>
            </div>
          ) : null}

          {messages.length === 1 ? (
            <div className="space-y-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="block w-full rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-left text-[13px] text-[#334463] hover:bg-[#f4f7fb]"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#e7edf5] px-4 py-3">
          <div className="flex items-end gap-2 rounded-[16px] border border-[#d6deea] bg-[#f7f9fc] px-3 py-2">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about leads, deals, WhatsApp activity…"
              className="max-h-24 w-full resize-none bg-transparent text-[14px] text-[#102246] outline-none placeholder:text-[#8592ab]"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3046b2] text-white disabled:opacity-40"
            >
              <SendIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
