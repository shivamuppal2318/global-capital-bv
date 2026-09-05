import { useEffect, useState } from "react";
import { ChannelPartnerAuthProvider, useChannelPartnerAuth } from "../../context/ChannelPartnerAuthContext";
import { channelPartnerPortalAuthApi } from "../../lib/channelPartnerPortalAuthApi";
import { EmailOutreachModule } from "../emailOutreach/EmailOutreachModule.jsx";
import { MarketIntelligenceModule } from "../marketIntelligence/MarketIntelligenceModule.jsx";
import { UniversalFiltersModule } from "../universalFilters/UniversalFiltersModule.jsx";
import { PartnerLeadsView } from "./PartnerLeadsView.jsx";
import { PartnerDocumentsView } from "./PartnerDocumentsView.jsx";
import { PartnerDealRecordsView } from "./PartnerDealRecordsView.jsx";
import { PartnerAgeingReportView } from "./PartnerAgeingReportView.jsx";
import { PartnerOutreachView } from "./PartnerOutreachView.jsx";
import { AuthShell } from "../auth/LoginPage.jsx";
import logoUrl from "../../assets/global-capital-logo.png";
import {
  ClockIcon,
  FolderIcon,
  FunnelIcon,
  GridIcon,
  LinkIcon,
  LogOutIcon,
  MailIcon,
  NoteIcon,
  PhoneIcon,
  RadarIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon
} from "../Icons.jsx";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";
const linkClass = "text-[13px] font-medium text-[#3046b2] hover:underline";
const primaryButtonClass =
  "w-full rounded-[12px] bg-[#1b295f] px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#142050] disabled:cursor-not-allowed disabled:opacity-60";

const partnerIconMap = {
  dashboard: GridIcon,
  "crm-workspace": UsersIcon,
  email: MailIcon,
  "cold-bulk-mailing": MailIcon,
  "deal-records": FolderIcon,
  nda: ShieldIcon,
  meetings: PhoneIcon,
  "data-room": FolderIcon,
  ioi: NoteIcon,
  "visit-planning": RadarIcon,
  "field-visit": UserCheckIcon,
  "term-sheet": LinkIcon,
  "ageing-report": ClockIcon,
  leads: SendIcon,
  "market-intelligence": SparklesIcon,
  "universal-filters": FunnelIcon
};

