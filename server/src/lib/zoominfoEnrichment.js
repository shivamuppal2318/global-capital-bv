import { enrichCompanyByName, enrichContactByName, searchScoopsByCompany } from "./zoominfoClient.js";

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
