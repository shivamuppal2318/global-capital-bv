// The URL a person opens in their browser — needed for links inside
// emails. Distinct from APP_BASE_URL, which points at the API. CORS_ORIGIN
// already holds the frontend origin (it's what the API is told to trust),
// so it doubles as the app URL rather than adding a fourth domain env var
// that could drift out of sync with the other three.
export function appBaseUrl() {
  const first = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
  return (first || "http://localhost:5173").replace(/\/+$/, "");
}
