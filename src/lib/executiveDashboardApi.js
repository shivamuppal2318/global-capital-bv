import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

export const executiveDashboardApi = {
  get: () => apiFetch(`${API_ROOT}/api/executive-dashboard`)
};
