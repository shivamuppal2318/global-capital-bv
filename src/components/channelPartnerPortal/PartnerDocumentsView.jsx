import { useEffect, useState } from "react";
import { AttachmentIcon } from "../Icons";
import { Badge, Card, SectionTitle } from "../ui";
import { documentsApi } from "../../lib/documentsApi";

// A Channel Partner's own view of Data Room -- view/download only, no
// upload/verify/edit/delete affordances (see server/src/routes/documents.js's
// blockChannelPartner -- this tier is read-only by design). The backend
// already scopes GET /api/documents to documents on this partner's own
// referred leads only (relatedLeadOwnerWhereClause, see
// server/src/lib/channelPartnerLeadScope.js) -- this component just renders
// whatever the API actually returns, no client-side filtering.
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PartnerDocumentsView() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openError, setOpenError] = useState(null);

  useEffect(() => {
    documentsApi
      .list()
      .then(setDocuments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleOpen = async (doc) => {
    try {
      await documentsApi.open(doc, { download: false });
    } catch (err) {
      setOpenError(err.message);
    }
  };

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={AttachmentIcon}
        iconClass="text-[#3046b2]"
        subtitle="Documents on your own referred leads -- view only."
      >
        Data Room
      </SectionTitle>

      {openError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{openError}</p> : null}

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="text-[14px] text-[#e0483f]">{error}</p>
        ) : documents.length === 0 ? (
          <p className="text-[14px] text-[#8592ab]">No documents yet for your referred leads.</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center gap-4 rounded-[14px] border border-[#e7edf5] px-4 py-3 hover:bg-[#f8faff]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpen(doc)}
                    className="truncate text-[14px] font-medium text-[#102246] hover:text-[#3046b2] hover:underline"
                  >
                    {doc.originalName}
                  </button>
                  <Badge tone="slate">{doc.category}</Badge>
                  {doc.verified ? <Badge tone="green">Verified</Badge> : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#8592ab]">
                  {formatSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.description ? ` · ${doc.description}` : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
