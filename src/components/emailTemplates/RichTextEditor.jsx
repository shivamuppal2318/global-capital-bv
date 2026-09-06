import { useEffect, useRef, useState } from "react";
import { BoldIcon, ItalicIcon, UnderlineIcon, ListIcon, LinkIcon, ImageIcon, LogOutIcon } from "../Icons.jsx";

const toolbarButtons = [
  { command: "bold", icon: BoldIcon, label: "Bold" },
  { command: "italic", icon: ItalicIcon, label: "Italic" },
  { command: "underline", icon: UnderlineIcon, label: "Underline" },
  { command: "insertUnorderedList", icon: ListIcon, label: "Bullet list" }
];

// A minimal WYSIWYG editor for template bodies (bold/italic/underline/
// lists/links/images) — built on the browser's own contentEditable +
// execCommand rather than pulling in a rich-text-editor dependency for what
// is, functionally, six buttons. Deliberately uncontrolled: React only
// pushes `value` into the DOM when it changes identity (e.g. switching
// which template is loaded), never on every keystroke — a fully-controlled
// contentEditable re-renders on each input and resets the cursor to the
// start, which makes typing unusable.
export function RichTextEditor({ value, onChange, placeholder, unsubscribeLinkTag }) {
  const editorRef = useRef(null);
  // Seeded to a value no real `value` prop can equal (not "") so the very
  // first effect run always writes into the DOM — a freshly mounted
  // contentEditable div starts genuinely empty, regardless of what `value`
  // already holds (e.g. opening a template that has real saved body text).
  const lastEmittedValue = useRef(null);
  const [htmlMode, setHtmlMode] = useState(false);

  useEffect(() => {
    if (editorRef.current && value !== lastEmittedValue.current) {
      editorRef.current.innerHTML = value;
      lastEmittedValue.current = value;
    }
  }, [value]);

  function emitChange() {
    const html = editorRef.current?.innerHTML ?? "";
    lastEmittedValue.current = html;
    onChange(html);
  }

  function runCommand(command, arg) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  }

  function handleInsertLink() {
    const url = window.prompt("Link URL (e.g. https://calendly.com/...)");
    if (url) {
      runCommand("createLink", url);
    }
  }

  // One click, no typing — the exact mistake this replaces really happened
  // in production: someone selected the word "unsubscribe" and used the
  // regular Insert Link button, but typed the visible word itself into the
  // URL prompt instead of the merge tag, producing a dead <a href="unsubscribe">
  // link (the real unsubscribe still worked because the backend appends a
  // fallback footer link when it can't find a real one — but a dead link
  // sitting right next to a working one looks broken to a recipient).
  // Wraps the current selection if there is one; otherwise inserts fresh
  // linked text at the cursor.
  function handleInsertUnsubscribeLink() {
    if (!unsubscribeLinkTag) return;
    editorRef.current?.focus();
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && editorRef.current?.contains(selection.anchorNode);
    if (hasSelection) {
      document.execCommand("createLink", false, unsubscribeLinkTag);
    } else {
      document.execCommand("insertHTML", false, `<a href="${unsubscribeLinkTag}">Unsubscribe</a>`);
    }
    emitChange();
  }

  function handleInsertImage() {
    const url = window.prompt("Image URL — paste a link to an already-hosted image (e.g. your logo or a CDN link).");
    if (url) {
      runCommand("insertImage", url);
    }
  }

  function handleHtmlTextareaChange(nextValue) {
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  }

  return (
    <div className="rounded-[14px] border border-[#d6deea] bg-[#f8faff] focus-within:border-[#3046b2]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#e1e7f0] px-2 py-1.5">
        <span className="px-2 text-[12px] text-[#5f6f89]">Normal</span>
        <span className="mx-1 h-4 w-px bg-[#d6deea]" />
        {toolbarButtons.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            disabled={htmlMode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(command)}
            className="grid size-7 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon className="size-4" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#d6deea]" />
        <button
          type="button"
          title="Insert link"
          aria-label="Insert link"
          disabled={htmlMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleInsertLink}
          className="grid size-7 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <LinkIcon className="size-4" />
        </button>
        {unsubscribeLinkTag ? (
          <button
            type="button"
            title="Insert unsubscribe link (select text first, or inserts fresh)"
            aria-label="Insert unsubscribe link"
            disabled={htmlMode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleInsertUnsubscribeLink}
            className="grid size-7 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <LogOutIcon className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          title="Insert image"
          aria-label="Insert image"
          disabled={htmlMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleInsertImage}
          className="grid size-7 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ImageIcon className="size-4" />
          </button>
        <span className="mx-1 h-4 w-px bg-[#d6deea]" />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setHtmlMode((current) => !current)}
          className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold transition ${
            htmlMode ? "bg-white text-[#3046b2]" : "text-[#5f6f89] hover:bg-white hover:text-[#3046b2]"
          }`}
        >
          HTML
        </button>
      </div>
      {htmlMode ? (
        <textarea
          value={value}
          onChange={(event) => handleHtmlTextareaChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-[220px] w-full resize-y bg-white px-4 py-3 font-mono text-[13px] leading-6 text-[#435471] outline-none"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          data-placeholder={placeholder}
          className="min-h-[220px] px-4 py-3 text-[14px] leading-6 text-[#435471] outline-none empty:before:text-[#9aa6ba] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#3046b2] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_ul]:list-disc [&_ul]:pl-5"
        />
      )}
    </div>
  );
}
