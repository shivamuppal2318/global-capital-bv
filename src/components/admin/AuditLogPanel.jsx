import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { Card, SectionTitle, noteToneClass } from "../ui";
import { ShieldIcon } from "../Icons";

// One tone per action namespace (the part before the first ".") — enough to
// scan a page of rows at a glance without a legend. Falls back to slate for
// any namespace not listed here, rather than crashing on an unmapped one.
const namespaceTone = {
  auth: "violet",
  employee: "blue",
  campaign: "green",
  mailbox: "amber",
  lead: "red",
  ai_settings: "indigo",
  market_intel_settings: "cyan",
  system_email: "sky",
  document: "violet"
};

function toneFor(action) {
  const namespace = action.split(".")[0];
  return namespaceTone[namespace] ?? "slate";
}

function formatWhen(dateString) {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Real, append-only history of who did what — logins, admin actions
// (employee/permission/credential changes), and MailX's higher-stakes
// actions (campaigns, mailboxes, lead deletion). Written server-side (see
// server/src/lib/auditLog.js); this panel is read-only by design — there's
// no edit/delete here, since an audit trail you can rewrite isn't one.
export function AuditLogPanel() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [actionFilter, setActionFilter] = useState("");
  const [availableActions, setAvailableActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi.auditLogActions().then(setAvailableActions).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    adminApi
      .auditLogs({ page, pageSize, action: actionFilter || undefined })
      .then((result) => {
        setRows(result.rows);
        setTotal(result.total);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, pageSize, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={ShieldIcon}
        subtitle="Every login, admin change, and higher-stakes MailX action — read-only, written automatically as they happen."
        action={
          <select
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value);
              setPage(1);
            }}
            className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#334463] outline-none"
          >
            <option value="">All actions</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        }
      >
        Audit log
      </SectionTitle>

      {error ? (
        <p className="mt-5 text-[13px] text-[#c94b6b]">Could not load the audit log ({error}).</p>
      ) : loading ? (
        <p className="mt-5 text-[13px] text-[#9aa6ba]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-[13px] text-[#9aa6ba]">No matching activity yet.</p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-[16px] border border-[#e7edf5]">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <thead className="border-b border-[#e7edf5] bg-[#f8faff] text-[12px] uppercase tracking-[0.1em] text-[#8593ac]">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f9]">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-[#8593ac]">{formatWhen(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#102246]">{row.actorName}</p>
                      <p className="text-[12px] text-[#8593ac]">{row.actorEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[toneFor(row.action)]}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="max-w-sm px-4 py-3 text-[#435471]">{row.detail ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[#8593ac]">{row.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#5f6f89]">
            <p>
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471] disabled:opacity-40"
              >
                Prev
              </button>
              <span className="min-w-[5rem] text-center text-[12px]">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-[8px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
