import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ActionButton, Card, SectionTitle } from "../ui";
import { RadarIcon } from "../Icons";

// Order the AI's own signal-type extraction, then the three factual bonus
// flags — matches the grouping in the scoring explanation banner below.
const SIGNAL_TYPE_KEYS = ["SIGNAL_FUNDING", "SIGNAL_ACQUISITION", "SIGNAL_DISTRESS", "SIGNAL_EXPANSION", "SIGNAL_LEADERSHIP_CHANGE", "SIGNAL_OTHER"];
const BONUS_KEYS = ["HAS_CONCRETE_DETAIL", "HAS_REAL_CONTENT", "ENTITY_CLEARLY_NAMED"];

function CriterionRow({ criterion, onSaved }) {
  const [value, setValue] = useState(String(criterion.points));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const dirty = value !== "" && Number(value) !== criterion.points;

  async function handleSave() {
    const points = Number(value);
    if (!Number.isInteger(points) || points < 0 || points > 100) {
      setError("Enter a whole number from 0 to 100.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.updateScoringCriterionPoints(criterion.key, points);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf5] py-3 last:border-0">
      <p className="min-w-0 flex-1 text-[14px] text-[#334463]">{criterion.label}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          max="100"
          className="w-[80px] rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="text-[12px] text-[#8592ab]">pts</span>
        {dirty ? <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving} /> : null}
      </div>
      {error ? <p className="w-full text-[12px] font-medium text-[#e0483f]">{error}</p> : null}
    </div>
  );
}

// Where Market Signal's relevanceScore actually comes from: the AI only
// ever extracts facts (signal type + three yes/no flags, see
// aiProcessor.js) — every point value here is what turns those facts into
// the 0-100 number the Market Intelligence screen sorts by. Editable
// without a redeploy, unlike the AI prompt itself.
export function ScoringCriteriaPanel() {
  const [criteria, setCriteria] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi
      .getScoringCriteria()
      .then(setCriteria)
      .catch((err) => setError(err.message));
  }, []);

  function handleSaved(updated) {
    setCriteria((current) => current.map((c) => (c.key === updated.key ? updated : c)));
  }

  if (error) return <Card className="px-5 py-6 text-[14px] text-[#e0483f]">{error}</Card>;
  if (!criteria) return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading scoring criteria…</Card>;

  const byKey = Object.fromEntries(criteria.map((c) => [c.key, c]));
  const maxPossible =
    Math.max(...SIGNAL_TYPE_KEYS.map((k) => byKey[k]?.points ?? 0)) + BONUS_KEYS.reduce((sum, k) => sum + (byKey[k]?.points ?? 0), 0);

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={RadarIcon}
        iconClass="text-[#8853d0]"
        subtitle="The AI only extracts facts — which signal type, and whether concrete detail/a named company is present. These points are what turn those facts into the 0-100 relevanceScore shown on the Market Intelligence screen."
      >
        Signal scoring
      </SectionTitle>

      <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8592ab]">Signal type (one applies per signal)</p>
      <div className="mt-1">
        {SIGNAL_TYPE_KEYS.map((key) => (byKey[key] ? <CriterionRow key={key} criterion={byKey[key]} onSaved={handleSaved} /> : null))}
      </div>

      <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8592ab]">Bonus factors (added on top, if true)</p>
      <div className="mt-1">
        {BONUS_KEYS.map((key) => (byKey[key] ? <CriterionRow key={key} criterion={byKey[key]} onSaved={handleSaved} /> : null))}
      </div>

      <p className="mt-4 rounded-[12px] bg-[#f7f9fc] px-4 py-3 text-[13px] leading-6 text-[#5f6f89]">
        Highest possible score right now: <span className="font-semibold text-[#102246]">{Math.min(100, maxPossible)}</span> (best signal type
        + all three bonus factors true). Scores are clamped to 100 regardless of how points are set. Takes effect on the next signal
        processed — nothing needs a restart.
      </p>
    </Card>
  );
}
