import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const BASE = `${API_ROOT}/api/outreach-doe`;

function qs(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v) search.set(k, v);
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

export const outreachDoeApi = {
  facets: () => apiFetch(`${BASE}/facets`),
  get: (filters) => apiFetch(`${BASE}${qs(filters)}`)
};
