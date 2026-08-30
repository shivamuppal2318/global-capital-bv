import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { extractText } from "../lib/documentText.js";
import { REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";
import { classifyDocumentCategory, runGapCheck } from "../lib/documentClassifier.js";
import { recordAudit } from "../lib/auditLog.js";
import { upload, UPLOAD_DIR, MAX_FILE_BYTES } from "../lib/fileUpload.js";

export const documentsRouter = Router();

function publicDocument(doc) {
  return {
    id: doc.id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    category: doc.category,
    description: doc.description,
    searchable: Boolean(doc.extractedText),
    extractionNote: doc.extractionNote,
    uploadedBy: doc.uploadedBy ? { id: doc.uploadedBy.id, name: doc.uploadedBy.name } : null,
    verified: doc.verified,
    verifiedAt: doc.verifiedAt,
    verifiedBy: doc.verifiedBy ? { id: doc.verifiedBy.id, name: doc.verifiedBy.name } : null,
    createdAt: doc.createdAt
  };
}

documentsRouter.get("/", asyncHandler(async (req, res) => {
  const { category, q } = req.query;
  const docs = await prisma.document.findMany({
    where: {
      ...(category && category !== "All" ? { category } : {}),
      ...(q
        ? {
            OR: [
              { originalName: { contains: String(q), mode: "insensitive" } },
              { description: { contains: String(q), mode: "insensitive" } },
              { extractedText: { contains: String(q), mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: { uploadedBy: { select: { id: true, name: true } }, verifiedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(docs.map(publicDocument));
}));

documentsRouter.get("/categories", asyncHandler(async (_req, res) => {
  const grouped = await prisma.document.groupBy({ by: ["category"], _count: { category: true } });
  res.json(grouped.map((g) => ({ category: g.category, count: g._count.category })).sort((a, b) => a.category.localeCompare(b.category)));
}));

// Served from the backend so the checklist, the upload classifier, and the
// AI gap check all read the exact same list — see lib/requiredDocuments.js.
documentsRouter.get("/required-documents", (_req, res) => res.json(REQUIRED_DOCUMENTS));

// Data Room KPI framework's completion formula: Verified Documents ÷
// Required Documents × 100. "Received" is looser (uploaded but not yet
// reviewed) — both are surfaced since the framework's own status flow
// (Requested → Received → Verified) treats them as genuinely different
// milestones, not just two names for the same thing.
documentsRouter.get("/kpis", asyncHandler(async (_req, res) => {
  const docs = await prisma.document.findMany({
    where: { category: { in: REQUIRED_DOCUMENT_LABELS } },
    select: { category: true, verified: true }
  });

  const byCategory = new Map();
  for (const doc of docs) {
    const entry = byCategory.get(doc.category) ?? { received: false, verified: false };
    entry.received = true;
    if (doc.verified) entry.verified = true;
    byCategory.set(doc.category, entry);
  }

  const requested = REQUIRED_DOCUMENT_LABELS.length;
  const received = [...byCategory.values()].filter((e) => e.received).length;
  const verified = [...byCategory.values()].filter((e) => e.verified).length;

  res.json({
    requested,
    received,
    verified,
    pending: requested - received,
    completionPercent: requested > 0 ? Math.round((verified / requested) * 100) : 0
  });
}));

documentsRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded." });
  }

  const filePath = path.join(UPLOAD_DIR, req.file.filename);
  // Extraction failures are captured as a note rather than thrown — a
  // scanned PDF or an image should still upload successfully.
  const { text, note } = await extractText(filePath, req.file.mimetype, req.file.originalname);

  const requestedCategory = (req.body?.category || "General").trim() || "General";
  // Only auto-classify when the uploader didn't pick a specific category —
  // "General" is the form's default, so leaving it there is the real signal
  // that nobody bothered picking one. An explicit choice (including
  // deliberately picking "General") is never overridden.
  const category =
    requestedCategory === "General"
      ? (await classifyDocumentCategory({ filename: req.file.originalname, text })) ?? requestedCategory
      : requestedCategory;

  const doc = await prisma.document.create({
    data: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || "application/octet-stream",
      sizeBytes: req.file.size,
      category,
      description: req.body?.description?.trim() || null,
      extractedText: text,
      extractionNote: note,
      uploadedById: req.user?.id ?? null
    },
    include: { uploadedBy: { select: { id: true, name: true } }, verifiedBy: { select: { id: true, name: true } } }
  });
  await recordAudit({ req, action: "document.uploaded", entityType: "Document", entityId: doc.id, detail: `${doc.originalName} (${doc.category})` });

  res.status(201).json(publicDocument(doc));
}));

// Analyzes real document content (not just category tags) against the
// required-documents checklist — see lib/documentClassifier.js. Read-only:
// nothing here is stored, it's recomputed fresh on every call so it always
// reflects the current Data Room.
documentsRouter.post("/gap-check", asyncHandler(async (_req, res) => {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, category: true, description: true, extractedText: true }
  });

  const { configured, results, generatedAt } = await runGapCheck(documents);
  if (!configured) {
    return res.json({
      configured: false,
      message: "The AI assistant isn't set up yet — an admin can add a Claude API key under Admin Panel → AI Assistant."
    });
  }

  res.json({ configured: true, results, generatedAt });
}));

documentsRouter.get("/:id/download", asyncHandler(async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const filePath = path.join(UPLOAD_DIR, doc.storedName);
  if (!(await fs.stat(filePath).catch(() => null))) {
    return res.status(410).json({ error: "The stored file is missing on disk. It may have been removed outside the app." });
  }

  res.setHeader("Content-Type", doc.mimeType);
  // `inline` lets PDFs and images preview in a browser tab; the frontend
  // passes ?download=1 when it wants a save prompt instead.
  const disposition = req.query.download ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(doc.originalName)}"`);
  res.sendFile(filePath);
}));

