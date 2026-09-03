// The real Global Capital BV logo mark -- extracted from the source NDA
// PDF, cropped and quantized down to ~8KB -- as a data URI, loaded once at
// import time (top-level await; safe here since this only ever runs at
// server boot, not per-request) and reused everywhere a server-rendered
// page needs it: the client portal shell, the channel partner agreement
// page, the "interested" reply landing page, and the downloadable signed
// NDA/IOI documents. A data URI (not a static /assets route) so a
// downloaded .html file still shows the logo with no further server
// round-trip.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoBuffer = await fs.readFile(path.join(__dirname, "..", "..", "assets", "global-capital-logo.png"));

export const LOGO_DATA_URI = `data:image/png;base64,${logoBuffer.toString("base64")}`;
