// Shared HTML shell for the client portal (registration, login,
// dashboard) — server-rendered pages, same approach as routes/nda.js's
// signing page, reused here because these pages arrive via an emailed
// link and are opened outside any logged-in session, so they can't be
// part of the React SPA (which lives entirely behind the staff login).
// Colours/spacing deliberately match the SPA's palette so the jump from
// "email link" to "portal" doesn't feel like a different product.

export function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function portalShell({ title, bodyHtml, wide = false }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Global Capital BV</title>
  </head>
  <body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f7fb;color:#12213a;">
    <div style="max-width:${wide ? "880px" : "420px"};margin:0 auto;padding:48px 20px;">
      <div style="text-align:center;margin-bottom:28px;">
        <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#3046b2;">
          Global Capital BV
        </span>
        <p style="margin:4px 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8592ab;">Client Portal</p>
      </div>
      <div style="background:#ffffff;border:1px solid #d6deea;border-radius:20px;padding:36px;box-shadow:0 4px 16px rgba(30,48,87,0.06);">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

export function formField({ label, name, type = "text", required = true, placeholder = "", value = "" }) {
  return `
    <label style="display:block;margin:0 0 16px;">
      <span style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:#334463;">${escapeHtml(label)}</span>
      <input
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        ${required ? "required" : ""}
        placeholder="${escapeHtml(placeholder)}"
        value="${escapeHtml(value)}"
        style="display:block;width:100%;padding:11px 14px;border:1px solid #d6deea;border-radius:12px;font-size:14px;color:#102246;box-sizing:border-box;outline:none;"
      />
    </label>`;
}

export function primaryButton(label) {
  return `<button type="submit" style="width:100%;background:#3046b2;color:#fff;border:none;border-radius:12px;padding:13px 20px;font-size:15px;font-weight:600;cursor:pointer;">${escapeHtml(label)}</button>`;
}

export function errorBanner(message) {
  if (!message) return "";
  return `<p style="margin:0 0 16px;padding:10px 14px;background:#fdecea;color:#e0483f;border-radius:10px;font-size:13px;">${escapeHtml(message)}</p>`;
}

export function noteText(text) {
  return `<p style="margin:16px 0 0;font-size:13px;color:#8592ab;text-align:center;">${text}</p>`;
}
