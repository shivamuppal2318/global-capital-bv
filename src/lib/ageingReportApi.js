import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/ageing-report`;

export const ageingReportApi = {
  get: () => apiFetch(API_BASE_URL)
};
