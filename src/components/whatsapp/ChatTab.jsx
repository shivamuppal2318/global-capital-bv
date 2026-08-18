import { useState } from "react";
import { SearchIcon, SendIcon, TagIcon, UserCheckIcon } from "../Icons";
import { Badge, Card } from "../ui";
import { chatData } from "../../data/whatsappData";

const avatarToneClass = {
  blue: "bg-[#dff1ff] text-[#2f96da]",
  amber: "bg-[#ffe6cc] text-[#f29b3a]",
  green: "bg-[#dff5e7] text-[#2a9c60]",
  violet: "bg-[#efe5ff] text-[#8b52d0]",
  sky: "bg-[#def1ff] text-[#2b94da]"
};

export function ChatTab() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeConversation, setActiveConversation] = useState(chatData.conversations[0].name);
  const contact = chatData.conversations.find((c) => c.name === activeConversation) ?? chatData.conversations[0];

  return (
    <section className="grid gap-4 xl:grid-cols-[300px_1fr_260px]">
      <Card>
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <div className="flex items-center gap-2 rounded-full border border-[#d6deea] bg-[#f7f9fc] px-3 py-2">
            <SearchIcon className="size-4 text-[#8592ab]" />
            <input
              type="text"
              placeholder="Search conversations"
              className="w-full bg-transparent text-[14px] text-[#102246] outline-none placeholder:text-[#8592ab]"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chatData.filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  filter === activeFilter ? "bg-[#3046b2] text-white" : "bg-[#edf2f7] text-[#5f6f89] hover:bg-[#e2e9f3]"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {chatData.conversations.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setActiveConversation(item.name)}
              className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                item.name === activeConversation ? "bg-[#f5f8fd]" : ""
              }`}
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${avatarToneClass[item.tone]}`}
              >
                {item.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[15px] font-semibold text-[#102246]">{item.name}</p>
                  <span className="text-[12px] text-[#6a7790]">{item.time}</span>
                </div>
                <p className="mt-1 truncate text-[14px] text-[#5f6f89]">{item.preview}</p>
              </div>
              {item.unread ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#2fa84f] px-1 text-[11px] font-semibold text-white">
                  {item.unread}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-full bg-[#e6f6eb] text-[#2b9b60]">
              <span className="size-3 rounded-full border-2 border-current" />
            </div>
            <div>
              <p className="text-[18px] font-semibold text-[#102246]">{contact.name}</p>
              <p className="text-[14px] text-[#5f6f89]">
                {contact.company} · {chatData.activeContact.phone}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4">
          {chatData.messages.map(([side, text, time]) => (
            <div key={`${time}-${text}`} className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-[18px] px-4 py-3 text-[15px] leading-6 shadow-sm ${
                  side === "right" ? "bg-[#dff1e4] text-[#102246]" : "bg-[#edf1f7] text-[#102246]"
                }`}
              >
                <p>{text}</p>
                <p className="mt-2 text-right text-[12px] text-[#6a7790]">{time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#e7edf5] px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {chatData.quickReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                className="rounded-full border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3046b2] hover:bg-[#f4f7fb]"
              >
                {reply}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 rounded-full border border-[#d6deea] bg-[#f7f9fc] px-4 py-3">
            <input
              type="text"
              placeholder="Reply within the 24h service window..."
              className="w-full bg-transparent text-[15px] text-[#102246] outline-none placeholder:text-[#7e8aa1]"
            />
            <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3046b2] text-white">
              <SendIcon className="size-4" />
            </button>
          </div>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Lead snapshot</p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Deal stage</p>
            <p className="mt-1 text-[15px] font-medium text-[#102246]">{chatData.activeContact.stage}</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Owner</p>
            <p className="mt-1 text-[15px] font-medium text-[#102246]">{chatData.activeContact.owner}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge tone="green">In 24h window</Badge>
          <Badge tone="blue">WhatsApp verified</Badge>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[#d6deea] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#102246] hover:bg-[#f7f9fc]"
          >
            <UserCheckIcon className="size-4" /> Open CRM record
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[#d6deea] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#102246] hover:bg-[#f7f9fc]"
          >
            <TagIcon className="size-4" /> Add tag
          </button>
        </div>
      </Card>
    </section>
  );
}
