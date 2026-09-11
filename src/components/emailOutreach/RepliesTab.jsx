import { useEffect, useState } from "react";
import { ActionButton, noteToneClass } from "../ui.jsx";
import { UsersIcon, InboxIcon, UserCheckIcon } from "../Icons.jsx";

const callStatusToneClass = {
  booked: "bg-[#dff2ff] text-[#2995db]",
  completed: "bg-[#dff5e7] text-[#2b9b60]",
  canceled: "bg-[#ffe4ee] text-[#ef5b8f]"
};

const replyTypeToneClass = {
  interested: noteToneClass.green,
  "zoom-request": noteToneClass.indigo,
  "info-request": noteToneClass.amber,
  // A real reply that didn't match a recognized keyword — genuinely
  // different from "no-reply" (nothing back at all), so it gets its own
  // neutral tone rather than reusing the "still waiting" amber.
  other: noteToneClass.slate,
  "no-reply": noteToneClass.amber
};

function initialsOf(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

// A focused popup for one lead's full detail, opened from a table row — the
// table itself only has room for a scannable summary (name, reply, stage,
// last reply), everything else (email, campaign, every badge, the full
// reply text, activity history) lives here instead of being crammed into
// the row or the narrower inline panel next to the table.
function LeadDetailModal({ lead, timeline, onClose, converting, convertResult, onConvert }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!lead) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f1f3d]/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-[22px] border border-[#d6deea] bg-white shadow-[0_20px_60px_rgba(15,31,61,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e7edf5] px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[15px] font-semibold text-[#4766cc]">
              {initialsOf(lead.name)}
            </div>
            <div>
              <p className="text-[18px] font-semibold text-[#102246]">{lead.name}</p>
              <p className="mt-1 text-[14px] text-[#5f6f89]">{lead.company}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Owner {lead.owner}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-[10px] text-[#8592ab] transition hover:bg-[#f4f7fb] hover:text-[#102246]"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${replyTypeToneClass[lead.replyType] ?? noteToneClass.amber}`}>
              {lead.replyType}
            </span>
            <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-semibold text-[#4766cc]">{lead.stage}</span>
            {lead.campaign ? (
              <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">{lead.campaign}</span>
            ) : null}
            {lead.bounced ? (
              <span className="rounded-full bg-[#ffe4ee] px-2.5 py-1 text-[11px] font-semibold text-[#ef5b8f]">Bounced</span>
            ) : null}
            {lead.unsubscribed ? (
              <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">Unsubscribed</span>
            ) : null}
            {lead.callStatus ? (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${callStatusToneClass[lead.callStatus]}`}>
                Call {lead.callStatus}
              </span>
            ) : null}
            <span className="ml-auto" />
            {lead.convertedToLeadId ? (
              <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-semibold text-[#4766cc]">Converted to CRM Lead</span>
            ) : (
              <ActionButton
                label={converting ? "Converting…" : "Convert to Lead"}
                icon={UserCheckIcon}
                onClick={() => onConvert(lead)}
                disabled={converting}
              />
            )}
          </div>

          {!lead.convertedToLeadId ? (
            <p className="mt-2 text-[12px] text-[#8592ab]">
              Creates a tracked CRM deal for {lead.company} and emails them the client portal registration link.
            </p>
          ) : null}

          {convertResult ? (
            <div className="mt-3 rounded-[12px] border border-[#e7edf5] bg-[#f7f9fc] px-4 py-3 text-[13px]">
              {convertResult.ok ? (
                convertResult.sent ? (
                  <p className="text-[#2a9c60]">Converted to a CRM lead — portal invite emailed to {lead.email}.</p>
                ) : (
                  <div>
                    <p className="text-[#c47f1a]">Converted to a CRM lead, but the invite wasn't emailed — {convertResult.reason} Copy the link below and send it manually:</p>
                    <p className="mt-1.5 break-all rounded-[8px] bg-white px-3 py-2 font-mono text-[12px] text-[#3046b2]">
                      {convertResult.inviteUrl}
                    </p>
                  </div>
                )
              ) : (
                <p className="text-[#e0483f]">{convertResult.error}</p>
              )}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Email</p>
              <p className="mt-1 text-[14px] font-medium text-[#102246]">{lead.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Country</p>
              <p className="mt-1 text-[14px] font-medium text-[#102246]">{lead.country ?? "—"}</p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Last reply</p>
              <p className="mt-1 text-[14px] font-medium text-[#102246]">{lead.lastReplyAt}</p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">NDA signed</p>
              <p className="mt-1 text-[14px] font-medium text-[#102246]">{lead.ndaSignedAt ? new Date(lead.ndaSignedAt).toLocaleString() : "Not yet"}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#f8faff] px-4 py-3">
            <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">Reply</p>
            <p className="mt-2 text-[14px] leading-6 text-[#334463]">{lead.replyPreview}</p>
          </div>

          <div className="mt-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Activity timeline</p>
            <div className="mt-4 space-y-4">
              {timeline.length === 0 ? (
                <p className="text-[14px] text-[#8592ab]">No activity recorded yet.</p>
              ) : (
                timeline.map((event, index) => (
                  <div key={`${event.at}-${event.title}-${index}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#3046b2]" />
                      {index !== timeline.length - 1 ? <span className="mt-2 h-full w-px bg-[#d9e2ef]" /> : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[14px] font-semibold text-[#102246]">{event.title}</p>
                        <span className="text-[12px] text-[#6a7790]">{event.at}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-5 text-[#435471]">{event.detail}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The roster of leads who've replied to a bulk campaign — split out of
// LeadsTab.jsx (which is just lead intake) so it has its own focused screen
// instead of stacking under the leads table. Reply-based follow-up
// send/detail lives in AutomatedTemplatesTab.jsx and the row's detail popup.
export function RepliesTab({ mailing, selectedAccountId }) {
  const {
    repliedLeads: allRepliedLeads, selectedLeadId, selectedLead, selectedLeadTimeline, loadLeadIntoWorkflow, handleDeleteLead,
    simulateIncomingReply,
    convertingLeadId, convertResults, handleConvertToLead
  } = mailing;

  // Same "Choose Account" filter the Inbox table above already respects —
  // without this, picking a specific mailbox there left this section still
  // showing every replied lead regardless, which looked like the filter
  // hadn't actually applied to anything. A reply with no recorded
  // emailAccountId (from before that tracking existed, or from the inbound
  // webhook/simulate-reply paths, neither tied to a specific mailbox) only
  // shows under "All mailboxes", same convention as the Inbox table.
  const repliedLeads = selectedAccountId
    ? allRepliedLeads.filter((lead) => lead.emailAccountId === selectedAccountId)
    : allRepliedLeads;

  // Just a "which row is the popup open for" flag — the popup's actual
  // content always reads from `selectedLead`/`selectedLeadTimeline` above.
  const [detailOpenId, setDetailOpenId] = useState(null);

  function openRow(lead) {
    loadLeadIntoWorkflow(lead);
    setDetailOpenId(lead.id);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[#102246]">Replies ready for follow-up</p>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              {repliedLeads.length} companies replied and are ready for a personalized follow-up.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              {repliedLeads.filter((lead) => lead.movedToWorkflow).length} in follow-up
            </span>
            <ActionButton label="Simulate reply" icon={UsersIcon} onClick={simulateIncomingReply} />
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <InboxIcon className="size-5 text-[#4766cc]" />
              <h2 className="text-[16px] font-semibold text-[#102246]">Replied leads</h2>
            </div>
            <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
              From bulk campaigns
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead className="border-b border-[#e7edf5] bg-white text-[13px] font-medium text-[#8593ac]">
              <tr>
                <th className="px-5 py-3.5 font-medium">Lead</th>
                <th className="px-5 py-3.5 font-medium">Reply</th>
                <th className="px-5 py-3.5 font-medium">Stage</th>
                <th className="px-5 py-3.5 font-medium">Last reply</th>
                <th className="px-5 py-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf5]">
              {repliedLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => openRow(lead)}
                  className={`group cursor-pointer bg-white transition hover:bg-[#f8faff] ${
                    selectedLeadId === lead.id ? "bg-[#f5f8fd]" : ""
                  }`}
                >
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[12px] font-semibold text-[#4766cc]">
                        {initialsOf(lead.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[#102246]">{lead.name}</p>
                        <p className="mt-0.5 truncate text-[13px] text-[#5f6f89]">{lead.company}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${replyTypeToneClass[lead.replyType] ?? noteToneClass.amber}`}>
                      {lead.replyType}
                    </span>
                    {lead.bounced ? (
                      <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-[#ffe4ee] px-2.5 py-1 text-[11px] font-semibold text-[#ef5b8f]">
                        Bounced
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 align-top whitespace-nowrap text-[#435471]">{lead.stage}</td>
                  <td className="px-5 py-4 align-top whitespace-nowrap text-[#5f6f89]">{lead.lastReplyAt}</td>
                  <td className="px-5 py-4 align-top text-right">
                    <button
                      type="button"
                      title="Delete lead"
                      aria-label="Delete lead"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm(`Delete ${lead.name} (${lead.company})? This also removes their reply/activity history.`)) {
                          handleDeleteLead(lead);
                        }
                      }}
                      className="grid size-7 place-items-center rounded-[8px] text-[#c7cedb] opacity-0 transition group-hover:opacity-100 hover:bg-[#fdecf1] hover:text-[#a13a56]"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {repliedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[14px] text-[#8592ab]">
                    No replies yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {detailOpenId ? (
        <LeadDetailModal
          lead={selectedLead}
          timeline={selectedLeadTimeline}
          onClose={() => setDetailOpenId(null)}
          converting={selectedLead && convertingLeadId === selectedLead.id}
          convertResult={selectedLead ? convertResults[selectedLead.id] : null}
          onConvert={handleConvertToLead}
        />
      ) : null}
    </section>
  );
}
