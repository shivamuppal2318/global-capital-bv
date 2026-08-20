import { useEffect, useState } from "react";
import { ActionButton, Field } from "../ui.jsx";
import { NoteIcon, PlusIcon, PencilIcon, SearchIcon, TagIcon } from "../Icons.jsx";
import { emailTemplatesApi } from "../../lib/emailTemplatesApi.js";
import { RichTextEditor } from "./RichTextEditor.jsx";

// The auto-responder maps a classified reply straight to one of these 4
// keys (see server/src/lib/autoRespond.js) — deleting one would silently
// break auto-sending for that reply type, so the backend refuses (409) and
// this mirrors that same set client-side to hide the Delete button for them
// before the user hits that error at all.
const PROTECTED_TEMPLATE_KEYS = new Set(["interested", "zoom-request", "info-request", "no-reply"]);
const BLANK_TEMPLATE_FORM = { key: "", subject: "", html: "" };

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Starting point when editing an older template saved before the rich
// editor existed (html is null, only the plain-text body was ever set) —
// same paragraph-splitting convention as the server's own
// wrapPlainTextAsHtml (src/lib/renderTemplate.js), just without the
// branded email-shell wrapper since that's only added at send time.
function plainTextToHtml(text) {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

// The backend still keeps a plain-text `body` alongside `html` — used as
// the plain-text MIME part of a real send (some mail clients and spam
// filters only look at that part), so it has to stay in sync with whatever
// the rich editor produces rather than going stale.
function htmlToPlainText(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  container.querySelectorAll("p, div, li").forEach((el) => el.append("\n"));
  return container.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

// Real Template CRUD for the email cold-outreach domain — create/edit/
// delete/preview, all backed by the real EmailTemplate table. Editing one
// of the 4 protected keys is how the reply-based sends in the Leads tab
// (EmailOutreachModule) get their content.
export function EmailTemplatesCadencesModule() {
  const [backendTemplates, setBackendTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(BLANK_TEMPLATE_FORM);
  // null = creating a brand-new template (key is editable); a string = the
  // key of the template currently loaded into the form for editing (key
  // field is locked — PUT upserts by key, so changing it here would edit a
  // different row than the one the user clicked).
  const [editingKey, setEditingKey] = useState(null);
  const [notice, setNotice] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);

  function loadTemplates() {
    emailTemplatesApi
      .list()
      .then((templates) => {
        setBackendTemplates(templates);
        setLoadError(null);
      })
      .catch((error) => setLoadError(error.message));
  }

  useEffect(loadTemplates, []);

  function handleFormChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleNewTemplate() {
    setEditingKey(null);
    setForm(BLANK_TEMPLATE_FORM);
    setPreviewHtml(null);
    setNotice(null);
  }

  function handleEditTemplate(template) {
    setEditingKey(template.key);
    setForm({ key: template.key, subject: template.subject, html: template.html ?? plainTextToHtml(template.body) });
    setPreviewHtml(null);
    setNotice(null);
  }

  async function handleSaveTemplate() {
    const key = editingKey ?? form.key.trim();
    const plainTextBody = htmlToPlainText(form.html);
    if (!key || !form.subject.trim() || !plainTextBody) {
      setNotice("Fill in a key, subject, and body before saving.");
      return;
    }
    try {
      await emailTemplatesApi.save(key, { subject: form.subject, body: plainTextBody, html: form.html });
      setNotice(`Template "${key}" saved to the backend.`);
      setEditingKey(key);
      setForm((current) => ({ ...current, key }));
      loadTemplates();
    } catch (error) {
      setNotice(`Could not save "${key}" — backend unreachable (${error.message}).`);
    }
  }

  async function handleDeleteTemplate(key) {
    try {
      await emailTemplatesApi.remove(key);
      setNotice(`Template "${key}" deleted.`);
      if (editingKey === key) {
        handleNewTemplate();
      }
      loadTemplates();
    } catch (error) {
      setNotice(`Could not delete "${key}" (${error.message}).`);
    }
  }

  async function handlePreviewTemplate(key) {
    try {
      const rendered = await emailTemplatesApi.preview(key);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setNotice(`Could not load a preview for "${key}" (${error.message}). Save it first — preview renders the saved version.`);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="max-w-3xl">
          <h1 className="text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Templates & Cadences</h1>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <NoteIcon className="size-5 text-[#ff9e1a]" />
              <h2 className="text-[16px] font-semibold text-[#102246]">Template library</h2>
            </div>
            <div className="flex items-center gap-3">
              {backendTemplates ? (
                <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Live from backend</span>
              ) : null}
              <ActionButton label="New template" icon={PlusIcon} primary onClick={handleNewTemplate} />
            </div>
          </div>

          {backendTemplates ? (
            <div className="mt-5 space-y-2.5">
              {backendTemplates.map((template) => {
                const isSelected = editingKey === template.key;
                return (
                  <div
                    key={template.key}
                    className={`flex items-center justify-between gap-4 rounded-[16px] border px-4 py-3.5 transition ${
                      isSelected ? "border-[#3046b2] bg-[#f2f5ff] shadow-[0_2px_10px_rgba(48,70,178,0.08)]" : "border-[#e7edf5] bg-white hover:border-[#c6d2e6]"
                    }`}
                  >
                    <button type="button" onClick={() => handleEditTemplate(template)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-[#102246]">{template.subject}</p>
                        <span className="shrink-0 rounded-full bg-[#edf2f7] px-2 py-0.5 text-[11px] font-semibold text-[#5f6f89]">{template.key}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#8593ac]">
                        {template.html ? "Custom HTML" : "Auto-generated HTML"} · Updated {new Date(template.updatedAt).toLocaleDateString()}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => handleEditTemplate(template)}
                        className="grid size-8 place-items-center rounded-[10px] text-[#5f6f89] transition hover:bg-[#eef1ff] hover:text-[#3046b2]"
                      >
                        <PencilIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Preview"
                        aria-label="Preview"
                        onClick={() => handlePreviewTemplate(template.key)}
                        className="grid size-8 place-items-center rounded-[10px] text-[#5f6f89] transition hover:bg-[#eef1ff] hover:text-[#3046b2]"
                      >
                        <SearchIcon className="size-4" />
                      </button>
                      {PROTECTED_TEMPLATE_KEYS.has(template.key) ? (
                        <span
                          title="Used by the auto-responder — can't be deleted"
                          aria-label="Delete unavailable — used by the auto-responder"
                          className="grid size-8 place-items-center text-[#c7cedb]"
                        >
                          <TagIcon className="size-4" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => handleDeleteTemplate(template.key)}
                          className="grid size-8 place-items-center rounded-[10px] text-[#c94b6b] transition hover:bg-[#fdecf1] hover:text-[#a13a56]"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[#9aa6ba]">
              {loadError ? `Backend unreachable (${loadError}) — this page needs the API running to show anything real.` : "Loading…"}
            </p>
          )}

          {previewHtml ? (
            <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">
                  Preview — rendered with sample data, exactly as a real send would look
                </p>
                <button type="button" onClick={() => setPreviewHtml(null)} className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]">
                  Close
                </button>
              </div>
              <iframe title="Template preview" srcDoc={previewHtml} sandbox="" className="mt-3 h-[360px] w-full rounded-[12px] border border-[#d6deea]" />
            </div>
          ) : null}
        </div>

        <div className="h-fit rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center gap-3 border-b border-[#e7edf5] px-5 py-4">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${editingKey ? "bg-[#eef1ff] text-[#3046b2]" : "bg-[#dff5e7] text-[#2b9b60]"}`}>
              {editingKey ? <PencilIcon className="size-4" /> : <PlusIcon className="size-4" />}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-[#102246]">{editingKey ? `Editing "${editingKey}"` : "New template"}</h2>
              <p className="mt-0.5 text-[12px] text-[#8593ac]">
                {editingKey ? "Saving upserts this key on the backend." : "Creates a new Template row."}
              </p>
            </div>
          </div>

          <div className="px-5 py-5">
            {!editingKey ? (
              <p className="mb-4 rounded-[12px] bg-[#f8faff] px-3 py-2.5 text-[12px] leading-5 text-[#5f6f89]">
                Reply-type auto-sends only look for these 4 keys: <span className="font-semibold text-[#102246]">{[...PROTECTED_TEMPLATE_KEYS].join(", ")}</span>. A
                custom key won't be auto-sent unless code elsewhere references it.
              </p>
            ) : null}

            <div className="space-y-4">
              <Field label="Key">
                <input
                  value={editingKey ?? form.key}
                  onChange={(event) => handleFormChange("key", event.target.value)}
                  disabled={Boolean(editingKey)}
                  placeholder="e.g. holiday-follow-up"
                  className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none focus:border-[#3046b2] disabled:text-[#9aa6ba]"
                />
              </Field>
              <Field label="Subject">
                <input
                  value={form.subject}
                  onChange={(event) => handleFormChange("subject", event.target.value)}
                  className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none focus:border-[#3046b2]"
                />
              </Field>
              <Field label="Body">
                <RichTextEditor
                  value={form.html}
                  onChange={(html) => handleFormChange("html", html)}
                  placeholder="Merge fields: {{leadName}}, {{company}}, {{unsubscribeUrl}}, {{ndaSignUrl}}"
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 border-t border-[#e7edf5] pt-5">
              <ActionButton label={editingKey ? "Save changes" : "Create template"} icon={TagIcon} primary onClick={handleSaveTemplate} />
              {editingKey ? <ActionButton label="New template" icon={PlusIcon} onClick={handleNewTemplate} /> : null}
            </div>

            {notice ? (
              <div className="mt-4 rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-3">
                <p className="text-[13px] font-medium leading-5 text-[#102246]">{notice}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
