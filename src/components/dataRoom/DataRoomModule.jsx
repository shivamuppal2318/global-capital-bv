import { useCallback, useEffect, useRef, useState } from "react";
import { documentsApi } from "../../lib/documentsApi";
import { leadsApi } from "../../lib/leadsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import {
  AttachmentIcon,
  CheckCircleIcon,
  NoteIcon,
  SearchIcon,
  SparklesIcon,
  UploadIcon,
  XIcon
} from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const BASE_CATEGORY_PRESETS = ["General", "Financials", "Legal", "Pitch & Marketing", "Due Diligence", "Portfolio", "HR"];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileGlyph(mimeType, name) {
  const ext = (name.split(".").pop() ?? "").toUpperCase();
  if (mimeType?.startsWith("image/")) return { label: "IMG", tone: "bg-[#efe5ff] text-[#8853d0]" };
  if (mimeType === "application/pdf") return { label: "PDF", tone: "bg-[#ffe3e3] text-[#e0483f]" };
  if (ext === "DOCX" || ext === "DOC") return { label: "DOC", tone: "bg-[#dff2ff] text-[#2995db]" };
  if (["XLSX", "XLS", "CSV"].includes(ext)) return { label: "XLS", tone: "bg-[#dff5e7] text-[#2b9b60]" };
  return { label: ext.slice(0, 4) || "FILE", tone: "bg-[#edf1f6] text-[#748096]" };
}

// Only .docx has a real rendered preview (see documentsApi.previewHtml) —
// PDFs and images already render fine natively when opened as a blob, and
// old-format .doc has no parser in this app (mammoth only reads .docx).
function isPreviewableDocx(name) {
  return name.toLowerCase().endsWith(".docx");
}

