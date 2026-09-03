import { useEffect, useState } from "react";
import { channelPartnersApi } from "../../lib/relationshipsApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { CheckCircleIcon, CopyIcon, LinkIcon, RefreshIcon, SlidersIcon } from "../Icons";
import { PermissionsEditor } from "./PermissionsEditor";

// Every Channel Partner Portal login, mirroring EmployeesPanel's structure
// (list, reveal-once reset-password, feature-access editor) — the same
// admin home staff logins have, for this other identity tier. Unlike
// Employees, there's no "create" form here: a portal account is only ever
// created when a partner signs the Channel Partner Agreement (see
// server/src/routes/channelPartnerAgreement.js) — this panel manages
// existing accounts, it doesn't mint new ones.
export function ChannelPartnerUsersPanel() {
  const [portalUsers, setPortalUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modules, setModules] = useState([]);
  const [editingAccessFor, setEditingAccessFor] = useState(null);
  // { portalUserId: { name, email, temporaryPassword } } — shown once,
  // right after a reset, then gone for good.
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [copied, setCopied] = useState(null);

  const load = () => {
    setLoading(true);
    channelPartnersApi
      .portalUsers()
      .then(setPortalUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    channelPartnersApi.optionalModules().then(setModules).catch(() => {});
  }, []);

  const handleSavePermissions = async (portalUserId, permissions) => {
    const updated = await channelPartnersApi.updatePortalUser(portalUserId, { permissions });
    setPortalUsers((prev) => prev.map((p) => (p.id === portalUserId ? updated : p)));
    setEditingAccessFor(null);
  };

  const handleToggleStatus = async (portalUser) => {
    await channelPartnersApi.updatePortalUser(portalUser.id, { status: portalUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
    load();
  };

  const handleResetPassword = async (id) => {
    const result = await channelPartnersApi.resetPortalUserPassword(id);
    setRevealedPasswords((prev) => ({ ...prev, [id]: { name: result.name, email: result.email, temporaryPassword: result.temporaryPassword } }));
  };

  const handleCopy = async (id, value) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={LinkIcon}
        iconClass="text-[#3046b2]"
        subtitle="Every Channel Partner Portal login. An account is created automatically when a partner signs the Channel Partner Agreement — see the Channel Partner module to send that link."
      >
        Channel Partners
      </SectionTitle>

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="text-[14px] text-[#e0483f]">{error}</p>
        ) : portalUsers.length === 0 ? (
          <p className="text-[14px] text-[#8592ab]">
            No portal accounts yet — one is created automatically the first time a partner signs their agreement.
          </p>
        ) : (
          portalUsers.map((portalUser) => {
            const revealed = revealedPasswords[portalUser.id];
            return (
              <div key={portalUser.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-[#102246]">{portalUser.name}</p>
                      <Badge tone="slate">{portalUser.channelPartnerName}</Badge>
                      <Badge tone={portalUser.status === "ACTIVE" ? "green" : "red"}>
                        {portalUser.status === "ACTIVE" ? "Active" : "Suspended"}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-[#8592ab]">
                      {portalUser.email}
                      <span className="ml-2">
                        · {portalUser.permissions?.length ?? 0} extra module{(portalUser.permissions?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionButton
                      label="Feature access"
                      icon={SlidersIcon}
                      small
                      active={editingAccessFor === portalUser.id}
                      onClick={() => setEditingAccessFor(editingAccessFor === portalUser.id ? null : portalUser.id)}
                    />
                    <ActionButton label="Reset password" icon={RefreshIcon} small onClick={() => handleResetPassword(portalUser.id)} />
                    <ActionButton
                      label={portalUser.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                      small
                      onClick={() => handleToggleStatus(portalUser)}
                    />
                  </div>
                </div>
                {revealed ? (
                  <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[#f4f7fd] px-3.5 py-2.5">
                    <CheckCircleIcon className="size-4 shrink-0 text-[#2b9b60]" />
                    <p className="text-[13px] text-[#334463]">
                      Temporary password: <span className="font-mono font-semibold">{revealed.temporaryPassword}</span> — save this now, it won't be shown again.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(portalUser.id, revealed.temporaryPassword)}
                      className="ml-auto grid size-8 shrink-0 place-items-center rounded-[10px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                    >
                      <CopyIcon className="size-4" />
                    </button>
                    {copied === portalUser.id ? <span className="text-[12px] text-[#2b9b60]">Copied.</span> : null}
                  </div>
                ) : null}
                {editingAccessFor === portalUser.id && modules.length > 0 ? (
                  <PermissionsEditor
                    employee={portalUser}
                    modules={modules}
                    onSave={(permissions) => handleSavePermissions(portalUser.id, permissions)}
                    onCancel={() => setEditingAccessFor(null)}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
