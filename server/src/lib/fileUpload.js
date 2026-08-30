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
