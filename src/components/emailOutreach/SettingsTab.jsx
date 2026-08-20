import { ActionButton } from "../ui.jsx";
import { PlusIcon, CogIcon } from "../Icons.jsx";

// Mailbox (SMTP account) management — separated out from Campaigns so
// adding/rotating sending mailboxes doesn't compete for space with the
// campaign list and lead intake.
export function SettingsTab({ mailing }) {
  const { emailAccounts, newAccountForm, setNewAccountForm, handleAddEmailAccount, handleDeactivateAccount, automationNotice } = mailing;

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <CogIcon className="size-5 text-[#5f6f89]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Sending mailboxes</h2>
        </div>
        <p className="mt-1 pl-8 text-[14px] text-[#5f6f89]">
          Register as many SMTP accounts as you need; assign one to a campaign from the Campaigns tab (or leave it on the default).
        </p>

        {emailAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {emailAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e7edf5] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[#102246]">{account.label}</p>
                  <p className="truncate text-[12px] text-[#6a7790]">
                    {account.fromAddress} · {account.smtpHost} · {account.dailyLimit}/day
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      account.isActive ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                    }`}
                  >
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                  {account.isActive ? (
                    <button
                      type="button"
                      onClick={() => handleDeactivateAccount(account.id)}
                      className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">No mailboxes added yet — add one below.</p>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            placeholder="Label (e.g. Rahul's mailbox)"
            value={newAccountForm.label}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="From address"
            type="email"
            value={newAccountForm.fromAddress}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, fromAddress: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP host"
            value={newAccountForm.smtpHost}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpHost: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="Port (e.g. 465 or 587)"
            value={newAccountForm.smtpPort}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPort: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP username"
            value={newAccountForm.smtpUser}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpUser: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP password"
            type="password"
            value={newAccountForm.smtpPass}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPass: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="Daily limit (e.g. 500)"
            value={newAccountForm.dailyLimit}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, dailyLimit: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <label className="flex items-center gap-2 text-[13px] text-[#5f6f89]">
            <input
              type="checkbox"
              checked={newAccountForm.smtpSecure}
              onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
            />
            Use implicit TLS (port 465)
          </label>
        </div>
        <div className="mt-3">
          <ActionButton label="Add mailbox" icon={PlusIcon} primary onClick={handleAddEmailAccount} />
        </div>
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}
