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

    /* Auth shell (register / login / invite errors) — mirrors LoginPage.jsx's
       split-screen AuthShell: a real form on the left, the product's own
       pitch on the right, same as the staff sign-in page. */
    .gc-split { display: grid; min-height: 100vh; background: #f7f9fc; }
    .gc-split-left { display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
    .gc-split-left-inner { width: 100%; max-width: 380px; }
    .gc-split-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
    .gc-split-logo { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 16px; background: #ebf6ef; flex-shrink: 0; }
    .gc-split-logo-inner { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: #fff; color: #2b9b60; font-size: 12px; font-weight: 700; }
    .gc-split-brand-name { font-size: 14px; font-weight: 600; color: #102246; }
    .gc-split-right { display: none; flex-direction: column; justify-content: space-between; background: #1b295f; color: #fff; padding: 64px 48px; }
    .gc-split-right-label { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.24em; color: rgba(255,255,255,0.5); }
    .gc-split-right-heading { margin: 24px 0 0; font-size: 2.4rem; font-weight: 600; line-height: 1.15; letter-spacing: -0.02em; }
    .gc-split-right-copy { margin: 24px 0 0; max-width: 420px; font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.7); }
    .gc-split-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 32px; }
    .gc-split-feature-title { margin: 12px 0 0; font-size: 14px; font-weight: 600; }
    .gc-split-feature-desc { margin: 4px 0 0; font-size: 13px; line-height: 1.4; color: rgba(255,255,255,0.6); }
    @media (min-width: 1024px) {
      .gc-split { grid-template-columns: 1fr 1fr; }
      .gc-split-right { display: flex; }
    }

    .gc-auth-title { margin: 0; font-size: 26px; font-weight: 600; line-height: 1.25; color: #102246; }
    .gc-auth-subtitle { margin: 8px 0 0; font-size: 14px; color: #5c6b87; }

    /* Form controls */
    .gc-field { display: block; margin: 0 0 16px; }
    .gc-label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #334463; }
    .gc-input { display: block; width: 100%; padding: 10px 14px; border: 1px solid #d6deea; border-radius: 12px; font-size: 14px; color: #102246; outline: none; transition: border-color .15s; font-family: inherit; }
    .gc-input:focus { border-color: #3046b2; }
    .gc-checkbox-row { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 13px; color: #334463; }
    .gc-btn-primary { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #3046b2; color: #fff; border: none; border-radius: 14px; padding: 13px 20px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; font-family: inherit; }
    .gc-btn-primary:hover { background: #25348a; }
    .gc-btn-secondary { display: inline-flex; align-items: center; gap: 8px; width: auto; background: #fff; color: #102246; border: 1px solid #d6deea; border-radius: 12px; padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .15s; font-family: inherit; }
    .gc-btn-secondary:hover { background: #f7f9fc; }
    .gc-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .gc-note { margin: 16px 0 0; font-size: 13px; color: #8592ab; text-align: center; line-height: 1.6; }
    .gc-note a { color: #3046b2; font-weight: 500; text-decoration: none; }
    .gc-note a:hover { text-decoration: underline; }
    .gc-error { margin: 0 0 16px; padding: 10px 14px; background: #fdecea; color: #e0483f; border-radius: 12px; font-size: 13px; font-weight: 500; line-height: 1.5; }

    /* Dashboard shell — mirrors App.jsx's AppShell: a dark Sidebar next to
       a TopBar + PageHeader column. A client only ever has this one page,
       so the sidebar carries branding and a single "you are here" nav
       item rather than pretending there's somewhere else to click. */
    .gc-dashboard-body { background: #f4f7fb; color: #12213a; }
    .gc-shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
    .gc-shell main { min-width: 0; }

    .gc-sidebar { background: #1b295f; color: #fff; padding: 16px; display: flex; flex-direction: column; }
    .gc-sidebar-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .gc-sidebar-logo { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 16px; background: #fff; overflow: hidden; flex-shrink: 0; }
    .gc-sidebar-logo-inner { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: #ebf6ef; color: #2b9b60; font-size: 12px; font-weight: 700; }
    .gc-sidebar-name { margin: 0; font-size: 15px; font-weight: 600; }
    .gc-sidebar-tagline { margin: 0; font-size: 13px; color: rgba(255,255,255,0.65); }
    .gc-sidebar-section-label { margin: 0 0 8px; padding: 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.22em; color: rgba(255,255,255,0.36); }
    .gc-sidebar-item { display: flex; width: 100%; align-items: center; gap: 10px; border-radius: 10px; padding: 9px 10px; margin-bottom: 2px; color: rgba(255,255,255,0.82); text-decoration: none; font-size: 13.5px; font-weight: 500; transition: background .15s, color .15s; }
    .gc-sidebar-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .gc-sidebar-item.active { background: rgba(255,255,255,0.14); color: #fff; }
    .gc-sidebar-item-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
    .gc-sidebar-spacer { flex: 1; }
    .gc-sidebar-tag { margin-top: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.06); padding: 12px 16px; }
    .gc-sidebar-tag p { margin: 0; font-size: 13px; }
    .gc-sidebar-tag p:first-child { font-weight: 500; }
    .gc-sidebar-tag p:last-child { color: rgba(255,255,255,0.7); }

    .gc-topbar { border-bottom: 1px solid #d9e2ef; background: #f7f9fc; padding: 16px 20px; }
    .gc-topbar-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
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

    .gc-main { padding: 24px; }
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

    .gc-stage-row { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid #eef1f6; scroll-margin-top: 24px; }
    .gc-stage-row:last-child { border-bottom: none; }
    .gc-stage-dot { width: 14px; height: 14px; border-radius: 999px; margin-top: 4px; flex-shrink: 0; }
    .gc-stage-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .gc-stage-label { font-size: 15px; font-weight: 600; color: #102246; }
    .gc-stage-detail { margin: 4px 0 0; font-size: 13px; color: #5c6b87; }
    .gc-badge { display: inline-flex; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 600; white-space: nowrap; }

    .gc-sign-box { margin-top: 14px; padding: 18px; background: #fbfcfe; border: 1px solid #e7edf5; border-radius: 16px; }

    /* Data Room checklist — two columns so all ten request-list items fit
       without the page running on forever (mirrors the staff-side Data
       Room screen's own sm:grid-cols-2 checklist layout, same content). */
    .gc-doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .gc-doc-row { display: flex; flex-direction: column; gap: 10px; border-radius: 12px; padding: 12px 14px; }
    .gc-doc-row-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .gc-doc-row-label { font-size: 13px; color: #102246; font-weight: 500; overflow-wrap: break-word; }
    .gc-doc-row-actions { display: flex; align-items: center; gap: 8px; }
    .gc-doc-row-actions .gc-btn-secondary { padding: 7px 16px; font-size: 12px; }
    @media (max-width: 640px) {
      .gc-doc-grid { grid-template-columns: 1fr; }
    }

    /* Placed last so it wins over the unconditional .gc-shell/.gc-sidebar
       rules above at equal specificity. */
    @media (max-width: 767px) {
      .gc-shell { grid-template-columns: 1fr; }
      .gc-sidebar { display: none; }
    }
  `;
}

// Registration/login/invite-error pages — the same split-screen frame as
// the staff LoginPage's AuthShell: a real form on the left, the product's
// own pitch on the right, so a client landing here from an email link sees
// the same Global Capital BV, not a different-looking product.
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
    <div class="gc-split">
      <div class="gc-split-left">
        <div class="gc-split-left-inner">
          <div class="gc-split-brand">
            <div class="gc-split-logo"><div class="gc-split-logo-inner">GC</div></div>
            <span class="gc-split-brand-name">Global Capital BV</span>
          </div>
          <h1 class="gc-auth-title">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="gc-auth-subtitle">${subtitle}</p>` : ""}
          ${bodyHtml}
        </div>
      </div>

      <div class="gc-split-right">
        <div>
          <p class="gc-split-right-label">Global Capital BV</p>
          <h2 class="gc-split-right-heading">One operating system from opportunity discovery to portfolio monitoring.</h2>
          <p class="gc-split-right-copy">
            Twenty-four governed stages covering lead intelligence, NDA execution, secure data rooms, KYC, AI due
            diligence, valuation, term sheets, funding and impact reporting.
          </p>
        </div>
        <div class="gc-split-features">
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2fa84f" stroke-width="2" width="20" height="20" aria-hidden="true">
              <path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z" />
              <path d="m9 12 2 2 4-4.5" />
            </svg>
            <p class="gc-split-feature-title">Governed</p>
            <p class="gc-split-feature-desc">Stage-gated approvals</p>
          </div>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2fa84f" stroke-width="2" width="20" height="20" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <p class="gc-split-feature-title">Secure</p>
            <p class="gc-split-feature-desc">Audited data rooms</p>
          </div>
          <div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2fa84f" stroke-width="2" width="20" height="20" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
            </svg>
            <p class="gc-split-feature-title">Global</p>
            <p class="gc-split-feature-desc">14 markets covered</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

// The signed-in dashboard — a light-background page with a TopBar-style
// header and PageHeader-style content, matching the SPA's own modules
// (see App.jsx's AppShell/TopBar/PageHeader and src/components/ui.jsx).
//
// `stages` (each { key, label, dotColor }) renders one nav item per deal
// stage, each a real page of its own (/stage/:key) plus an Overview link
// back to the all-in-one dashboard — genuine navigation, not anchors into
// one long page. `activeKey` highlights whichever page is current (null
// on the Overview page itself). dotColor is precomputed by the caller
// (clientPortal.js already owns the status-to-color mapping for the
// stage rows themselves) so this file stays pure rendering with no
// status logic of its own.
export function dashboardShell({ title, clientName, companyName, stages = [], activeKey = null, bodyHtml }) {
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
    <div class="gc-shell">
      <aside class="gc-sidebar">
        <div class="gc-sidebar-brand">
          <div class="gc-sidebar-logo"><div class="gc-sidebar-logo-inner">GC</div></div>
          <div>
            <p class="gc-sidebar-name">Global Capital BV</p>
            <p class="gc-sidebar-tagline">Funding &amp; Investment OS</p>
          </div>
        </div>
        <p class="gc-sidebar-section-label">Deal Progress</p>
        <a href="/api/client-portal/dashboard" class="gc-sidebar-item${activeKey ? "" : " active"}">
          <span class="gc-sidebar-item-dot" style="background:#9aa6bd;"></span>
          Overview
        </a>
        ${stages
          .map(
            (s) => `
          <a href="/api/client-portal/stage/${escapeHtml(s.key)}" class="gc-sidebar-item${activeKey === s.key ? " active" : ""}">
            <span class="gc-sidebar-item-dot" style="background:${s.dotColor};"></span>
            ${escapeHtml(s.label)}
          </a>`
          )
          .join("")}
        <div class="gc-sidebar-spacer"></div>
        <div class="gc-sidebar-tag">
          <p>Strategic Investments,</p>
          <p>Sustainable Growth</p>
        </div>
      </aside>

      <main>
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
      </main>
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
