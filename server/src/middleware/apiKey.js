// Coarse-grained auth: one shared key for the whole internal API (campaigns,
// leads, templates). Not per-user, no roles/scopes — that's a real gap for
// anything beyond "keep this off the open internet." Webhooks and the
// unsubscribe link have their own separate secret/token schemes (see
// routes/webhooks.js, routes/bounces.js, lib/unsubscribeToken.js) since
// those are hit by external systems that can't hold this key, not by the
// frontend.
export function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    // Fail closed, not open: an unset API_KEY should not silently disable
    // auth. Every request 401s until it's configured.
    return res.status(500).json({ error: "Server misconfigured: API_KEY is not set." });
  }

  const provided = req.headers["x-api-key"];
  if (provided !== expected) {
    return res.status(401).json({ error: "Missing or invalid API key." });
  }

  next();
}
