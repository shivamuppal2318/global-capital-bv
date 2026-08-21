import { verifyToken } from "../lib/auth.js";
import { prisma } from "../db.js";

// Loads the user fresh on every request rather than trusting the JWT's
// copy of role/permissions. That costs one primary-key lookup, and buys
// two things the token can't give us: a permission change takes effect
// immediately instead of after the 7-day token expiry, and suspending or
// deleting someone actually cuts off their existing session (previously a
// suspended user kept working until their token expired).
export async function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session — please log in again." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, status: true, permissions: true }
    });

    if (!user) {
      return res.status(401).json({ error: "Account no longer exists — please log in again." });
    }
    if (user.status === "SUSPENDED") {
      return res.status(403).json({ error: "This account has been suspended. Contact an admin." });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
