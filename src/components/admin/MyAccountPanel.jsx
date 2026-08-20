import { useState } from "react";
import { authApi } from "../../lib/authApi";
import { useAuth } from "../../context/AuthContext";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { LockIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

export function MyAccountPanel() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ ok: true, text: "Password updated." });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="px-5 py-5">
      <SectionTitle icon={LockIcon} iconClass="text-[#3046b2]" subtitle="Signed in as your account below.">
        My Account
      </SectionTitle>

      <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-[#e7edf5] px-4 py-3">
        <div>
          <p className="text-[14px] font-medium text-[#102246]">{user?.name}</p>
          <p className="text-[12px] text-[#8592ab]">{user?.email}</p>
        </div>
        <Badge tone={user?.role === "ADMIN" ? "violet" : "slate"}>{user?.role === "ADMIN" ? "Admin" : "Employee"}</Badge>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 max-w-sm space-y-4">
        <div>
          <label className={labelClass}>Current password</label>
          <input required type="password" className={inputClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>New password</label>
          <input required type="password" minLength={8} className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        {message ? (
          <p className={`text-[13px] font-medium ${message.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{message.text}</p>
        ) : null}
        <ActionButton label={saving ? "Updating…" : "Update password"} primary small onClick={handleSubmit} disabled={saving} />
      </form>
    </Card>
  );
}
