import { useEffect, useRef, useState } from "react";
import { BoldIcon, ItalicIcon, UnderlineIcon, ListIcon, LinkIcon, ImageIcon, LogOutIcon } from "../Icons.jsx";

const toolbarButtons = [
  { command: "bold", icon: BoldIcon, label: "Bold" },
  { command: "italic", icon: ItalicIcon, label: "Italic" },
  { command: "underline", icon: UnderlineIcon, label: "Underline" },
  { command: "insertUnorderedList", icon: ListIcon, label: "Bullet list" }
];

function insertPlainTextAtSelection(text) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return false;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function placeCursorAtEnd(element) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isPlainTextKey(event) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

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
  // Whether bold/italic/underline is active because the user actually
  // clicked that toolbar button — as opposed to Chrome's own contentEditable
  // spontaneously reporting the state active on a brand-new, empty editor
  // with nothing clicked (confirmed live: typing into a fresh template body
  // came out as a stray <b>kk</b>, toolbar Bold button lit up, despite never
  // being pressed). Only formatting the user actually chose should survive
  // the phantom-formatting cleanup below.
  const formatActiveByChoice = useRef({ bold: false, italic: false, underline: false });

  useEffect(() => {
    if (editorRef.current && value !== lastEmittedValue.current) {
      editorRef.current.innerHTML = value;
      lastEmittedValue.current = value;
      if (!value) {
        formatActiveByChoice.current = { bold: false, italic: false, underline: false };
      }
    }
  }, [value]);

  function tagToFormatCommand(tagName) {
    if (tagName === "B" || tagName === "STRONG") return "bold";
    if (tagName === "I" || tagName === "EM") return "italic";
    if (tagName === "U") return "underline";
    return null;
  }

  // Chrome (and evidently Chromium generally) can wrap the very first text
  // typed into an empty contentEditable in a stray formatting element that
  // nothing asked for. Unwraps a lone top-level <b>/<i>/<u> (optionally one
  // block element deep, if the browser also added a wrapping <div>/<p>) as
  // long as `formatActiveByChoice` says the user never actually turned that
  // formatting on themselves.
  function stripPhantomFormatting() {
    const editor = editorRef.current;
    if (!editor || editor.childNodes.length !== 1) return;
    let node = editor.firstChild;
    if ((node.nodeName === "DIV" || node.nodeName === "P") && node.childNodes.length === 1) {
      node = node.firstChild;
    }
    const command = tagToFormatCommand(node.nodeName);
    if (!command || formatActiveByChoice.current[command]) return;

    const selection = window.getSelection();
    const wasFocused = document.activeElement === editor;
    const text = document.createTextNode(node.textContent ?? "");
    node.parentNode.replaceChild(text, node);

    if (wasFocused && selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function emitChange() {
    stripPhantomFormatting();
    const html = editorRef.current?.innerHTML ?? "";
    lastEmittedValue.current = html;
    onChange(html);
  }

  function handleBeforeInput(event) {
    if (!editorRef.current || htmlMode || event.inputType !== "insertText" || !event.data) return;
    if (formatActiveByChoice.current.bold || formatActiveByChoice.current.italic || formatActiveByChoice.current.underline) return;
    event.preventDefault();
    resetEmptyEditorToNormal();
    if (insertPlainTextAtSelection(event.data)) {
      emitChange();
    }
  }

  function handleKeyDown(event) {
    if (!editorRef.current || htmlMode || !isPlainTextKey(event)) return;
    if (formatActiveByChoice.current.bold || formatActiveByChoice.current.italic || formatActiveByChoice.current.underline) return;
    event.preventDefault();
    resetEmptyEditorToNormal();
    if (insertPlainTextAtSelection(event.key)) {
      emitChange();
    }
  }

  function handlePaste(event) {
    if (!editorRef.current || htmlMode) return;
    if (formatActiveByChoice.current.bold || formatActiveByChoice.current.italic || formatActiveByChoice.current.underline) return;
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    resetEmptyEditorToNormal();
    if (insertPlainTextAtSelection(text)) {
      emitChange();
    }
  }

  function runCommand(command, arg) {
    editorRef.current?.focus();
    if (command in formatActiveByChoice.current) {
      formatActiveByChoice.current[command] = !formatActiveByChoice.current[command];
    }
    document.execCommand(command, false, arg);
    emitChange();
  }

  function resetToNormal() {
    editorRef.current?.focus();
    for (const command of ["bold", "italic", "underline"]) {
      if (document.queryCommandState(command)) {
        document.execCommand(command, false, null);
      }
    }
    formatActiveByChoice.current = { bold: false, italic: false, underline: false };
    emitChange();
  }

  function resetEmptyEditorToNormal() {
    const editor = editorRef.current;
    if (!editor || htmlMode) return;
    if (editor.textContent?.trim() || editor.querySelector("img,a,ul,ol")) return;

    editor.focus();
    for (const command of ["bold", "italic", "underline"]) {
      if (document.queryCommandState(command)) {
        document.execCommand(command, false, null);
      }
    }
    formatActiveByChoice.current = { bold: false, italic: false, underline: false };
    editor.innerHTML = "";
    lastEmittedValue.current = "";
    placeCursorAtEnd(editor);
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
    <div className="overflow-hidden rounded-[14px] border border-[#d6deea] bg-[#f4f7fc] focus-within:border-[#3046b2] focus-within:ring-1 focus-within:ring-[#3046b2]/20">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e1e7f0] px-3 py-2.5">
        <button
          type="button"
          disabled={htmlMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={resetToNormal}
          className="rounded-[8px] px-2 py-1 text-[12px] font-normal text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          Normal
        </button>
        <span className="mx-1 h-5 w-px bg-[#d6deea]" />
        {toolbarButtons.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            disabled={htmlMode}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(command)}
            className="grid size-8 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon className="size-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[#d6deea]" />
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
            className="grid size-8 place-items-center rounded-[8px] text-[#5f6f89] transition hover:bg-white hover:text-[#3046b2] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
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
        <span className="mx-1 h-5 w-px bg-[#d6deea]" />
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
          className="min-h-[320px] w-full resize-y bg-white px-5 py-4 font-mono text-[13px] leading-7 text-[#435471] outline-none"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={resetEmptyEditorToNormal}
          onClick={resetEmptyEditorToNormal}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onInput={emitChange}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className="min-h-[320px] bg-white px-5 py-4 text-[14.5px] font-normal leading-7 text-[#334463] outline-none empty:before:font-normal empty:before:text-[#9aa6ba] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#3046b2] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_p:last-child]:mb-0 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ fontWeight: 400 }}
        />
      )}
    </div>
  );
}
