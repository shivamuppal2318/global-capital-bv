export function ChatBubble({ role, children, isError, isFallback, typing }) {
  const isUser = role === "user";
  return (
    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[10px] font-bold text-[#3046b2]">AI</span>
      ) : null}
      <div
        className={`max-w-[80%] rounded-[14px] px-4 py-2.5 text-[14px] leading-6 whitespace-pre-line ${
          isUser ? "bg-[#3046b2] text-white" : isError ? "bg-[#ffe4ee] text-[#a13a56]" : "border border-[#e7edf5] bg-white text-[#102246]"
        }`}
      >
        {typing ? (
          <span className="inline-flex gap-1">
            <span className="size-1.5 animate-bounce rounded-full bg-[#9aa6ba] [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-[#9aa6ba] [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-[#9aa6ba]" />
          </span>
        ) : (
          <>
            {isFallback ? (
              <span className="mb-1.5 inline-flex rounded-full bg-[#edf2f7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#748096]">
                Keyword search
              </span>
            ) : null}
            <div>{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
