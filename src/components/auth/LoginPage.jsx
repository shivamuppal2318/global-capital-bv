import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/authApi";
import { LockIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";
const linkClass = "text-[13px] font-medium text-[#3046b2] hover:underline";

function Shell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#1b295f] px-4">
      <div className="w-full max-w-[400px] rounded-[24px] bg-white p-8 shadow-[0_20px_60px_rgba(10,20,50,0.35)]">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#ebf6ef]">
            <div className="grid size-9 place-items-center rounded-full bg-white text-[13px] font-bold text-[#2b9b60]">GC</div>
          </div>
          <h1 className="mt-4 text-[19px] font-semibold text-[#102246]">{title}</h1>
          <p className="text-[13px] text-[#8592ab]">{subtitle}</p>
        </div>
        {children}
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
    <Shell title="Global Capital BV" subtitle="Sign in to your workspace">
      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" required autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label className={labelClass + " mb-0"}>Password</label>
            <button type="button" onClick={onForgot} className={linkClass}>Forgot password?</button>
          </div>
          <input type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#3046b2] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-[#25348a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LockIcon className="size-4" />
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12px] text-[#9aa6bd]">
        No account yet? Ask an admin to add you from Admin Panel → Employees.
      </p>
    </Shell>
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
      <Shell title="Check your email" subtitle="If that address has an account">
        <p className="mt-6 rounded-[12px] bg-[#eef7f1] px-4 py-3 text-[13px] leading-6 text-[#2b7a4b]">
          We've sent a reset link to <strong>{email}</strong>. It's valid for 60 minutes and can only be used once.
        </p>
        <p className="mt-4 text-[12px] leading-5 text-[#8592ab]">
          Nothing arrived? Check spam, or ask an admin to reset it for you from Admin Panel → Employees.
        </p>
        <button type="button" onClick={onBack} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
      </Shell>
    );
  }

  return (
    <Shell title="Forgot password" subtitle="We'll email you a reset link">
      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" required autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[14px] bg-[#3046b2] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-[#25348a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <button type="button" onClick={onBack} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
    </Shell>
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
      <Shell title="Password updated" subtitle="You can sign in now">
        <p className="mt-6 rounded-[12px] bg-[#eef7f1] px-4 py-3 text-center text-[13px] leading-6 text-[#2b7a4b]">
          Taking you back to sign in…
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" subtitle="At least 8 characters">
      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <div>
          <label className={labelClass}>New password</label>
          <input type="password" required minLength={8} autoFocus className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Confirm new password</label>
          <input type="password" required minLength={8} className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error ? <p className="rounded-[12px] bg-[#fdeceb] px-3.5 py-2.5 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[14px] bg-[#3046b2] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-[#25348a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      <button type="button" onClick={onDone} className={`${linkClass} mt-6 block w-full text-center`}>Back to sign in</button>
    </Shell>
  );
}
