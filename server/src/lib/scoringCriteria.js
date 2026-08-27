import { prisma } from "../db.js";

// Defaults, seeded once on first read and never overwritten after — an
// admin's edited point values must survive a restart. Point totals are
// calibrated so a fully-concrete signal of the two "hot" types reaches
// exactly 100, and a vague, unnamed "OTHER" signal lands in the single
// digits: FUNDING/ACQUISITION (50) + HAS_CONCRETE_DETAIL (25) +
// HAS_REAL_CONTENT (15) + ENTITY_CLEARLY_NAMED (10) = 100.
export const DEFAULT_CRITERIA = [
  { key: "SIGNAL_FUNDING", label: "Signal type: Funding", points: 50 },
  { key: "SIGNAL_ACQUISITION", label: "Signal type: Acquisition", points: 50 },
  { key: "SIGNAL_DISTRESS", label: "Signal type: Distress (concrete financial trouble is itself a sourcing opportunity)", points: 50 },
  { key: "SIGNAL_EXPANSION", label: "Signal type: Expansion", points: 30 },
  { key: "SIGNAL_LEADERSHIP_CHANGE", label: "Signal type: Leadership change", points: 15 },
  { key: "SIGNAL_OTHER", label: "Signal type: Other", points: 5 },
  { key: "HAS_CONCRETE_DETAIL", label: "States a concrete deal size, valuation, or named investor/acquirer", points: 25 },
  { key: "HAS_REAL_CONTENT", label: "Article content adds real information beyond the headline", points: 15 },
  { key: "ENTITY_CLEARLY_NAMED", label: "The company is clearly and specifically named", points: 10 }
];

// Upsert-on-read rather than a separate seed step: the table is empty on a
// fresh install, and the first caller (a pipeline run or the Admin Panel
// screen, whichever happens first) populates it from DEFAULT_CRITERIA.
// Idempotent — `createMany...skipDuplicates` is a no-op on every call after
// the first.
export async function getScoringCriteria() {
  const existing = await prisma.scoringCriterion.findMany();
  if (existing.length > 0) return existing;

  await prisma.scoringCriterion.createMany({ data: DEFAULT_CRITERIA, skipDuplicates: true });
  return prisma.scoringCriterion.findMany();
}

export async function updateScoringCriterionPoints(key, points) {
  return prisma.scoringCriterion.update({ where: { key }, data: { points } });
}

// Pure — the actual arithmetic behind relevanceScore, kept separate from
// the AI call so it's testable with plain fixtures. Only one signal-type
// criterion ever applies (whichever SIGNAL_<type> matches); the three
// factual flags are additive on top of it. Clamped to 0-100 since an admin
// could otherwise set points that sum past 100.
export function computeRelevanceScore(criteria, { signalType, hasConcreteDetail, hasRealContent, entityClearlyNamed }) {
  const points = Object.fromEntries(criteria.map((c) => [c.key, c.points]));
  let score = points[`SIGNAL_${signalType}`] ?? 0;
  if (hasConcreteDetail) score += points.HAS_CONCRETE_DETAIL ?? 0;
  if (hasRealContent) score += points.HAS_REAL_CONTENT ?? 0;
  if (entityClearlyNamed) score += points.ENTITY_CLEARLY_NAMED ?? 0;
  return Math.max(0, Math.min(100, score));
}