// Mirrors the sandboxed srcDoc pattern already used for email template
// previews (see RepliesTab.jsx) — untrusted-ish rendered HTML stays inside
// an iframe with no script execution, rather than dangerouslySetInnerHTML
// straight into the page.
function DocumentPreviewModal({ doc, html, loading, error, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-[820px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e7edf5] px-6 py-5">
          <p className="truncate text-[16px] font-semibold text-[#102246]">{doc.originalName}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">
          {loading ? (
            <p className="text-[14px] text-[#8592ab]">Rendering preview…</p>
          ) : error ? (
            <p className="text-[14px] text-[#e0483f]">{error}</p>
          ) : (
            <iframe
              title={`Preview of ${doc.originalName}`}
              srcDoc={`<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px 4px;color:#1f2a44;line-height:1.6">${html}</div>`}
              sandbox=""
              className="h-[70vh] w-full rounded-[12px] border border-[#d6deea]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function DataRoomModule() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");

  // "" = the company-wide library (every document, exactly like before this
  // existed). Set to a lead's id to scope everything below to that one
  // deal's own Data Room instead — same picker convention as NdaModule.
  const [leads, setLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  useEffect(() => {
    leadsApi.list().then(setLeads).catch(() => {});
  }, []);
  const selectedLead = leads.find((l) => l.id === selectedLeadId) ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploadDescription, setUploadDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileInputRef = useRef(null);
  // Rendered .docx preview — separate from `handleOpen` below, which still
  // handles PDFs/images (the browser renders those natively as a blob).
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      documentsApi.list({ category: activeCategory, q: query, leadId: selectedLeadId || undefined }),
      documentsApi.categories(selectedLeadId || undefined)
    ])
      .then(([docs, cats]) => {
        setDocuments(docs);
        setCategories(cats);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeCategory, query, selectedLeadId]);

  // Debounced so typing in the search box doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    setNotice(null);

    const results = [];
    for (const file of files) {
      try {
        const doc = await documentsApi.upload(file, { category: uploadCategory, description: uploadDescription, leadId: selectedLeadId || undefined });
        results.push(doc);
      } catch (err) {
        setUploadError(`${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    setUploadDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (results.length) {
      const unreadable = results.filter((d) => !d.searchable);
      setNotice(
        unreadable.length === 0
          ? `Uploaded ${results.length} file(s) — the AI Assistant can now answer from them.`
          : `Uploaded ${results.length} file(s). ${unreadable.length} can't be read as text, so the AI can list them but not quote from them.`
      );
      load();
    }
  };

  const handleDelete = async (doc) => {
    try {
      await documentsApi.remove(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setNotice(`Deleted ${doc.originalName}.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpen = async (doc, download) => {
    // A .docx has no native browser renderer — opening it as a blob just
    // triggers a download prompt or shows raw XML instead of the document.
    // "Download" is unaffected: that path still fetches the real file.
    if (!download && isPreviewableDocx(doc.originalName)) {
      setPreviewDoc(doc);
      setPreviewHtml(null);
      setPreviewError(null);
      setPreviewLoading(true);
      try {
        const result = await documentsApi.previewHtml(doc.id);
        setPreviewHtml(result.html);
      } catch (err) {
        setPreviewError(err.message);
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    try {
      await documentsApi.open(doc, { download });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerify = async (doc) => {
    try {
      const updated = await documentsApi.verify(doc.id, !doc.verified);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) {
      setError(err.message);
    }
  };

  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const searchableCount = documents.filter((d) => d.searchable).length;

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e6ebff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          <AttachmentIcon className="size-4" />
          Data Room
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
          {selectedLead ? `${selectedLead.company}'s Data Room` : "Company documents"}
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          {selectedLead
            ? `Documents and checklist status for ${selectedLead.name} at ${selectedLead.company} — scoped to this deal only.`
            : "Contracts, reports, decks and images in one place. Text-based files are read on upload so the AI Assistant can answer questions from them and cite the file it used."}
        </p>

        <div className="mt-5 max-w-sm">
          <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Deal</label>
          <select
            className="w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
          >
            <option value="">Company library (all documents)</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.company}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard card={{ label: "Documents", value: String(total), note: "In the data room", noteTone: "blue" }} />
          <StatCard card={{ label: "Categories", value: String(categories.length), note: "In use", noteTone: "violet" }} />
          <StatCard
            card={{
              label: "AI-readable",
              value: `${searchableCount}/${documents.length}`,
              note: "Text extracted",
              noteTone: searchableCount === documents.length ? "green" : "amber"
            }}
          />
        </div>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle icon={UploadIcon} iconClass="text-[#3046b2]" subtitle="PDF, Word, text, CSV and images up to 25 MB each. Text is extracted automatically where the format allows.">
          Upload
        </SectionTitle>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Category</label>
            <input
              className={inputClass}
              list="data-room-categories"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              placeholder="General"
            />
            <datalist id="data-room-categories">
              {[...new Set([...BASE_CATEGORY_PRESETS, ...categories.map((c) => c.category)])].map(
                (c) => (
                  <option key={c} value={c} />
                )
              )}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>Description (optional)</label>
            <input
              className={inputClass}
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="What is this document?"
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles([...e.dataTransfer.files]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 cursor-pointer rounded-[16px] border-2 border-dashed px-6 py-9 text-center transition ${
            dragging ? "border-[#3046b2] bg-[#f4f7fd]" : "border-[#d6deea] hover:border-[#3046b2] hover:bg-[#f8faff]"
          }`}
        >
          <UploadIcon className="mx-auto size-6 text-[#3046b2]" />
          <p className="mt-2 text-[15px] font-medium text-[#102246]">
            {uploading ? "Uploading…" : "Drop files here, or click to choose"}
          </p>
          <p className="mt-1 text-[13px] text-[#8592ab]">You can select several at once.</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles([...e.target.files])}
          />
        </div>

        {uploadError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{uploadError}</p> : null}
        {notice ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[#2b9b60]">
            <CheckCircleIcon className="size-4" />
            {notice}
          </p>
        ) : null}
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={NoteIcon}
          iconClass="text-[#f29b3a]"
          subtitle="Search looks inside document text, not just filenames."
        >
          Documents
        </SectionTitle>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9aa6bd]" />
            <input
              className={`${inputClass} pl-10`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filenames, descriptions and contents"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...categories.map((c) => c.category)].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                activeCategory === cat ? "bg-[#3046b2] text-white" : "bg-[#eef1f7] text-[#4f6181] hover:bg-[#e2e8f2]"
              }`}
            >
              {cat}
              {cat !== "All" ? (
                <span className="ml-1.5 opacity-70">{categories.find((c) => c.category === cat)?.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-[14px] text-[#8592ab]">Loading…</p>
          ) : error ? (
            <p className="text-[14px] text-[#e0483f]">{error}</p>
          ) : documents.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#d6deea] px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-[#102246]">
                {query || activeCategory !== "All" ? "Nothing matches that filter." : "No documents yet."}
              </p>
              <p className="mt-1 text-[13px] text-[#8592ab]">
                {query || activeCategory !== "All"
                  ? "Try a different search or category."
                  : "Upload contracts, reports or decks above and the AI Assistant will be able to answer from them."}
              </p>
            </div>
          ) : (
            documents.map((doc) => {
              const glyph = fileGlyph(doc.mimeType, doc.originalName);
              return (
                <div key={doc.id} className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3 hover:bg-[#f8faff]">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-[12px] text-[11px] font-bold ${glyph.tone}`}>
                    {glyph.label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(doc, false)}
                        className="truncate text-[14px] font-medium text-[#102246] hover:text-[#3046b2] hover:underline"
                      >
                        {doc.originalName}
                      </button>
                      <Badge tone="slate">{doc.category}</Badge>
                      {!selectedLeadId ? (
                        doc.lead ? (
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(doc.lead.id)}
                            className="rounded-full bg-[#eef1ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#3046b2] hover:bg-[#e2e8ff]"
                            title={`Show only ${doc.lead.company}'s Data Room`}
                          >
                            {doc.lead.company}
                          </button>
                        ) : (
                          <Badge tone="slate">Company library</Badge>
                        )
                      ) : null}
                      {doc.searchable ? (
                        <Badge tone="green">AI-readable</Badge>
                      ) : (
                        <Badge tone="amber">Not searchable</Badge>
                      )}
                      {doc.verified ? <Badge tone="green">Verified</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-[#8592ab]">
                      {formatSize(doc.sizeBytes)}
                      {doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ""}
                      {` · ${new Date(doc.createdAt).toLocaleDateString()}`}
                      {doc.description ? ` · ${doc.description}` : ""}
                      {doc.verified && doc.verifiedBy ? ` · Verified by ${doc.verifiedBy.name}` : ""}
                    </p>
                    {!doc.searchable && doc.extractionNote ? (
                      <p className="mt-1 text-[12px] text-[#c47f1a]">{doc.extractionNote}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <ActionButton label="Open" small onClick={() => handleOpen(doc, false)} />
                    <ActionButton label="Download" small onClick={() => handleOpen(doc, true)} />
                    <ActionButton
                      label={doc.verified ? "Unverify" : "Verify"}
                      icon={CheckCircleIcon}
                      small
                      active={doc.verified}
                      onClick={() => handleVerify(doc)}
                    />
                    <ActionButton label="Delete" icon={XIcon} small onClick={() => handleDelete(doc)} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={SparklesIcon} iconClass="text-[#8b52d0]">
          Asking the AI about these documents
        </SectionTitle>
        <p className="mt-3 text-[14px] leading-7 text-[#4f6181]">
          Open the assistant (the button in the bottom-right) and ask something like{" "}
          <span className="font-medium text-[#102246]">"what does our Q3 report say about revenue?"</span>. It sees the full
          list of documents plus the contents of the few most relevant to your question, and names the file it used.
        </p>
        <p className="mt-3 rounded-[12px] bg-[#f7f9fc] px-4 py-3 text-[13px] leading-6 text-[#5f6f89]">
          Matching is by keyword, not meaning — asking about "revenue" won't surface a document that only says "turnover".
          Naming the document in your question is the reliable way to point it at the right file. Scanned PDFs and images
          have no text to read, so they're listed but can't be quoted.
        </p>
      </Card>

      {previewDoc ? (
        <DocumentPreviewModal
          doc={previewDoc}
          html={previewHtml}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewDoc(null)}
        />
      ) : null}
    </div>
  );
}
