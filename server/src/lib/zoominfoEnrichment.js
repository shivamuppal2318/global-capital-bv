import { enrichCompanyByName, enrichContactByName, searchContacts, searchScoopsByCompany } from "./zoominfoClient.js";

// Shared by the single-lead "Enrich" route and the leads-table "Bulk
// enrich" action, so the two can never quietly drift apart on what counts
// as a match or how the resulting Lead update is built. Company, contact
// and scoops are independent ZoomInfo lookups — any subset can succeed —
// so all three are attempted every time rather than short-circuiting on
// the first miss. Scoops failures degrade to an empty list rather than
// failing the whole lookup: it's the lowest-stakes of the three (pure
// display, no fields depend on it), so a transient scoops-search hiccup
// shouldn't block a real company/contact match from going through.
export async function lookupLeadInZoomInfo({ token, lead }) {
  const [companyAttributes, contactAttributes, scoops] = await Promise.all([
    enrichCompanyByName({ token, companyName: lead.company }),
    enrichContactByName({ token, fullName: lead.name, companyName: lead.company }),
    searchScoopsByCompany({ token, companyName: lead.company }).catch(() => [])
  ]);
  return { companyAttributes, contactAttributes, scoops };
}

export function hasAnyZoomInfoMatch({ companyAttributes, contactAttributes, scoops }) {
  return Boolean(companyAttributes || contactAttributes || scoops.length);
}

// Finds a real contact at a company by name alone — for anything that only
// has a company name to go on, not a specific person (a Market
// Intelligence signal's entityName, or a bare ZoomInfo company search
// result someone wants to add straight to an outreach List). Searches
// ZoomInfo's own contact index for this company first, then enriches
// whichever one comes back to get their real email — the Search endpoint
// never returns the address itself, only a hasEmail flag (see
// zoominfoClient.js's own note on enrichContactByName). Only the first
// search result with a usable name is tried, not every candidate — one
// extra real API call is already the point of this action; retrying across
// several candidates would multiply the credit cost for a best-effort "who
// might we reach" contact, not a specific person being looked up on purpose.
export async function findRepresentativeContactInZoomInfo({ token, companyName }) {
  const { results } = await searchContacts({ token, filters: { companyName }, pageSize: 3 }).catch(() => ({ results: [] }));
  const candidate = results.find((r) => r.firstName && r.lastName);
  if (!candidate) return null;
  return enrichContactByName({ token, fullName: `${candidate.firstName} ${candidate.lastName}`, companyName }).catch(() => null);
}

// Company + Scoops + a real contact — for a Market Intelligence signal,
// whose entityName is a company, not a person (see
// routes/marketIntelligence.js's POST /signals/:id/enrich), so there's no
// name to enrich directly the way lookupLeadInZoomInfo above can.
export async function lookupCompanyAndContactInZoomInfo({ token, companyName }) {
  const [companyAttributes, scoops, contactAttributes] = await Promise.all([
    enrichCompanyByName({ token, companyName }),
    searchScoopsByCompany({ token, companyName }).catch(() => []),
    findRepresentativeContactInZoomInfo({ token, companyName })
  ]);

  return { companyAttributes, contactAttributes, scoops };
}

// Only fills industry/territory if they're still empty (never overwrites a
// value a rep already set); zoomInfoData/zoomInfoContactData/zoomInfoScoops
// are display-only, so those are written whenever the corresponding lookup
// actually returned something this time.
export function buildLeadEnrichmentUpdate({ lead, companyAttributes, contactAttributes, scoops }) {
  const territoryFromZoomInfo = companyAttributes
    ? [companyAttributes.city, companyAttributes.state, companyAttributes.country].filter(Boolean).join(", ")
    : "";

  return {
    industry: lead.industry || companyAttributes?.primaryIndustry?.[0] || lead.industry,
    territory: lead.territory || territoryFromZoomInfo || lead.territory,
    ...(companyAttributes ? { zoomInfoData: companyAttributes } : {}),
    ...(contactAttributes ? { zoomInfoContactData: contactAttributes } : {}),
    ...(scoops.length ? { zoomInfoScoops: scoops } : {}),
    zoomInfoEnrichedAt: new Date()
  };
}

// The set of leads a "Bulk enrich" run would act on — anything still
// missing industry or territory, the two fields enrichment can actually
// fill in. Shared with the count-preview endpoint so the confirmation
// number a rep sees is guaranteed to match what the batch itself will do.
export function enrichCandidateWhereClause() {
  return { OR: [{ industry: null }, { territory: null }] };
}
