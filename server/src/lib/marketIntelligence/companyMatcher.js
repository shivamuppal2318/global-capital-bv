import { prisma } from "../prisma.js";
import { companyNameSimilarity } from "./companyNameMatch.js";

// Above this similarity score (0-1, from companyNameSimilarity), two
// company names are treated as the same company. High enough to avoid
// "Acme Corp" matching "Acme Industries" (different companies sharing a
// word); low enough to catch "Acme Inc" vs "Acme, Incorporated" vs a minor
// typo. See companyNameMatch.test.js for the cases that pin this value.
const FUZZY_MATCH_THRESHOLD = 0.85;

// Two-pass: try an exact case-insensitive match first (the common case,
// and cheap — one indexed-ish query). Only fall back to fuzzy matching if
// that finds nothing.
//
// `client` is injectable for the same DI-testability reason as
// sendCap.js/accountSendCap.js.
export async function findExistingLeadByCompany(entityName, client = prisma) {
  if (!entityName) {
    return null;
  }

  const exactMatch = await client.lead.findFirst({
    where: { company: { equals: entityName.trim(), mode: "insensitive" } }
  });
  if (exactMatch) {
    return exactMatch;
  }

  // Fine at prototype scale (scans every lead's company name in memory);
  // a real implementation at scale would want a trigram index (Postgres
  // pg_trgm) doing this fuzzy comparison in the database instead of
  // fetching every lead to compare in JS.
  const candidates = await client.lead.findMany({ select: { id: true, company: true } });

  let bestMatchId = null;
  let bestScore = FUZZY_MATCH_THRESHOLD;
  for (const candidate of candidates) {
    const score = companyNameSimilarity(entityName, candidate.company);
    if (score >= bestScore) {
      bestScore = score;
      bestMatchId = candidate.id;
    }
  }

  if (!bestMatchId) {
    return null;
  }
  // Re-fetch the full record so callers get the same shape regardless of
  // whether the match came from the exact or fuzzy path.
  return client.lead.findUnique({ where: { id: bestMatchId } });
}