// Marks a document as reviewed/approved (or reverts that) — the human step
// the KPI framework's completion % actually counts, distinct from just
// having been uploaded. Toggled by any user who can reach the Data Room;
// this app doesn't have a reviewer-vs-uploader role split yet.
documentsRouter.post("/:id/verify", asyncHandler(async (req, res) => {
  const verified = req.body?.verified !== false;
  const doc = await prisma.document
    .update({
      where: { id: req.params.id },
      data: verified
        ? { verified: true, verifiedAt: new Date(), verifiedById: req.user?.id ?? null }
        : { verified: false, verifiedAt: null, verifiedById: null },
      include: { uploadedBy: { select: { id: true, name: true } }, verifiedBy: { select: { id: true, name: true } } }
    })
    .catch(() => null);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  await recordAudit({
    req,
    action: verified ? "document.verified" : "document.unverified",
    entityType: "Document",
    entityId: doc.id,
    detail: `${doc.originalName} (${doc.category})`
  });

  res.json(publicDocument(doc));
}));

documentsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const { category, description } = req.body ?? {};
  const doc = await prisma.document
    .update({
      where: { id: req.params.id },
      data: {
        ...(category !== undefined ? { category: String(category).trim() || "General" } : {}),
        ...(description !== undefined ? { description: String(description).trim() || null } : {})
      },
      include: { uploadedBy: { select: { id: true, name: true } }, verifiedBy: { select: { id: true, name: true } } }
    })
    .catch(() => null);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(publicDocument(doc));
}));

documentsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  await prisma.document.delete({ where: { id: doc.id } });
  // Removing the row is what makes the document gone from the app's point
  // of view; a leftover file on disk is untidy but harmless, so a failure
  // here shouldn't turn a successful delete into an error.
  await fs.unlink(path.join(UPLOAD_DIR, doc.storedName)).catch(() => {});
  await recordAudit({ req, action: "document.deleted", entityType: "Document", entityId: doc.id, detail: `${doc.originalName} (${doc.category})` });

  res.status(204).end();
}));

// multer rejects oversized files with its own error class — translated
// here so the UI shows a size limit rather than a generic 500.
documentsRouter.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `That file is too large. The limit is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
        : err.message;
    return res.status(400).json({ error: message });
  }
  next(err);
});
