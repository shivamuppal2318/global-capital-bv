import { verifyToken } from "../lib/auth.js";

// Attaches req.user = { id, email, role } from a valid Bearer JWT. The
// token payload itself is trusted for identity/role (it's signed), so this
// never hits the database — routes that need fresh user state (e.g. to
// check UserStatus.SUSPENDED) should look the user up themselves.
export function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session — please log in again." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