function PartnerLoginView({ onForgot }) {
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
      <h1 className="text-[26px] font-semibold leading-tight text-[#102246]">Partner sign in</h1>
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
          <div className="mb-1.5 flex items-baseline justify-between">
            <label className={labelClass + " mb-0"}>Password</label>
            <button type="button" onClick={onForgot} className={linkClass}>Forgot password?</button>
          </div>
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

// Mirrors LoginPage.jsx's ForgotPasswordView/ResetPasswordView one level
// down (channelPartnerPortalAuthApi instead of authApi) — kept as its own
// copy rather than a shared component, same reasoning as PartnerLoginView
// above: this portal's auth is deliberately self-contained, never coupled
// to the staff app's.
function PartnerForgotPasswordView({ onBack }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await channelPartnerPortalAuthApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <h1 className="text-[26px] font-semibold text-[#102246]">Check your email</h1>
        <p className="mt-2 text-[14px] text-[#5f6f89]">If that address has an account</p>
        <p className="mt-6 rounded-[12px] bg-[#eef7f1] px-4 py-3 text-[13px] leading-6 text-[#2b7a4b]">
          We've sent a reset link to <strong>{email}</strong>. It's valid for 60 minutes and can only be used once.
        </p>
        <p className="mt-4 text-[12px] leading-5 text-[#8592ab]">
          Nothing arrived? Check spam, or ask Global Capital BV to reset it for you from Admin Panel → Channel Partners.
        </p>
        <button type="button" onClick={onBack} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold text-[#102246]">Forgot password</h1>
      <p className="mt-2 text-[14px] text-[#5f6f89]">We'll email you a reset link</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" required autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@partner.com" />
        </div>
        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <button type="button" onClick={onBack} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
    </AuthShell>
  );
}

function PartnerResetPasswordView({ token, onDone }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await channelPartnerPortalAuthApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <h1 className="text-[26px] font-semibold text-[#102246]">Password updated</h1>
        <p className="mt-2 text-[14px] text-[#5f6f89]">You can sign in now</p>
        <p className="mt-6 rounded-[12px] bg-[#eef7f1] px-4 py-3 text-center text-[13px] leading-6 text-[#2b7a4b]">
          Taking you back to sign in…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold text-[#102246]">Choose a new password</h1>
      <p className="mt-2 text-[14px] text-[#5f6f89]">At least 8 characters</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className={labelClass}>New password</label>
          <input type="password" required minLength={8} autoFocus className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Confirm new password</label>
          <input type="password" required minLength={8} className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      <button type="button" onClick={onDone} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
    </AuthShell>
  );
}

// Extra top-level sections beyond Email Automation (always shown) — each
// is a separate top-level module in the staff app (App.jsx), not a tab
// inside EmailOutreachModule like Segments/Templates/AI Agent are, so they
// need their own nav entries here rather than more visibleTabs ids.
// matchIds (instead of a single id) is for Deal Records, which folds NDA/
// IOI/Visit Planning into one section with internal tabs rather than three
// separate nav entries -- shown if ANY of the three is granted, and the
// component itself (via the permissions prop below) only renders tabs for
// the ones actually granted.
const EXTRA_SECTIONS = [
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach", Component: PartnerLeadsView },
  {
    id: "deal-records",
    label: "Deal Records",
    group: "Relationships",
    matchIds: ["nda", "ioi", "visit-planning", "meetings", "field-visit", "term-sheet"],
    Component: PartnerDealRecordsView
  },
  { id: "data-room", label: "Data Room", group: "Relationships", Component: PartnerDocumentsView },
  { id: "ageing-report", label: "Ageing Report", group: "Relationships", Component: PartnerAgeingReportView },
  { id: "leads", label: "Outreach / DOE", group: "Intelligence", Component: PartnerOutreachView },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence", Component: MarketIntelligenceModule },
  // Zero-wrapper reuse of the staff component directly -- it takes no
  // props, has no edit/write affordances, and the backend already scopes
  // everything it returns to this partner's own referred leads (see
  // leadOwnerWhereClause in universalFilters.js).
  { id: "universal-filters", label: "Universal Filters", group: "Intelligence", Component: UniversalFiltersModule }
];

function PartnerSidebar({ sections, activeSection, onChange }) {
  return (
    <aside className="hidden bg-[#1b295f] text-white md:block">
      <div className="flex min-h-screen flex-col p-4">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center overflow-hidden rounded-2xl bg-white">
            <img src={logoUrl} alt="Global Capital BV" className="size-7 object-contain" />
          </div>
          <div>
            <p className="text-[15px] font-semibold">Global Capital BV</p>
            <p className="text-[13px] text-white/65">Channel Partner OS</p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-[14px] bg-white/8 px-4 py-3 text-white/70">
          <SearchIcon className="size-4" />
          <input
            type="text"
            placeholder="Search modules"
            className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/50"
          />
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-3 px-2 text-[11px] uppercase tracking-[0.22em] text-white/36">{section.title}</p>
              <nav className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = partnerIconMap[item.id] ?? GridIcon;
                  const active = item.id === activeSection;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-[14px] transition ${
                        active ? "bg-[#2a3c82] text-white" : "text-white/90 hover:bg-white/6"
                      }`}
                    >
                      <span className={`grid size-7 place-items-center rounded-xl ${active ? "bg-[#2fa84f]" : "bg-white/8"}`}>
                        <Icon className="size-[15px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[16px] border border-white/8 bg-white/6 px-4 py-3">
          <p className="text-[13px] font-medium">Strategic Investments,</p>
          <p className="text-[13px] text-white/70">Sustainable Growth</p>
        </div>
      </div>
    </aside>
  );
}

function PartnerTopBar({ partnerUser, onLogout }) {
  const initials = (partnerUser?.channelPartner?.name ?? partnerUser?.email ?? "CP")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="border-b border-[#d9e2ef] bg-[#f7f9fc] px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" className="grid size-8 place-items-center rounded-lg text-[#26354c]">
            <GridIcon className="size-4" />
          </button>
          <p className="text-[15px] font-semibold text-[#18263e]">Global Capital BV</p>
          <span className="rounded-full bg-[#d9f4df] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#179150]">
            Partner Portal
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium leading-tight text-[#18263e]">{partnerUser.channelPartner.name}</p>
            <p className="text-[11px] leading-tight text-[#8592ab]">{partnerUser.email}</p>
          </div>
          <div className="grid size-9 place-items-center rounded-full bg-[#2d47aa] text-sm font-semibold text-white">
            {initials}
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Log out"
            className="grid size-9 place-items-center rounded-full border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
          >
            <LogOutIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PartnerShell() {
  const { partnerUser, logout } = useChannelPartnerAuth();
  const [section, setSection] = useState("email");
  const permissions = partnerUser.permissions ?? [];
  const grantedExtraSections = EXTRA_SECTIONS.filter((s) => (s.matchIds ?? [s.id]).some((id) => permissions.includes(id)));
  const activeSection = grantedExtraSections.find((s) => s.id === section);
  const ActiveExtraSection = activeSection?.Component ?? null;
  const navSections = [
    { title: "CRM & Outreach", items: [{ id: "email", label: "Email Automation" }, ...grantedExtraSections.filter((s) => s.group === "CRM & Outreach")] },
    { title: "Intelligence", items: grantedExtraSections.filter((s) => s.group === "Intelligence") },
    { title: "Relationships", items: grantedExtraSections.filter((s) => s.group === "Relationships") }
  ].filter((navSection) => navSection.items.length);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#12213a]">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <PartnerSidebar sections={navSections} activeSection={section} onChange={setSection} />

        <main className="min-w-0">
          <PartnerTopBar partnerUser={partnerUser} onLogout={logout} />

          <div className="space-y-6 p-6">
            {ActiveExtraSection ? (
              <ActiveExtraSection permissions={permissions} />
            ) : (
              <EmailOutreachModule
                initialTab="dashboard"
                visibleTabs={["dashboard", "campaigns", "leads", ...(permissions.includes("cold-bulk-mailing") ? ["templates"] : [])]}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ChannelPartnerPortalShell() {
  const { partnerUser, loading } = useChannelPartnerAuth();
  // A reset link lands on /partner?reset=<token> — same "just another view
  // of this same screen" approach as LoginPage.jsx, since this SPA has no
  // router either.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));
  const [view, setView] = useState(() => (resetToken ? "reset" : "login"));

  const clearResetParam = () => {
    window.history.replaceState({}, "", window.location.pathname);
    setResetToken(null);
  };

  if (loading) return null;
  if (partnerUser) return <PartnerShell />;
  if (view === "forgot") return <PartnerForgotPasswordView onBack={() => setView("login")} />;
  if (view === "reset" && resetToken) {
    return (
      <PartnerResetPasswordView
        token={resetToken}
        onDone={() => {
          clearResetParam();
          setView("login");
        }}
      />
    );
  }
  return <PartnerLoginView onForgot={() => setView("forgot")} />;
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
