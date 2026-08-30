import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/authApi";
import { ShieldIcon, LockIcon, GlobeIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";
const linkClass = "text-[13px] font-medium text-[#3046b2] hover:underline";
const primaryButtonClass =
  "w-full rounded-[12px] bg-[#1b295f] px-5 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#142050] disabled:cursor-not-allowed disabled:opacity-60";

const FEATURE_POINTS = [
  { icon: ShieldIcon, title: "Governed", desc: "Stage-gated approvals" },
  { icon: LockIcon, title: "Secure", desc: "Audited data rooms" },
  { icon: GlobeIcon, title: "Global", desc: "14 markets covered" }
];

// Shared split-screen frame for every auth view (sign in / forgot / reset)
// — a real form on the left, the product's own pitch on the right, so the
// first thing anyone sees still says what Global Capital BV's platform is
// for, not just a bare login box.
function AuthShell({ children }) {
  return (
    <div className="grid min-h-screen bg-[#f7f9fc] lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#ebf6ef]">
              <div className="grid size-7 place-items-center rounded-full bg-white text-[12px] font-bold text-[#2b9b60]">GC</div>
            </div>
            <p className="text-[14px] font-semibold text-[#102246]">Global Capital BV</p>
          </div>
          {children}
        </div>
      </div>

      <div className="hidden flex-col justify-between bg-[#1b295f] px-12 py-16 text-white lg:flex">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-white/50">Global Capital BV</p>
          <h2 className="mt-6 text-[2.5rem] font-semibold leading-[1.15] tracking-[-0.02em]">
            One operating system from opportunity discovery to portfolio monitoring.
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-white/70">
            Twenty-four governed stages covering lead intelligence, NDA execution, secure data rooms, KYC, AI due
            diligence, valuation, term sheets, funding and impact reporting.
          </p>
        </div>

        <div className="border-t border-white/15 pt-8">
          <div className="grid grid-cols-3 gap-6">
            {FEATURE_POINTS.map(({ icon: Icon, title, desc }) => (
              <div key={title}>
                <Icon className="size-5 text-[#2fa84f]" />
                <p className="mt-3 text-[14px] font-semibold text-white">{title}</p>
                <p className="mt-1 text-[13px] leading-5 text-white/60">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  // A reset link lands on the app root as /?reset=<token>, so the reset
  // form is just another view of this screen rather than a separate route
  // (the app has no router).
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset"));
  const [view, setView] = useState(() => (resetToken ? "reset" : "login"));

  const clearResetParam = () => {
    window.history.replaceState({}, "", window.location.pathname);
    setResetToken(null);
  };

  if (view === "forgot") return <ForgotPasswordView onBack={() => setView("login")} />;
  if (view === "reset" && resetToken) {
    return (
      <ResetPasswordView
        token={resetToken}
        onDone={() => {
          clearResetParam();
          setView("login");
        }}
      />
    );
  }
  return <LoginView onForgot={() => setView("forgot")} />;
}

function LoginView({ onForgot }) {
  const { login } = useAuth();
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
      <h1 className="text-[26px] font-semibold leading-tight text-[#102246]">AI Funding &amp; Investment OS</h1>
      <p className="mt-2 text-[14px] leading-6 text-[#5f6f89]">
        Strategic Intelligence. Disciplined Execution. Sustainable Growth.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className={labelClass}>Corporate email</label>
          <input
            type="email"
            required
            autoFocus
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
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

        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Signing in…" : "Sign in securely"}
        </button>
      </form>

      <p className="mt-4 text-[12px] leading-5 text-[#8592ab]">Access is monitored and logged.</p>
    </AuthShell>
  );
}

function ForgotPasswordView({ onBack }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
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
          Nothing arrived? Check spam, or ask an admin to reset it for you from Admin Panel → Employees.
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
          <label className={labelClass}>Corporate email</label>
          <input type="email" required autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
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

function ResetPasswordView({ token, onDone }) {
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
      await authApi.resetPassword(token, newPassword);
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
