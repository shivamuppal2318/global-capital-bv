import { useState } from "react";
import { ChannelPartnerAuthProvider, useChannelPartnerAuth } from "../../context/ChannelPartnerAuthContext";
import { EmailOutreachModule } from "../emailOutreach/EmailOutreachModule.jsx";
import { MarketIntelligenceModule } from "../marketIntelligence/MarketIntelligenceModule.jsx";
import { PartnerLeadsView } from "./PartnerLeadsView.jsx";
import { AuthShell } from "../auth/LoginPage.jsx";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";
const primaryButtonClass =
  "w-full rounded-[12px] bg-[#1b295f] px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#142050] disabled:cursor-not-allowed disabled:opacity-60";

function PartnerLoginView() {
  const { login } = useChannelPartnerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold leading-tight text-[#102246]">Channel Partner Portal</h1>
      <p className="mt-2 text-[14px] leading-6 text-[#5f6f89]">
        Run your own outreach — your campaigns and leads, kept separate from everyone else's.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            required
            autoFocus
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@partner.com"
          />
        </div>
        <div>
          <label className={labelClass}>Password</label>
          <input
            type="password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p>
        ) : null}

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-[12px] leading-5 text-[#8592ab]">
        Don't have an account yet? Your portal login is created when you sign the Channel Partner Agreement.
      </p>
    </AuthShell>
  );
}

// Extra top-level sections beyond Email Automation (always shown) — each
// is a separate top-level module in the staff app (App.jsx), not a tab
// inside EmailOutreachModule like Segments/Templates/AI Agent are, so they
// need their own nav entries here rather than more visibleTabs ids.
const EXTRA_SECTIONS = [
  { id: "crm-workspace", label: "CRM Workspace", Component: PartnerLeadsView },
  { id: "market-intelligence", label: "Market Intelligence", Component: MarketIntelligenceModule }
];

function PartnerShell() {
  const { partnerUser, logout } = useChannelPartnerAuth();
  const [section, setSection] = useState("email");
  const permissions = partnerUser.permissions ?? [];
  const grantedExtraSections = EXTRA_SECTIONS.filter((s) => permissions.includes(s.id));
  const ActiveExtraSection = grantedExtraSections.find((s) => s.id === section)?.Component ?? null;

  return (
    <div className="min-h-screen bg-[#f7f9fc] px-6 py-6 lg:px-10">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#ebf6ef]">
              <div className="grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-[#2b9b60]">GC</div>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#102246]">{partnerUser.channelPartner.name}</p>
              <p className="text-[12px] text-[#5f6f89]">Channel Partner Portal · {partnerUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-[10px] border border-[#d6deea] px-3.5 py-2 text-[13px] font-medium text-[#4f6181] hover:bg-[#f4f7fb]"
          >
            Log out
          </button>
        </header>

        {/* Only shown at all once there's a second real section to switch
            to. */}
        {grantedExtraSections.length ? (
          <div className="flex gap-1.5 rounded-[14px] border border-[#d6deea] bg-white p-1.5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            {[{ id: "email", label: "Email Automation" }, ...grantedExtraSections].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition ${
                  section === s.id ? "bg-[#3046b2] text-white shadow-sm" : "text-[#4f6181] hover:bg-[#f4f7fb]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        {ActiveExtraSection ? (
          <ActiveExtraSection />
        ) : (
          // The existing staff module, unchanged — Dashboard/Campaigns/Leads/
          // Automation are the always-included baseline (one shared API
          // surface every partner gets), Segments/Templates/AI Agent are
          // optional per-partner grants (see Admin Panel -> Channel
          // Partners -> Feature access, and app.js's matching enforcement).
          // Mailbox/Settings stay staff-only regardless — see
          // EmailOutreachModule's visibleTabs prop.
          <EmailOutreachModule
            initialTab="dashboard"
            visibleTabs={["dashboard", "campaigns", "leads", "automation", ...permissions]}
          />
        )}
      </div>
    </div>
  );
}

function ChannelPartnerPortalShell() {
  const { partnerUser, loading } = useChannelPartnerAuth();
  if (loading) return null;
  return partnerUser ? <PartnerShell /> : <PartnerLoginView />;
}

// A second, minimal SPA shell — entirely separate from App.jsx's staff
// shell (own auth context/provider, own top bar) so there's zero risk of a
// Channel Partner session ever touching a staff-only branch. Reached at
// /partner (see main.jsx, and the login link emitted after signing the
// agreement in routes/channelPartnerAgreement.js).
export function ChannelPartnerPortalApp() {
  return (
    <ChannelPartnerAuthProvider>
      <ChannelPartnerPortalShell />
    </ChannelPartnerAuthProvider>
  );
}
