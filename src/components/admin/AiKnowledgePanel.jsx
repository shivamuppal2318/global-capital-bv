import { useEffect, useRef, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { documentsApi } from "../../lib/documentsApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { CheckCircleIcon, NoteIcon, SparklesIcon, UploadIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// The always-on half of the assistant's knowledge: a free-text company
// profile, plus documents pinned so they're sent with every question
// instead of only when keywords happen to match.
export function AiKnowledgePanel({ companyProfile, onSaveProfile, savingProfile }) {
  const [profile, setProfile] = useState(companyProfile ?? "");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => setProfile(companyProfile ?? ""), [companyProfile]);

  const load = () => {
    setLoading(true);
    adminApi
      .listAiKnowledge()
      .then(setDocs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setNotice(null);
    setError(null);

    let pinnedOk = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        // Uploads land in the Data Room like any other document, then get
        // pinned — one store, one extraction path, no duplicate copies.
        const doc = await documentsApi.upload(file, { category: "AI Knowledge", description: "Pinned to AI memory" });
        if (doc.searchable) {
          await adminApi.pinAiDocument(doc.id, true);
          pinnedOk += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (pinnedOk || skipped) {
      setNotice(
        skipped === 0
          ? `Added ${pinnedOk} file(s) to AI memory.`
          : `Added ${pinnedOk}. ${skipped} had no readable text (scanned PDF or image) so couldn't be pinned — they're still in the Data Room.`
      );
      load();
    }
  };

  const togglePin = async (doc) => {
    try {
      await adminApi.pinAiDocument(doc.id, !doc.pinnedToAi);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const pinned = docs.filter((d) => d.pinnedToAi);
  const unpinned = docs.filter((d) => !d.pinnedToAi);

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={NoteIcon}
          iconClass="text-[#3046b2]"
          subtitle="Standing facts the assistant should never have to look up — what the company does, who the customers are, house rules for how to answer."
        >
          Company profile
        </SectionTitle>
        <textarea
          rows={7}
          className={`${inputClass} mt-4 resize-y font-normal`}
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder={"Global Capital BV is an Amsterdam-based investment firm focused on renewables and infrastructure in the Benelux.\n\nTypical ticket size is EUR 2–15 million. We prioritise founder-led businesses with proven revenue.\n\nWhen asked about a lead, always mention their stage and owner."}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ActionButton
            label={savingProfile ? "Saving…" : "Save profile"}
            primary
            small
            onClick={() => onSaveProfile(profile)}
            disabled={savingProfile}
          />
          <p className="text-[12px] text-[#8592ab]">
            {profile.length.toLocaleString()} characters · sent with every question
          </p>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={SparklesIcon}
          iconClass="text-[#8b52d0]"
          subtitle="Pinned documents go into every answer. Everything else in the Data Room is still searched per question — pin only what the assistant should always have to hand."
          action={<Badge tone={pinned.length ? "violet" : "slate"}>{pinned.length} pinned</Badge>}
        >
          AI memory documents
        </SectionTitle>

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
          className={`mt-4 cursor-pointer rounded-[16px] border-2 border-dashed px-6 py-7 text-center transition ${
            dragging ? "border-[#8b52d0] bg-[#faf6ff]" : "border-[#d6deea] hover:border-[#8b52d0] hover:bg-[#faf9ff]"
          }`}
        >
          <UploadIcon className="mx-auto size-5 text-[#8b52d0]" />
          <p className="mt-2 text-[14px] font-medium text-[#102246]">
            {uploading ? "Uploading and pinning…" : "Drop PDFs or Word docs here to add to AI memory"}
          </p>
          <p className="mt-1 text-[12px] text-[#8592ab]">Also filed in the Data Room under "AI Knowledge".</p>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles([...e.target.files])} />
        </div>

        {notice ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[#2b9b60]">
            <CheckCircleIcon className="size-4" />
            {notice}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-[14px] text-[#8592ab]">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-[14px] text-[#8592ab]">No documents yet. Upload above, or add them in the Data Room and pin them here.</p>
          ) : (
            <>
              {pinned.map((doc) => (
                <DocRow key={doc.id} doc={doc} onToggle={togglePin} />
              ))}
              {unpinned.length > 0 ? (
                <p className="pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8592ab]">
                  In the Data Room — not pinned
                </p>
              ) : null}
              {unpinned.map((doc) => (
                <DocRow key={doc.id} doc={doc} onToggle={togglePin} />
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  );

  function DocRow({ doc, onToggle }) {
    return (
      <div
        className={`flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-3 ${
          doc.pinnedToAi ? "border-[#e0d5f5] bg-[#faf8ff]" : "border-[#e7edf5]"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-medium text-[#102246]">{doc.originalName}</p>
            <Badge tone="slate">{doc.category}</Badge>
            {doc.pinnedToAi ? <Badge tone="violet">In AI memory</Badge> : null}
            {!doc.searchable ? <Badge tone="amber">No readable text</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[#8592ab]">
            {formatSize(doc.sizeBytes)}
            {doc.textPreview ? ` · ${doc.textPreview.slice(0, 90)}…` : doc.extractionNote ? ` · ${doc.extractionNote}` : ""}
          </p>
        </div>
        <ActionButton
          label={doc.pinnedToAi ? "Remove from memory" : "Add to memory"}
          small
          active={doc.pinnedToAi}
          disabled={!doc.searchable && !doc.pinnedToAi}
          onClick={() => onToggle(doc)}
        />
      </div>
    );
  }
}
