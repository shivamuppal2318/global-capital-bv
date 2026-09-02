import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

// Shared by every upload route (Data Room documents, client-portal NDA
// uploads) so there's exactly one place that decides where files live and
// how big they're allowed to be — a route-specific limit drifting from
// this one would be an easy, hard-to-notice bug.
//
// Files live on a Docker volume, not in the image — a redeploy replaces
// the container, so anything written to the image filesystem would be
// silently lost. See docker-compose.coolify.yml.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never reuse the uploaded name on disk: "../../etc/passwd" or a
    // collision with an existing file would both be problems. The real
    // name is kept in the database for display and download.
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  }
});

export const upload = multer({ storage, limits: { fileSize: MAX_FILE_BYTES } });

// Thrown by dataRoomDocumentFileFilter below so route error handlers can
// recognize a rejected format and reply with a friendly 400 instead of a
// generic 500 (same pattern as multer.MulterError elsewhere in this file's
// callers).
export class UnsupportedFileTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedFileTypeError";
  }
}

// Real document formats only, no images — a screenshot or phone photo runs
// through OCR, which is lossy (misreads characters, picks up UI chrome) next
// to a native PDF/Word/Excel file's actual text layer. Scoped to Data Room
// checklist uploads specifically: NDA/IOI uploads keep accepting images via
// the plain `upload` above, since a photo of a hand-signed paper copy is a
// legitimate, unavoidable case there.
const DATA_ROOM_DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];

function dataRoomDocumentFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!DATA_ROOM_DOCUMENT_EXTENSIONS.includes(ext)) {
    return cb(new UnsupportedFileTypeError("Please upload a PDF, Word, or Excel file — images and screenshots aren't accepted here."));
  }
  cb(null, true);
}

export const uploadDataRoomDocument = multer({ storage, limits: { fileSize: MAX_FILE_BYTES }, fileFilter: dataRoomDocumentFileFilter });
