// Shared HTML shell for the client portal (registration, login,
// dashboard) — server-rendered pages, same approach as routes/nda.js's
// signing page, reused here because these pages arrive via an emailed
// link and are opened outside any logged-in session, so they can't be
// part of the React SPA (which lives entirely behind the staff login).
// The CSS below intentionally mirrors the SPA's own building blocks
// (src/components/ui.jsx's Card/StatCard/Badge, App.jsx's TopBar, and
// LoginPage.jsx's Shell) so a client jumping from an email link to the
// portal, and a rep looking at the SPA, are clearly the same product.

export function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pageStyles() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }

    /* Auth shell (register / login / invite errors) — mirrors LoginPage.jsx's Shell */
    .gc-auth-bg { min-height: 100vh; background: #1b295f; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .gc-auth-card { width: 100%; max-width: 400px; background: #fff; border-radius: 24px; padding: 32px; box-shadow: 0 20px 60px rgba(10,20,50,0.35); }
    .gc-logo-wrap { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .gc-logo { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: #ebf6ef; }
    .gc-logo-inner { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; background: #fff; color: #2b9b60; font-size: 13px; font-weight: 700; }
    .gc-auth-title { margin: 16px 0 0; font-size: 19px; font-weight: 600; color: #102246; }
    .gc-auth-subtitle { margin: 2px 0 0; font-size: 13px; color: #8592ab; }

    /* Form controls */
    .gc-field { display: block; margin: 0 0 16px; }
    .gc-label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #334463; }
    .gc-input { display: block; width: 100%; padding: 10px 14px; border: 1px solid #d6deea; border-radius: 12px; font-size: 14px; color: #102246; outline: none; transition: border-color .15s; font-family: inherit; }
    .gc-input:focus { border-color: #3046b2; }
    .gc-checkbox-row { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 13px; color: #334463; }
    .gc-btn-primary { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #3046b2; color: #fff; border: none; border-radius: 14px; padding: 13px 20px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; font-family: inherit; }
    .gc-btn-primary:hover { background: #25348a; }
    .gc-note { margin: 16px 0 0; font-size: 13px; color: #8592ab; text-align: center; line-height: 1.6; }
    .gc-note a { color: #3046b2; font-weight: 500; text-decoration: none; }
    .gc-note a:hover { text-decoration: underline; }
    .gc-error { margin: 0 0 16px; padding: 10px 14px; background: #fdecea; color: #e0483f; border-radius: 12px; font-size: 13px; font-weight: 500; line-height: 1.5; }

    /* Dashboard shell — mirrors App.jsx's TopBar + PageHeader */
    .gc-dashboard-body { background: #f4f7fb; color: #12213a; }
    .gc-topbar { border-bottom: 1px solid #d9e2ef; background: #f7f9fc; padding: 16px 20px; }
    .gc-topbar-inner { max-width: 880px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .gc-brand { display: flex; align-items: center; gap: 10px; }
    .gc-brand-logo { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; background: #fff; border: 1px solid #e7edf5; }
    .gc-brand-logo-inner { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: #ebf6ef; color: #2b9b60; font-size: 10px; font-weight: 700; }
    .gc-brand-name { font-size: 15px; font-weight: 600; color: #18263e; }
    .gc-pill-green { border-radius: 999px; background: #d9f4df; color: #179150; padding: 4px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; }
    .gc-topbar-right { display: flex; align-items: center; gap: 12px; }
    .gc-user-name { margin: 0; font-size: 13px; font-weight: 500; color: #18263e; text-align: right; line-height: 1.3; }
    .gc-user-sub { margin: 0; font-size: 11px; color: #8592ab; text-align: right; line-height: 1.3; }
    .gc-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: #2d47aa; color: #fff; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .gc-signout { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d6deea; background: #fff; color: #5f6f89; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 500; text-decoration: none; transition: background .15s; white-space: nowrap; }
    .gc-signout:hover { background: #f4f7fb; }

    .gc-main { max-width: 880px; margin: 0 auto; padding: 32px 20px 56px; }
    .gc-badge-pill { display: inline-flex; border-radius: 999px; background: #eef1ff; color: #3046b2; padding: 6px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; }
    .gc-heading { margin: 16px 0 0; font-size: 2.4rem; font-weight: 600; line-height: 1.05; letter-spacing: -0.03em; color: #0f2042; }
    .gc-subheading { margin: 12px 0 0; font-size: 15px; line-height: 1.7; color: #4f6181; max-width: 620px; }

    .gc-stats { margin-top: 28px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
    .gc-stat-card { border-radius: 20px; border: 1px solid #d6deea; background: #fff; padding: 18px 20px; box-shadow: 0 4px 16px rgba(30,48,87,0.06); }
    .gc-stat-label { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #5c6b87; }
    .gc-stat-value { margin: 10px 0 0; font-size: 2rem; font-weight: 600; line-height: 1; letter-spacing: -0.03em; color: #0f2042; }
    .gc-stat-note { margin-top: 12px; display: inline-flex; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 600; }

    .gc-card { margin-top: 24px; border-radius: 22px; border: 1px solid #d6deea; background: #fff; box-shadow: 0 4px 16px rgba(30,48,87,0.06); padding: 24px; }
    .gc-card-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #102246; }
    .gc-card-subtitle { margin: 6px 0 0 30px; font-size: 13px; color: #6a7790; }

    .gc-stage-row { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid #eef1f6; }
    .gc-stage-row:last-child { border-bottom: none; }
    .gc-stage-dot { width: 14px; height: 14px; border-radius: 999px; margin-top: 4px; flex-shrink: 0; }
    .gc-stage-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .gc-stage-label { font-size: 15px; font-weight: 600; color: #102246; }
    .gc-stage-detail { margin: 4px 0 0; font-size: 13px; color: #5c6b87; }
    .gc-badge { display: inline-flex; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 600; white-space: nowrap; }

    .gc-sign-box { margin-top: 14px; padding: 18px; background: #fbfcfe; border: 1px solid #e7edf5; border-radius: 16px; }
  `;
}

// Registration/login/invite-error pages — a narrow centered card on the
// same navy background as the staff LoginPage, so the very first thing a
// client sees still feels like Global Capital BV rather than a generic form.
export function authShell({ title, subtitle, bodyHtml }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Global Capital BV</title>
    <style>${pageStyles()}</style>
  </head>
  <body>
    <div class="gc-auth-bg">
      <div class="gc-auth-card">
        <div class="gc-logo-wrap">
          <div class="gc-logo"><div class="gc-logo-inner">GC</div></div>
          <h1 class="gc-auth-title">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="gc-auth-subtitle">${subtitle}</p>` : ""}
        </div>
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

// The signed-in dashboard — a light-background page with a TopBar-style
// header and PageHeader-style content, matching the SPA's own modules
// (see App.jsx's AppShell/TopBar/PageHeader and src/components/ui.jsx).
export function dashboardShell({ title, clientName, companyName, bodyHtml }) {
  const initials =
    String(clientName ?? "")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Global Capital BV</title>
    <style>${pageStyles()}</style>
  </head>
  <body class="gc-dashboard-body">
    <div class="gc-topbar">
      <div class="gc-topbar-inner">
        <div class="gc-brand">
          <div class="gc-brand-logo"><div class="gc-brand-logo-inner">GC</div></div>
          <span class="gc-brand-name">Global Capital BV</span>
          <span class="gc-pill-green">Client Portal</span>
        </div>
        <div class="gc-topbar-right">
          <div>
            <p class="gc-user-name">${escapeHtml(clientName)}</p>
            <p class="gc-user-sub">${escapeHtml(companyName)}</p>
          </div>
          <div class="gc-avatar">${escapeHtml(initials)}</div>
          <a href="/api/client-portal/logout" class="gc-signout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17 21 12 16 7" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </a>
        </div>
      </div>
    </div>
    <div class="gc-main">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

export function formField({ label, name, type = "text", required = true, placeholder = "", value = "" }) {
  return `
    <label class="gc-field">
      <span class="gc-label">${escapeHtml(label)}</span>
      <input
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        ${required ? "required" : ""}
        placeholder="${escapeHtml(placeholder)}"
        value="${escapeHtml(value)}"
        class="gc-input"
      />
    </label>`;
}

export function primaryButton(label) {
  return `<button type="submit" class="gc-btn-primary">${escapeHtml(label)}</button>`;
}

export function errorBanner(message) {
  if (!message) return "";
  return `<p class="gc-error">${escapeHtml(message)}</p>`;
}

export function noteText(text) {
  return `<p class="gc-note">${text}</p>`;
}
