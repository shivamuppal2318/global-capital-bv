import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { useAuth } from "../../context/AuthContext";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { CheckCircleIcon, CopyIcon, PlusIcon, RefreshIcon, UsersIcon, XIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const EMPTY_FORM = { name: "", email: "", role: "EMPLOYEE" };

export function EmployeesPanel() {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  // { employeeId: { name, email, temporaryPassword } } — shown once, right
  // after create or a password reset, then gone for good.
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [copied, setCopied] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi
      .listEmployees()
      .then(setEmployees)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await adminApi.createEmployee(form);
      setRevealedPasswords((prev) => ({ ...prev, [created.id]: { name: created.name, email: created.email, temporaryPassword: created.temporaryPassword } }));
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(typeof err.message === "string" ? err.message : "Could not create employee.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (id) => {
    const result = await adminApi.resetPassword(id);
    setRevealedPasswords((prev) => ({ ...prev, [id]: { name: result.name, email: result.email, temporaryPassword: result.temporaryPassword } }));
  };

  const handleToggleStatus = async (employee) => {
    await adminApi.updateEmployee(employee.id, { status: employee.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" });
    load();
  };

  const handleToggleRole = async (employee) => {
    await adminApi.updateEmployee(employee.id, { role: employee.role === "ADMIN" ? "EMPLOYEE" : "ADMIN" });
    load();
  };

  const handleRemove = async (id) => {
    try {
      await adminApi.removeEmployee(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopy = async (id, value) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={UsersIcon}
        iconClass="text-[#3046b2]"
        subtitle="Everyone with a login to this CRM. Admins can configure company-wide settings; Employees see the day-to-day modules and manage their own mailbox."
        action={<ActionButton label={showForm ? "Cancel" : "Add employee"} icon={showForm ? XIcon : PlusIcon} small onClick={() => setShowForm((v) => !v)} />}
      >
        Employees
      </SectionTitle>

      {showForm ? (
        <form onSubmit={handleCreate} className="mt-5 rounded-[16px] border border-[#e7edf5] p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Name</label>
              <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-[#8592ab]">
            A random password is generated and shown once after creation — share it with the employee yourself, then have them change it after their first login.
          </p>
          {formError ? <p className="mt-2 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}
          <div className="mt-4">
            <ActionButton label={saving ? "Creating…" : "Create employee"} primary small onClick={handleCreate} disabled={saving} />
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="text-[14px] text-[#e0483f]">{error}</p>
        ) : (
          employees.map((employee) => {
            const revealed = revealedPasswords[employee.id];
            const isSelf = employee.id === currentUser?.id;
            return (
              <div key={employee.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-[#102246]">{employee.name}</p>
                      <Badge tone={employee.role === "ADMIN" ? "violet" : "slate"}>{employee.role === "ADMIN" ? "Admin" : "Employee"}</Badge>
                      <Badge tone={employee.status === "ACTIVE" ? "green" : "red"}>{employee.status === "ACTIVE" ? "Active" : "Suspended"}</Badge>
                      {isSelf ? <Badge tone="blue">You</Badge> : null}
                    </div>
                    <p className="text-[12px] text-[#8592ab]">{employee.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionButton label="Reset password" icon={RefreshIcon} small onClick={() => handleResetPassword(employee.id)} />
                    {!isSelf ? (
                      <>
                        <ActionButton
                          label={employee.role === "ADMIN" ? "Make employee" : "Make admin"}
                          small
                          onClick={() => handleToggleRole(employee)}
                        />
                        <ActionButton
                          label={employee.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                          small
                          onClick={() => handleToggleStatus(employee)}
                        />
                        <ActionButton label="Remove" icon={XIcon} small onClick={() => handleRemove(employee.id)} />
                      </>
                    ) : null}
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
                      onClick={() => handleCopy(employee.id, revealed.temporaryPassword)}
                      className="ml-auto grid size-8 shrink-0 place-items-center rounded-[10px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                    >
                      <CopyIcon className="size-4" />
                    </button>
                    {copied === employee.id ? <span className="text-[12px] text-[#2b9b60]">Copied.</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
