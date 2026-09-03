import { useCallback, useEffect, useMemo, useState } from "react";
import { documentsApi } from "../../lib/documentsApi";
import { leadsApi } from "../../lib/leadsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import {
  AttachmentIcon,
  CheckCircleIcon,
  NoteIcon,
  SearchIcon,
  XIcon
} from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";

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

// One document's row — shared by the "specific deal already selected" flat
// list and the client-group popup below, so the two never quietly drift
// apart on what a document row actually shows/does.
function DocumentRow({ doc, onOpen, onVerify, onDelete }) {
  const glyph = fileGlyph(doc.mimeType, doc.originalName);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3 hover:bg-[#f8faff]">
      <span className={`grid size-11 shrink-0 place-items-center rounded-[12px] text-[11px] font-bold ${glyph.tone}`}>
        {glyph.label}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(doc, false)}
            className="truncate text-[14px] font-medium text-[#102246] hover:text-[#3046b2] hover:underline"
          >
            {doc.originalName}
          </button>
          <Badge tone="slate">{doc.category}</Badge>
          {doc.searchable ? <Badge tone="green">AI-readable</Badge> : <Badge tone="amber">Not searchable</Badge>}
          {doc.verified ? <Badge tone="green">Verified</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] text-[#8592ab]">
          {formatSize(doc.sizeBytes)}
          {doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ""}
          {` · ${new Date(doc.createdAt).toLocaleDateString()}`}
          {doc.description ? ` · ${doc.description}` : ""}
          {doc.verified && doc.verifiedBy ? ` · Verified by ${doc.verifiedBy.name}` : ""}
        </p>
        {!doc.searchable && doc.extractionNote ? <p className="mt-1 text-[12px] text-[#c47f1a]">{doc.extractionNote}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ActionButton label="Open" small onClick={() => onOpen(doc, false)} />
        <ActionButton label="Download" small onClick={() => onOpen(doc, true)} />
        <ActionButton
          label={doc.verified ? "Unverify" : "Verify"}
          icon={CheckCircleIcon}
          small
          active={doc.verified}
          onClick={() => onVerify(doc)}
        />
        <ActionButton label="Delete" icon={XIcon} small onClick={() => onDelete(doc)} />
      </div>
    </div>
  );
}

// Opened by clicking a client card in the "Company library" grouped view —
// that view exists specifically so a long, all-clients-mixed-together list
// isn't the default; this is where the actual per-document actions live for
// that one client. "View full Data Room" hands off to the existing
// Deal-scoped flat view for anything needing the fuller page (search,
// category filters) rather than duplicating those here.
function ClientDocumentsModal({ group, onOpen, onVerify, onDelete, onViewFullDataRoom, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-[720px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e7edf5] px-6 py-5">
          <div>
            <p className="text-[18px] font-semibold text-[#102246]">{group.label}</p>
            <p className="mt-1 text-[13px] text-[#8592ab]">
              {group.docs.length} document{group.docs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {group.leadId ? <ActionButton label="View full Data Room" small onClick={onViewFullDataRoom} /> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto px-6 py-5">
          {group.docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onOpen={onOpen} onVerify={onVerify} onDelete={onDelete} />
          ))}
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
  const [notice, setNotice] = useState(null);
  // Rendered .docx preview — separate from `handleOpen` below, which still
  // handles PDFs/images (the browser renders those natively as a blob).
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  // Which client's popup is open in the "Company library" grouped view —
  // null means none open. Not used at all once a specific deal is already
  // selected above, since that view is already scoped to one client.
  const [viewingGroupKey, setViewingGroupKey] = useState(null);

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

  // Only meaningful in the "Company library" view (selectedLeadId === "") —
  // a mixed flat list of every client's documents together read poorly (the
  // same file type/category repeated row after row with no way to tell
  // whose is whose at a glance), so this groups the same already-filtered
  // `documents` by client instead, one compact card each, biggest first.
  const groupedByClient = useMemo(() => {
    const map = new Map();
    for (const doc of documents) {
      const key = doc.lead?.id ?? "__company__";
      if (!map.has(key)) map.set(key, { key, label: doc.lead?.company ?? "Company library", leadId: doc.lead?.id ?? null, docs: [] });
      map.get(key).docs.push(doc);
    }
    return [...map.values()].sort((a, b) => b.docs.length - a.docs.length);
  }, [documents]);
  const viewingGroup = groupedByClient.find((g) => g.key === viewingGroupKey) ?? null;

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
        <SectionTitle
          icon={NoteIcon}
          iconClass="text-[#f29b3a]"
          subtitle="Search looks inside document text, not just filenames."
        >
          Documents
        </SectionTitle>

        {notice ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[#2b9b60]">
            <CheckCircleIcon className="size-4" />
            {notice}
          </p>
        ) : null}

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
                  : "Documents show up here once a client uploads them through their portal."}
              </p>
            </div>
          ) : selectedLeadId ? (
            // A specific deal is already picked above — every row here
            // belongs to that one client, so the flat list (no per-row
            // client badge/grouping needed) is the right view.
            documents.map((doc) => <DocumentRow key={doc.id} doc={doc} onOpen={handleOpen} onVerify={handleVerify} onDelete={handleDelete} />)
          ) : (
            // Company library: grouped by client instead of one long mixed
            // list — click a card to open that client's documents in a
            // popup (see ClientDocumentsModal).
            groupedByClient.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setViewingGroupKey(group.key)}
                className="flex w-full items-center justify-between gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3 text-left hover:bg-[#f8faff]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#102246]">{group.label}</p>
                  <p className="mt-0.5 text-[12px] text-[#8592ab]">
                    {group.docs.length} document{group.docs.length === 1 ? "" : "s"}
                    {group.docs.some((d) => d.verified) ? ` · ${group.docs.filter((d) => d.verified).length} verified` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold text-[#3046b2]">View →</span>
              </button>
            ))
          )}
        </div>
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

      {viewingGroup ? (
        <ClientDocumentsModal
          group={viewingGroup}
          onOpen={handleOpen}
          onVerify={handleVerify}
          onDelete={handleDelete}
          onViewFullDataRoom={() => {
            setSelectedLeadId(viewingGroup.leadId);
            setViewingGroupKey(null);
          }}
          onClose={() => setViewingGroupKey(null)}
        />
      ) : null}
    </div>
  );
}
