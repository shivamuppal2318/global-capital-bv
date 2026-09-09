import { useEffect, useState } from "react";
import { XIcon } from "../Icons.jsx";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";

// A campaign's real follow-up sequence — each step here is a genuine
// CadenceStep DB row that scheduleCadenceSteps (server/src/routes/
// emailLeads.js) reads when a lead is added, so what gets edited here is
// exactly what a future lead's follow-up emails will say and when they'll
// go out (subject/body/delay). No rich-HTML editor: the cadence queue's
// worker sends this as a plain-text body only (see queue/cadenceQueue.js),
// so a plain textarea matches what actually gets sent, rather than
// promising formatting that would silently get stripped.
export function CadenceStepsEditor({ campaignId }) {
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);

  function loadSteps() {
    emailCampaignsApi.cadenceSteps
      .list(campaignId)
      .then(setSteps)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function handleAddStep() {
    setAdding(true);
    setError(null);
    try {
      await emailCampaignsApi.cadenceSteps.create(campaignId, {
        title: `Follow-up ${(steps?.length ?? 0) + 1}`,
        bodyTemplate: "Write this step's email here.",
        delayDays: 3
      });
      loadSteps();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateStep(step, patch) {
    setSavingId(step.id);
    setError(null);
    try {
      const updated = await emailCampaignsApi.cadenceSteps.update(campaignId, step.id, patch);
      setSteps((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemoveStep(step) {
    setError(null);
    try {
      await emailCampaignsApi.cadenceSteps.remove(campaignId, step.id);
      setSteps((current) => current.filter((s) => s.id !== step.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!steps) {
    return <p className="text-[13px] text-[#8593ac]">Loading follow-up steps…</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-[12px] text-[#e0483f]">{error}</p> : null}

      {steps.map((step, index) => (
        <StepCard
          key={step.id}
          step={step}
          index={index}
          saving={savingId === step.id}
          onSave={(patch) => handleUpdateStep(step, patch)}
          onRemove={() => handleRemoveStep(step)}
        />
      ))}

      {steps.length === 0 ? (
        <p className="text-[12px] text-[#8593ac]">No follow-up steps yet — add one to schedule a real automated email.</p>
      ) : null}

      <button
        type="button"
        onClick={handleAddStep}
        disabled={adding}
        className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#435471] disabled:opacity-50"
      >
        {adding ? "Adding…" : "+ Add Email Step"}
      </button>
    </div>
  );
}

function StepCard({ step, index, saving, onSave, onRemove }) {
  const [title, setTitle] = useState(step.title);
  const [delayDays, setDelayDays] = useState(String(step.delayDays));
  const [bodyTemplate, setBodyTemplate] = useState(step.bodyTemplate);

  const dirty = title !== step.title || Number(delayDays) !== step.delayDays || bodyTemplate !== step.bodyTemplate;

  return (
    <div className="rounded-[16px] border border-[#e7edf5] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#303750]">Step {index + 1}</p>
        <button type="button" onClick={onRemove} className="grid size-5 place-items-center rounded-full bg-[#ff5d76] text-white">
          <XIcon className="size-3" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[0.3fr_1fr]">
        <label className="block">
          <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Wait (days)</p>
          <input
            type="number"
            min="0"
            value={delayDays}
            onChange={(event) => setDelayDays(event.target.value)}
            className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
          />
        </label>
        <label className="block">
          <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Subject</p>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-2.5 text-[14px] text-[#102246] outline-none"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <p className="mb-1.5 text-[12px] font-semibold text-[#5f6f89]">Email body</p>
        <textarea
          rows={5}
          value={bodyTemplate}
          onChange={(event) => setBodyTemplate(event.target.value)}
          className="w-full resize-none rounded-[12px] border border-[#dfe5f1] bg-white px-4 py-3 text-[14px] leading-5 text-[#102246] outline-none"
        />
      </label>

      {dirty ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onSave({ title, delayDays: Number(delayDays) || 0, bodyTemplate })}
            disabled={saving}
            className="rounded-[8px] bg-[#18b6d3] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save step"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
