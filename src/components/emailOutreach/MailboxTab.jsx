import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../ui.jsx";
import { RefreshIcon, CogIcon, InboxIcon, SearchIcon, PlusIcon, CheckCircleIcon } from "../Icons.jsx";
import { emailAccountsApi } from "../../lib/emailAccountsApi.js";
import { RepliesTab } from "./RepliesTab.jsx";

export function MailboxTab({ mailing, onNavigateTab }) {
  const { emailAccounts, repliedLeads, handleAddEmailAccount, newAccountForm, setNewAccountForm } = mailing;
  // Same "test it right away, don't make the DOE guess" discipline as
  // Settings' own mailbox form (see SettingsTab.jsx) — this quick-setup
  // shortcut is the one a DOE hits first, before ever seeing the full
  // Settings screen, so it needs the same real pass/fail feedback.
  const [quickSetupResult, setQuickSetupResult] = useState(null);
  async function handleQuickAddMailbox() {
    setQuickSetupResult(null);
    const account = await handleAddEmailAccount();
    if (!account) return;
    setQuickSetupResult({ pending: true });
    try {
      setQuickSetupResult(await emailAccountsApi.test(account.id));
    } catch (err) {
      setQuickSetupResult({ success: false, message: err.message });
    }
  }
  const [activeMailboxTab, setActiveMailboxTab] = useState("inbox");
  const [searchText, setSearchText] = useState("");
  // Which mailbox's inbox to show — "" means all of them combined. Matched
  // against each lead's lastReplyEmailAccountId (see emailLeads.js's
  // attachScore), which is only set for a reply the IMAP poller actually
  // fetched from a specific mailbox (null for a webhook/simulated reply, so
  // those only show up under "All mailboxes").
  const [selectedAccountId, setSelectedAccountId] = useState("");
  // Real IMAP poller status — replaces a client-side-only fake timestamp.
  // Both "Fetch Now" and "Fetch Diagnostics" below are driven by this.
  const [imapStatus, setImapStatus] = useState(null);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchNotice, setFetchNotice] = useState(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  function refreshImapStatus() {
    emailAccountsApi
      .imapStatus()
      .then(setImapStatus)
      .catch(() => {
        // Backend unreachable — leave whatever was already loaded.
      });
  }

  useEffect(() => {
    refreshImapStatus();
  }, []);

  async function handleFetchNow() {
    setFetchBusy(true);
    setFetchNotice(null);
    try {
      const result = await emailAccountsApi.fetchNow();
      setFetchNotice(`Fetched just now — ${result.processedCount} real repl${result.processedCount === 1 ? "y" : "ies"} imported.`);
    } catch (error) {
      setFetchNotice(`Fetch failed: ${error.message}`);
    } finally {
      setFetchBusy(false);
      refreshImapStatus();
    }
  }

  const inboxRows = useMemo(
    () =>
      repliedLeads.map((lead, index) => ({
        id: lead.id ?? `reply-${index}`,
        from: lead.name || lead.email || "Unknown sender",
        subject: lead.replySummary || `Reply from ${lead.company || lead.email || "lead"}`,
        received: lead.lastReplyAt || "Just now",
        bounced: Boolean(lead.bounced),
        emailAccountId: lead.emailAccountId ?? null
      })),
    [repliedLeads]
  );

  const accountFilteredRows = selectedAccountId
    ? inboxRows.filter((row) => row.emailAccountId === selectedAccountId)
    : inboxRows;

  const visibleRows = accountFilteredRows.filter((row) => {
    const haystack = `${row.from} ${row.subject} ${row.received}`.toLowerCase();
    return haystack.includes(searchText.trim().toLowerCase());
  });

  const bounceRows = visibleRows.filter((row) => row.bounced);
  const rows = activeMailboxTab === "bounces" ? bounceRows : visibleRows;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleFetchNow}
            disabled={fetchBusy || !imapStatus?.enabled}
            className="rounded-[10px] bg-[#3046b2] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(48,70,178,0.22)] disabled:opacity-50"
          >
            {fetchBusy ? "Fetching…" : "Fetch Now"}
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab?.("settings")}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#2d3553]"
          >
            <CogIcon className="size-4" />
            Mailbox Accounts
          </button>
          <button
            type="button"
            onClick={() => setDiagnosticsOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#2d3553]"
          >
            <RefreshIcon className="size-4" />
            {diagnosticsOpen ? "Hide Diagnostics" : "Fetch Diagnostics"}
          </button>
        </div>

        <span className="rounded-full bg-[#ff5172] px-3 py-1 text-[12px] font-semibold text-white">
          {rows.length} {activeMailboxTab === "bounces" ? "Bounces" : "Unread Mail"}
        </span>
      </div>

      {diagnosticsOpen ? (
        <div className="rounded-[16px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3 text-[13px]">
          {imapStatus ? (
            <>
              <p className={imapStatus.enabled ? "text-[#2b9b60]" : "text-[#c94b6b]"}>
                IMAP: {imapStatus.enabled
                  ? `configured — watching ${imapStatus.accounts?.length ?? 0} mailbox${(imapStatus.accounts?.length ?? 0) === 1 ? "" : "es"}`
                  : "not configured — add a mailbox in Settings, or set IMAP_HOST/SMTP_USER/SMTP_PASS"}
              </p>
              {imapStatus.accounts?.length ? (
                <ul className="mt-1.5 list-disc pl-4 text-[#5f6f89]">
                  {imapStatus.accounts.map((account) => (
                    <li key={account.user}>{account.user} on {account.host}</li>
                  ))}
                </ul>
              ) : null}
              {imapStatus.lastPoll ? (
                <>
                  <p className="mt-1.5 text-[#5f6f89]">
                    Last poll: {new Date(imapStatus.lastPoll.at).toLocaleString()} —{" "}
                    {imapStatus.lastPoll.error ? (
                      <span className="text-[#c94b6b]">failed: {imapStatus.lastPoll.error}</span>
                    ) : (
                      `${imapStatus.lastPoll.processedCount} real repl${imapStatus.lastPoll.processedCount === 1 ? "y" : "ies"} imported`
                    )}
                  </p>
                  {imapStatus.lastPoll.perAccount?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-[#8592ab]">
                      {imapStatus.lastPoll.perAccount.map((row) => (
                        <li key={row.label}>
                          {row.label}: {row.error ? <span className="text-[#c94b6b]">failed — {row.error}</span> : `${row.processedCount} imported`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 text-[#8592ab]">No poll has run yet since the backend started.</p>
              )}
            </>
          ) : (
            <p className="text-[#8592ab]">Loading…</p>
          )}
        </div>
      ) : null}

      <div className="rounded-[20px] border border-[#d7e7fb] bg-[linear-gradient(180deg,#f7fbff_0%,#f1f7ff_100%)] px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <p className="text-[13px] font-medium text-[#3867e8]">
          {fetchNotice ??
            (imapStatus?.lastPoll
              ? `Last real fetch: ${new Date(imapStatus.lastPoll.at).toLocaleString()} — ${imapStatus.lastPoll.processedCount} repl${imapStatus.lastPoll.processedCount === 1 ? "y" : "ies"} imported.`
              : "No fetch has run yet.")}
        </p>
        <div className="mt-3 space-y-1 text-[13px]">
          {emailAccounts.length ? (
            // Respects the Choose Account filter below — picking "Vimal"
            // there shouldn't leave every other mailbox still listed here
            // as if all of them were still in view.
            (selectedAccountId ? emailAccounts.filter((account) => account.id === selectedAccountId) : emailAccounts).map((account) => (
              <p key={account.id} className={account.isActive ? "text-[#3867e8]" : "text-[#ff5d5d]"}>
                {account.label}: {account.isActive ? "ready for fetch" : "inactive - skipped"}
              </p>
            ))
          ) : (
            <p className="text-[#ff5d5d]">No mailbox accounts connected yet. Add one to start fetching mail.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-[#d6deea] px-1">
        {["inbox", "bounces"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveMailboxTab(tab)}
            className={`border-b-2 px-2 py-2.5 text-[14px] font-medium capitalize ${activeMailboxTab === tab ? "border-[#8a95aa] text-[#23314f]" : "border-transparent text-[#6b7890]"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-[24px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[13px] font-medium text-[#6a7790]">Mailbox Accounts</span>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[13px] font-medium text-[#102246] outline-none"
            >
              <option value="">All mailboxes</option>
              {emailAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                  {account.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onNavigateTab?.("settings")}
              className="text-[12px] font-semibold text-[#5c6cff] hover:underline"
            >
              Manage
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-[12px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#5f6f89]">
            <SearchIcon className="size-4" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search..."
              className="w-32 bg-transparent outline-none"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[18px] border border-[#e7edf5] bg-[#f8faff]">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="bg-[#eef4fb] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                <th className="px-4 py-4">From</th>
                <th className="px-4 py-4">Subject</th>
                <th className="px-4 py-4">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#e7edf5] bg-white text-[14px] text-[#5d6286]">
                    <td className="px-4 py-4 font-medium text-[#102246]">{row.from}</td>
                    <td className="px-4 py-4">{row.subject}</td>
                    <td className="px-4 py-4">{row.received}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-4 py-5 text-[14px] text-[#7a7d9c]">
                    No messages.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RepliesTab mailing={mailing} selectedAccountId={selectedAccountId} />

      {!emailAccounts.length ? (
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold text-[#102246]">Quick mailbox setup</h3>
              <p className="mt-1 text-[13px] text-[#6a7790]">Yahin se first mailbox add kar do, phir inbox fetch screen kaam karegi.</p>
            </div>
            <ActionButton label="Open full settings" icon={CogIcon} small onClick={() => onNavigateTab?.("settings")} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input placeholder="Label" value={newAccountForm.label} onChange={(event) => setNewAccountForm((current) => ({ ...current, label: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
            <input placeholder="From address" type="email" value={newAccountForm.fromAddress} onChange={(event) => setNewAccountForm((current) => ({ ...current, fromAddress: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
            <input placeholder="SMTP host" value={newAccountForm.smtpHost} onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpHost: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
            <input placeholder="Port (465 or 587)" value={newAccountForm.smtpPort} onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPort: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
            <input placeholder="SMTP username" value={newAccountForm.smtpUser} onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpUser: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
            <input placeholder="SMTP password" type="password" value={newAccountForm.smtpPass} onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPass: event.target.value }))} className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none" />
          </div>
          <div className="mt-3">
            <ActionButton label="Add mailbox" icon={PlusIcon} primary onClick={handleQuickAddMailbox} />
          </div>
          {quickSetupResult ? (
            <p className={`mt-2 flex items-start gap-1.5 text-[13px] ${quickSetupResult.pending ? "text-[#6a7790]" : quickSetupResult.success ? "text-[#2b9b60]" : "text-[#c94b6b]"}`}>
              {quickSetupResult.success ? <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0" /> : null}
              {quickSetupResult.pending ? "Testing the connection…" : quickSetupResult.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
