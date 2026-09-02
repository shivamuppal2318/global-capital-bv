// ZoomInfo's GTM API — OAuth2 client_credentials flow against
// api.zoominfo.com's own gateway (which brokers Okta under the hood; the
// issuer in a decoded token is okta-login.zoominfo.com, but that's just
// where tokens are minted from, not where the data API lives). This is
// ZoomInfo's newer GTM Studio product line, not the classic Enrich API's
// username+privateKey flow that most public ZoomInfo integration guides
// describe — confirmed against docs.zoominfo.com and a live test call
// before wiring this in; guessing the endpoint would have been unsafe with
// a real credential.

async function getAccessToken({ clientId, clientSecret }) {
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
export async function enrichCompanyByName({ clientId, clientSecret, companyName }) {
  const token = await getAccessToken({ clientId, clientSecret });
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
