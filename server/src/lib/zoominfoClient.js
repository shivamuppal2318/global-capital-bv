// ZoomInfo's GTM API — OAuth2 client_credentials flow against
// api.zoominfo.com's own gateway (which brokers Okta under the hood; the
// issuer in a decoded token is okta-login.zoominfo.com, but that's just
// where tokens are minted from, not where the data API lives). This is
// ZoomInfo's newer GTM Studio product line, not the classic Enrich API's
// username+privateKey flow that most public ZoomInfo integration guides
// describe — confirmed against docs.zoominfo.com and a live test call
// before wiring this in; guessing the endpoint would have been unsafe with
// a real credential.

// Exported (not per-call-internal) deliberately: minting two tokens for the
// same client_id concurrently invalidates one of them ("Your session has
// expired" on whichever request loses the race) — confirmed live when
// company+contact enrich each minted their own token inside a Promise.all.
// So a single lead enrichment mints exactly one token up front and both
// company and contact lookups reuse it.
export async function getAccessToken({ clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.zoominfo.com/gtm/oauth/v1/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`
    },
    body: "grant_type=client_credentials"
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error_description ?? body?.error ?? "ZoomInfo rejected the credentials.");
  }
  return body.access_token;
}

export async function testZoomInfoConnection({ clientId, clientSecret }) {
  await getAccessToken({ clientId, clientSecret });
  return { message: "Connected — ZoomInfo accepted the credentials and issued an access token." };
}

const ENRICH_OUTPUT_FIELDS = [
  "name",
  "website",
  "phone",
  "description",
  "foundedYear",
  "city",
  "state",
  "country",
  "employeeCount",
  "revenue",
  "primaryIndustry"
];

// Looks up one company by name and returns its enriched attributes, or null
// if ZoomInfo found no confident match. A "not found" is a normal, expected
// outcome (plenty of real companies — especially small/private ones —
// simply aren't in ZoomInfo's database), not a thrown error.
export async function enrichCompanyByName({ token, companyName }) {
  const response = await fetch("https://api.zoominfo.com/gtm/data/v1/companies/enrich", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json"
    },
    body: JSON.stringify({
      data: {
        type: "CompanyEnrich",
        attributes: {
          matchCompanyInput: [{ companyName }],
          outputFields: ENRICH_OUTPUT_FIELDS
        }
      }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.errors?.[0]?.detail ?? body?.detail ?? "ZoomInfo rejected the enrich request.");
  }

  const match = body?.data?.[0];
  if (!match || match.meta?.matchStatus !== "FULL_MATCH" || !match.attributes) return null;
  return match.attributes;
}

const CONTACT_ENRICH_OUTPUT_FIELDS = ["firstName", "lastName", "jobTitle", "managementLevel", "mobilePhone", "directPhoneAlt"];

// ZoomInfo's contact match only accepts firstName+lastName+companyName (or
// personId) — confirmed live: an email-based matchPersonInput is rejected
// with a 400, even though email is a valid *output* field. So a lead's full
// name has to be split; a single-word name (can't tell first from last)
// isn't enough to match on and returns null rather than guessing.
export async function enrichContactByName({ token, fullName, companyName }) {
  const parts = fullName?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) return null;
  const [firstName, ...rest] = parts;
  const lastName = rest.join(" ");

  const response = await fetch("https://api.zoominfo.com/gtm/data/v1/contacts/enrich", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json"
    },
    body: JSON.stringify({
      data: {
        type: "ContactEnrich",
        attributes: {
          matchPersonInput: [{ firstName, lastName, companyName }],
          outputFields: CONTACT_ENRICH_OUTPUT_FIELDS
        }
      }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.errors?.[0]?.detail ?? body?.detail ?? "ZoomInfo rejected the contact enrich request.");
  }

  const match = body?.data?.[0];
  if (!match || match.meta?.matchStatus !== "FULL_MATCH" || !match.attributes) return null;
  return match.attributes;
}
