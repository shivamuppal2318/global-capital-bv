// Apollo.io — https://apollo.io. No account available here; endpoint and
// response shape below are written from their public docs and NOT
// verified against a live call. Adjust normalizeApolloOrganization()
// against a real response before relying on this.
import { getProviderKey, isProviderConfigured } from "../../marketIntelligenceSettings.js";

export async function isApolloConfigured() {
  return isProviderConfigured("apollo");
}

// Pure — testable without any network access or API key. Captures the
// organization-level enrichment (industry/size/revenue/location/founded
// year) alongside the contact — a PE deal-sourcing use case wants that
// company profile, not just "here's a name and an email."
export function normalizeApolloOrganization(org, primaryContact) {
  const location = [org.city, org.state, org.country].filter(Boolean).join(", ") || null;

  return {
    companyName: org.name,
    domain: org.primary_domain ?? org.website_url ?? null,
    industry: org.industry ?? null,
    estimatedEmployeeCount: org.estimated_num_employees ?? null,
    estimatedAnnualRevenue: org.annual_revenue ?? org.estimated_annual_revenue ?? null,
    foundedYear: org.founded_year ?? null,
    location,
    linkedinUrl: org.linkedin_url ?? null,
    contact: primaryContact
      ? {
          name: `${primaryContact.first_name ?? ""} ${primaryContact.last_name ?? ""}`.trim() || "Unknown contact",
          email: primaryContact.email ?? null,
          title: primaryContact.title ?? null,
          linkedinUrl: primaryContact.linkedin_url ?? null
        }
      : null
  };
}

// Renders the enrichment as a readable summary — used to record what
// Apollo actually returned against the lead's activity timeline, so the
// company-profile data isn't captured and then silently discarded (see
// pipeline.js's createLeadFromSignal, which had no record of it before).
export function summarizeApolloEnrichment(enrichment) {
  const facts = [
    enrichment.industry ? `Industry: ${enrichment.industry}` : null,
    enrichment.estimatedEmployeeCount ? `~${enrichment.estimatedEmployeeCount} employees` : null,
    enrichment.estimatedAnnualRevenue ? `~$${enrichment.estimatedAnnualRevenue} est. annual revenue` : null,
    enrichment.foundedYear ? `Founded ${enrichment.foundedYear}` : null,
    enrichment.location ? `Located in ${enrichment.location}` : null,
    enrichment.domain ? `Domain: ${enrichment.domain}` : null
  ].filter(Boolean);

  return facts.length > 0 ? facts.join(" · ") : "No additional company details returned by Apollo.";
}

// One combined lookup: find the organization, then its most senior
// available contact — a real integration would likely split these into
// separate Apollo endpoints (Organization Search + People Search) and let
// the caller pick a contact; kept as one call here to match the
// flowchart's single "Apollo lookup" step.
export async function apolloLookupCompany(companyName) {
  const { apiKey } = await getProviderKey("apollo");
  if (!apiKey) {
    throw new Error("Apollo is not configured — add a key under Admin Panel → Market Intelligence.");
  }

  const orgResponse = await fetch("https://api.apollo.io/v1/organizations/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ q_organization_name: companyName, page: 1, per_page: 1 })
  });
  if (!orgResponse.ok) {
    throw new Error(`Apollo organization search failed: ${orgResponse.status}`);
  }
  const orgData = await orgResponse.json();
  const org = orgData?.organizations?.[0];
  if (!org) {
    throw new Error(`Apollo found no organization matching "${companyName}".`);
  }

  const peopleResponse = await fetch("https://api.apollo.io/v1/people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ organization_ids: [org.id], page: 1, per_page: 1 })
  });
  const peopleData = peopleResponse.ok ? await peopleResponse.json() : null;
  const primaryContact = peopleData?.people?.[0] ?? null;

  return normalizeApolloOrganization(org, primaryContact);
}
