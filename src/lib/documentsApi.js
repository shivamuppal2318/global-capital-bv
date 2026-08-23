import { API_ROOT } from "./config";
import { apiFetch, getToken } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/documents`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const documentsApi = {
  list: ({ category, q } = {}) => {
    const params = new URLSearchParams();
    if (category && category !== "All") params.set("category", category);
    if (q) params.set("q", q);
    const suffix = params.toString();
    return request(suffix ? `?${suffix}` : "");
  },
  categories: () => request("/categories"),
  // Single source of truth for the checklist — served from the backend (see
  // server/src/lib/requiredDocuments.js) so it can never drift from what the
  // upload classifier and the AI gap check are matching against.
  requiredDocuments: () => request("/required-documents"),
  // Reads real document content (not just category tags) against the
  // checklist — returns { configured: false, message } if no AI key is set.
  gapCheck: () => request("/gap-check", { method: "POST" }),
  update: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  remove: (id) => request(`/${id}`, { method: "DELETE" }),

  // Uploads go through raw fetch rather than apiFetch: the body is
  // FormData, and setting Content-Type ourselves would strip the multipart
  // boundary the server needs to parse it.
  upload: async (file, { category, description } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (category) form.append("category", category);
    if (description) form.append("description", description);

    const token = getToken();
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `Upload failed (${response.status})`);
    return data;
  },

  // The download route needs the Authorization header, so it can't just be
  // an <a href>. Fetched as a blob and handed to the browser instead.
  open: async (doc, { download = false } = {}) => {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/${doc.id}/download${download ? "?download=1" : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? `Could not open the file (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.originalName;
      a.click();
    } else {
      window.open(url, "_blank", "noopener");
    }
    // Give the browser a moment to consume the blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};
