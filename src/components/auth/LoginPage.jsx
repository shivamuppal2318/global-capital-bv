import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { LockIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

export function LoginPage() {
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
    <div className="grid min-h-screen place-items-center bg-[#1b295f] px-4">
      <div className="w-full max-w-[400px] rounded-[24px] bg-white p-8 shadow-[0_20px_60px_rgba(10,20,50,0.35)]">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#ebf6ef]">
            <div className="grid size-9 place-items-center rounded-full bg-white text-[13px] font-bold text-[#2b9b60]">GC</div>
          </div>
          <h1 className="mt-4 text-[19px] font-semibold text-[#102246]">Global Capital BV</h1>
          <p className="text-[13px] text-[#8592ab]">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className={labelClass}>Email</label>
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
      </div>
    </div>
  );
}
