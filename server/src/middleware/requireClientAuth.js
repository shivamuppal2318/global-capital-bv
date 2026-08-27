import { verifyClientToken } from "../lib/auth.js";
import { prisma } from "../db.js";

const COOKIE_NAME = "gc_client_session";

// The portal is server-rendered multi-page HTML (see routes/clientPortal.js),
// not the SPA — a browser session cookie fits that shape far better than a
// JWT the client would have to paste into a header, so this deliberately
// diverges from the staff app's Authorization-header convention.
export function readClientSessionCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function setClientSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${30 * 24 * 60 * 60}`
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearClientSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

// Loads the client account fresh on every request — same reasoning as the
// staff requireAuth: a suspended account (or a deleted one) stops working
// immediately rather than staying valid until the token's 30-day expiry.
export async function requireClientAuth(req, res, next) {
  const token = readClientSessionCookie(req);
  if (!token) return res.redirect("/api/client-portal/login");

  let payload;
  try {
    payload = verifyClientToken(token);
  } catch {
    clearClientSessionCookie(res);
    return res.redirect("/api/client-portal/login");
  }

  const clientUser = await prisma.clientUser.findUnique({
    where: { id: payload.sub },
    include: { lead: { select: { id: true, name: true, company: true } } }
  });

  if (!clientUser || clientUser.status === "SUSPENDED") {
    clearClientSessionCookie(res);
    return res.redirect("/api/client-portal/login");
  }

  req.clientUser = clientUser;
  next();
}
