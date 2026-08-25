import { useCallback, useEffect, useRef, useState } from "react";
import { documentsApi } from "../../lib/documentsApi";
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

const gapStatusStyle = {
  covered: { icon: "✓", badge: "border-[#cce7d6] bg-[#f1fbf5]", pill: "bg-[#2b9b60] text-white" },
  partial: { icon: "!", badge: "border-[#ffe9d0] bg-[#fff8ee]", pill: "bg-[#f29b3a] text-white" },
  missing: { icon: "—", badge: "border-[#e7edf5] bg-white", pill: "bg-[#edf1f6] text-[#9aa6bd]" }
};

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

export function DataRoomModule() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [requiredDocuments, setRequiredDocuments] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploadDescription, setUploadDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileInputRef = useRef(null);

  // Per-checklist-item "Insert doc" button — one shared hidden input rather
  // than one per row, since only ever one row's button is clicked at a time.
  // pendingItem records which row's category the next chosen file(s) should
  // be tagged with; insertingFor drives that row's own "Uploading…" state.
  const insertFileInputRef = useRef(null);
  const [pendingItem, setPendingItem] = useState(null);
  const [insertingFor, setInsertingFor] = useState(null);

  // AI gap check: null until run, then either a results array or a
  // "not configured" message — kept separate from the plain category-count
  // check below so a stale AI verdict is never shown for a checklist that's
  // since changed without an explicit re-run.
  const [gapResults, setGapResults] = useState(null);
  const [gapGeneratedAt, setGapGeneratedAt] = useState(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapMessage, setGapMessage] = useState(null);

  // Real numbers for the Data Room KPI framework's completion formula
  // (Verified ÷ Requested × 100) — refetched after anything that could
  // change them (upload, delete, verify toggle).
  const [kpis, setKpis] = useState(null);
  const loadKpis = useCallback(() => {
    documentsApi.kpis().then(setKpis).catch(() => {});
  }, []);
  useEffect(loadKpis, [loadKpis]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([documentsApi.list({ category: activeCategory, q: query }), documentsApi.categories()])
      .then(([docs, cats]) => {
        setDocuments(docs);
        setCategories(cats);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeCategory, query]);

  // Debounced so typing in the search box doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    documentsApi.requiredDocuments().then(setRequiredDocuments).catch(() => {});
  }, []);

  const handleGapCheck = async () => {
    setGapLoading(true);
    setGapMessage(null);
    try {
      const result = await documentsApi.gapCheck();
      if (!result.configured) {
        setGapMessage(result.message);
        setGapResults(null);
      } else {
        setGapResults(result.results);
        setGapGeneratedAt(result.generatedAt);
      }
    } catch (err) {
      setGapMessage(`Gap check failed: ${err.message}`);
    } finally {
      setGapLoading(false);
    }
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    setNotice(null);

    const results = [];
    for (const file of files) {
      try {
        const doc = await documentsApi.upload(file, { category: uploadCategory, description: uploadDescription });
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
      // A previous gap check no longer reflects what's actually uploaded —
      // cleared rather than left stale until someone re-runs it.
      setGapResults(null);
      load();
      loadKpis();
    }
  };

  const handleInsertForItem = async (item, files) => {
    if (!files?.length) return;
    setInsertingFor(item.label);
    setUploadError(null);
    setNotice(null);

    const results = [];
    for (const file of files) {
      try {
        const doc = await documentsApi.upload(file, { category: item.label, description: "" });
        results.push(doc);
      } catch (err) {
        setUploadError(`${file.name}: ${err.message}`);
      }
    }

    setInsertingFor(null);
    if (results.length) {
      setNotice(`Uploaded ${results.length} file(s) for "${item.label}".`);
      setGapResults(null);
      load();
      loadKpis();
    }
  };

  const handleDelete = async (doc) => {
    try {
      await documentsApi.remove(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setNotice(`Deleted ${doc.originalName}.`);
      setGapResults(null);
      loadKpis();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpen = async (doc, download) => {
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
      loadKpis();
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
        <h1 className="mt-4 text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Company documents</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[#4f6181]">
          Contracts, reports, decks and images in one place. Text-based files are read on upload so the AI Assistant can
          answer questions from them and cite the file it used.
        </p>

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
          icon={CheckCircleIcon}
          iconClass="text-[#2b9b60]"
          subtitle={
            gapResults
              ? `AI gap check ran ${new Date(gapGeneratedAt).toLocaleString()} — verdicts below are based on real document content, not just category tags.`
              : "The standard due-diligence request list — upload a file tagged with one of these categories to mark it received (leave Category as \"General\" and the AI will try to tag it for you). Reference only, not tied to a specific deal."
          }
          action={
            <ActionButton
              label={gapLoading ? "Checking…" : "Run AI gap check"}
              icon={SparklesIcon}
              small
              disabled={gapLoading}
              onClick={handleGapCheck}
            />
          }
        >
          Required documents checklist
        </SectionTitle>

        {gapMessage ? <p className="mt-3 text-[13px] font-medium text-[#c47f1a]">{gapMessage}</p> : null}

        {kpis ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <StatCard card={{ label: "Requested", value: String(kpis.requested), note: "Checklist items", noteTone: "blue" }} />
            <StatCard card={{ label: "Received", value: String(kpis.received), note: "At least 1 upload", noteTone: "amber" }} />
            <StatCard card={{ label: "Verified", value: String(kpis.verified), note: "Reviewed & approved", noteTone: "green" }} />
            <StatCard
              card={{
                label: "Completion",
                value: `${kpis.completionPercent}%`,
                note: "Verified ÷ Requested",
                noteTone: kpis.completionPercent === 100 ? "green" : "violet"
              }}
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {requiredDocuments.map((item) => {
            const gapVerdict = gapResults?.find((r) => r.label === item.label);
            // Falls back to the plain "was a file uploaded under this exact
            // category" check until a gap check has actually been run —
            // that's real too, just less discerning about content.
            const status = gapVerdict?.status ?? (categories.find((c) => c.category === item.label)?.count ? "covered" : "missing");
            const style = gapStatusStyle[status] ?? gapStatusStyle.missing;
            const matchCount = categories.find((c) => c.category === item.label)?.count ?? 0;

            return (
              <div
                key={item.label}
                className={`flex items-start justify-between gap-3 rounded-[14px] border px-4 py-3 ${style.badge}`}
                title={item.description}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${style.pill}`}>
                    {style.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[#102246]">{item.label}</p>
                    <p className="mt-0.5 text-[12px] text-[#8592ab]">
                      {gapVerdict ? gapVerdict.reason : matchCount ? `${matchCount} file(s) uploaded` : "Not yet uploaded"}
                    </p>
                    {gapVerdict?.matchedFilenames?.length ? (
                      <p className="mt-1 text-[11px] text-[#5f6f89]">From: {gapVerdict.matchedFilenames.join(", ")}</p>
                    ) : null}
                  </div>
                </div>
                <ActionButton
                  label={insertingFor === item.label ? "Uploading…" : "Insert doc"}
                  icon={UploadIcon}
                  small
                  disabled={insertingFor !== null}
                  onClick={() => {
                    setPendingItem(item);
                    insertFileInputRef.current?.click();
                  }}
                />
              </div>
            );
          })}
        </div>

        <input
          ref={insertFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...e.target.files];
            e.target.value = "";
            if (pendingItem) handleInsertForItem(pendingItem, files);
          }}
        />
      </Card>

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
              {[...new Set([...BASE_CATEGORY_PRESETS, ...requiredDocuments.map((d) => d.label), ...categories.map((c) => c.category)])].map(
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
    </div>
  );
}
