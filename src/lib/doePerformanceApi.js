import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/doe-performance`;

export const doePerformanceApi = {
  list: () => apiFetch(API_BASE_URL)
};
