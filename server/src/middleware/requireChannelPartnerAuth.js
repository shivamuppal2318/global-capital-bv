import { verifyChannelPartnerUserToken } from "../lib/auth.js";
import { prisma } from "../db.js";

// Bearer-header shape, mirroring requireAuth.js exactly — not
// requireClientAuth.js's cookie shape, since the partner portal is a real
// SPA reusing EmailOutreachModule (see App.jsx-equivalent
// ChannelPartnerPortalApp.jsx), not server-rendered HTML like the client
// portal. Loads the ChannelPartnerUser fresh on every request for the same
// reason requireAuth does: a suspended account should stop working
// immediately, not after the token's 30-day expiry.
//
// Populates req.channelPartner = { id: <ChannelPartner id>, userId, name,
// email } — `id` here is deliberately the ChannelPartner id (the business
// record), not the ChannelPartnerUser id, because that's what
// EmailCampaign.ownerChannelPartnerId actually references (see
// lib/channelPartnerScope.js).
export async function requireChannelPartnerAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
  }

  let payload;
  try {
    payload = verifyChannelPartnerUserToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session — please log in again." });
  }

  try {
    const channelPartnerUser = await prisma.channelPartnerUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, status: true, channelPartnerId: true }
    });

    if (!channelPartnerUser) {
      return res.status(401).json({ error: "Account no longer exists — please log in again." });
    }
    if (channelPartnerUser.status === "SUSPENDED") {
      return res.status(403).json({ error: "This account has been suspended. Contact Global Capital BV." });
    }

    req.channelPartner = {
      id: channelPartnerUser.channelPartnerId,
      userId: channelPartnerUser.id,
      name: channelPartnerUser.name,
      email: channelPartnerUser.email
    };
    next();
  } catch (err) {
    next(err);
  }
}
