import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { verifyTrackingToken } from "../lib/trackingToken.js";

export const trackingRouter = Router();

// 1x1 transparent GIF, decoded once at module load.
const TRANSPARENT_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7", "base64");

function requireValidToken(req, res, next) {
  if (!verifyTrackingToken(req.params.activityLogId, req.params.token)) {
    // No error page — this is loaded/followed automatically by a mail
    // client or browser, not read by a human.
    return res.status(403).end();
  }
  next();
}

// Deliberately never lets a DB failure break the actual pixel response or
// the click redirect — a broken tracking write should never be the reason
// an email renders wrong or a link fails to open. Logging failures are
// swallowed (with a server-side console.error), not surfaced to the client.
async function recordEvent(activityLogId, kind, title, detailFn) {
  try {
    const original = await prisma.activityLog.findUnique({ where: { id: activityLogId } });
    if (original) {
      await prisma.activityLog.create({
        data: { leadId: original.leadId, kind, title, detail: detailFn(original) }
      });
    }
  } catch (err) {
    console.error(`[tracking] failed to record ${kind}:`, err.message);
  }
}

trackingRouter.get("/open/:activityLogId/:token", requireValidToken, asyncHandler(async (req, res) => {
  await recordEvent(req.params.activityLogId, "EMAIL_OPENED", "Email opened", (original) => `Opened: "${original.title}".`);
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store");
  res.end(TRANSPARENT_PIXEL);
}));

trackingRouter.get("/click/:activityLogId/:token", requireValidToken, asyncHandler(async (req, res) => {
  const destination = req.query.url;
  if (!destination || typeof destination !== "string") {
    return res.status(400).send("Missing destination URL.");
  }

  await recordEvent(req.params.activityLogId, "LINK_CLICKED", "Link clicked", (original) => `Clicked a link in "${original.title}": ${destination}`);
  res.redirect(302, destination);
}));
