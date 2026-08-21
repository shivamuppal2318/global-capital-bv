import { useState } from "react";
import { ActionButton } from "../ui";
import { CheckCircleIcon } from "../Icons";

// Per-employee module access. Admins aren't editable here — the backend
// grants them everything regardless (see server/src/lib/permissions.js), so
// showing unchecked boxes for an admin would be a lie.
export function PermissionsEditor({ employee, modules, onSave, onCancel }) {
  const [selected, setSelected] = useState(() => new Set(employee.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const groups = modules.reduce((acc, m) => {
    (acc[m.group] ??= []).push(m);
    return acc;
  }, {});

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroup = (groupModules) => {
    const allOn = groupModules.every((m) => selected.has(m.id));
    setSelected((prev) => {
      const next = new Set(prev);
      groupModules.forEach((m) => (allOn ? next.delete(m.id) : next.add(m.id)));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave([...selected]);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-[14px] border border-[#d6deea] bg-[#f8faff] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#334463]">
          Feature access for {employee.name}
          <span className="ml-2 font-normal text-[#8592ab]">{selected.size} of {modules.length} enabled</span>
        </p>
        <div className="flex gap-2">
          <ActionButton label="Cancel" small onClick={onCancel} disabled={saving} />
          <ActionButton label={saving ? "Saving…" : "Save access"} icon={CheckCircleIcon} primary small onClick={handleSave} disabled={saving} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(groups).map(([group, groupModules]) => (
          <div key={group}>
            <button
              type="button"
              onClick={() => toggleGroup(groupModules)}
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8592ab] hover:text-[#3046b2]"
            >
              {group}
            </button>
            <div className="space-y-1.5">
              {groupModules.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-white">
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="size-4 shrink-0 accent-[#3046b2]"
                  />
                  <span className="text-[13px] text-[#334463]">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
      <p className="mt-3 text-[12px] text-[#8592ab]">
        Unchecked modules are hidden from their sidebar and refused by the API, so this can't be bypassed. Takes effect on their next request — no re-login needed.
      </p>
    </div>
  );
}
