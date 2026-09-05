import { useEffect, useState } from "react";
import { SearchIcon } from "../Icons.jsx";
import { emailTemplatesApi } from "../../lib/emailTemplatesApi.js";
import { RichTextEditor } from "./RichTextEditor.jsx";

const BLANK_TEMPLATE_FORM = { key: "", subject: "", html: "" };

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainTextToHtml(text) {
  return text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

function htmlToPlainText(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  container.querySelectorAll("p, div, li").forEach((el) => el.append("\n"));
  return container.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

export function EmailTemplatesCadencesModule() {
  const [backendTemplates, setBackendTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(BLANK_TEMPLATE_FORM);
  const [editingKey, setEditingKey] = useState(null);
  const [notice, setNotice] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [searchText, setSearchText] = useState("");
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
    setNotice(null);
    setPreviewHtml(null);
    setViewMode("form");
  }

  function handleEditTemplate(template) {
    setEditingKey(template.key);
    setForm({ key: template.key, subject: template.subject, html: template.html ?? plainTextToHtml(template.body) });
    setNotice(null);
    setPreviewHtml(null);
    setViewMode("form");
  }

  // Renders the SAVED backend version, including the "I'm Interested"
  // button every real send of this template appends (see leadSender.js's
  // sendTemplateEmail) — not whatever's currently typed but unsaved, so
  // Save first if this doesn't reflect the latest edits.
  async function handlePreviewTemplate() {
    if (!editingKey) {
      setNotice("Save this template first — there's nothing on the backend yet to preview.");
      return;
    }
    try {
      const rendered = await emailTemplatesApi.preview(editingKey);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setNotice(`Could not load a preview for "${editingKey}" (${error.message}).`);
    }
  }

  async function handleSaveTemplate() {
    const key = editingKey ?? (form.key.trim() || form.subject.trim().toLowerCase().replace(/\s+/g, "-"));
    const plainTextBody = htmlToPlainText(form.html);
    if (!key || !form.subject.trim() || !plainTextBody) {
      setNotice("Fill in template name, subject, and body before saving.");
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

  const filteredTemplates = (backendTemplates ?? []).filter((template) => {
    const haystack = `${template.key} ${template.subject}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

  if (viewMode === "form") {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#435471] shadow-[0_2px_8px_rgba(30,48,87,0.04)]"
          >
            <span aria-hidden="true">←</span>
            Back to templates
          </button>
        </div>

        <div className="mx-auto w-full max-w-[1110px] rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="-mx-4 -mt-4 rounded-t-[24px] border-b border-[#e7edf5] px-4 py-4">
            <h2 className="text-[17px] font-semibold text-[#222347]">{editingKey ? "Edit Template" : "New Template"}</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Template Name</p>
              <input
                value={editingKey ?? form.key}
                onChange={(event) => handleFormChange("key", event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
              />
            </label>

            <label className="block">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Subject</p>
              <input
                value={form.subject}
                onChange={(event) => handleFormChange("subject", event.target.value)}
                className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
              />
            </label>

            <label className="block">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">Email Content</p>
              <RichTextEditor
                value={form.html}
                onChange={(html) => handleFormChange("html", html)}
                placeholder="Compose the template body here. Merge fields like {{leadName}}, {{company}}, and {{unsubscribeUrl}} can be used."
              />
              <p className="mt-2 text-[11px] leading-4 text-[#8593ac]">
                Format with the toolbar, or click the HTML button to edit raw HTML. Merge tags: {"{{leadName}}"},
                {"{{firstName}}"}, {"{{company}}"}, {"{{unsubscribeUrl}}"}, {"{{ndaSignUrl}}"}
              </p>
            </label>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handlePreviewTemplate}
                className="rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#435471]"
              >
                Preview
              </button>
            </div>

            {notice ? <p className="text-[11px] leading-4 text-[#8593ac]">{notice}</p> : null}

            {previewHtml ? (
              <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">
                    Preview — rendered with sample data, exactly as a real send would look (includes the "I'm
                    Interested" button every send of this template carries)
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(null)}
                    className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                  >
                    Close
                  </button>
                </div>
                <iframe
                  title="Template preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  className="mt-3 h-[420px] w-full rounded-[12px] border border-[#d6deea]"
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[24px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNewTemplate}
              className="rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
            >
              New Template
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] text-[#6a7790]">25</div>
            <button
              type="button"
              className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[12px] font-medium text-[#6a7790]"
            >
              Export
            </button>
            <div className="flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#5f6f89]">
              <SearchIcon className="size-4" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search..."
                className="w-36 bg-transparent outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-4 py-3">Template Name</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backendTemplates && filteredTemplates.length ? (
                filteredTemplates.map((template) => (
                  <tr key={template.key} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                    <td className="px-4 py-3 font-medium text-[#102246]">{template.key}</td>
                    <td className="px-4 py-3">{template.subject}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleEditTemplate(template)}
                        className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-4 py-5 text-[13px] text-[#7a7d9c]">
                    {loadError ? `Backend unreachable (${loadError})` : "No entries found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {notice ? (
        <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
          <p className="mt-2 text-[15px] font-medium text-[#102246]">{notice}</p>
        </div>
      ) : null}
    </section>
  );
}
