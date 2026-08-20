// Backend origin, baked in at build time. Falls back to localhost:4000 so
// local dev (`npm run dev` against the local backend) keeps working
// unchanged. In production, set VITE_API_URL to the deployed backend's
// public URL (e.g. https://api.yourdomain.com) when building the frontend.
export const API_ROOT = import.meta.env.VITE_API_URL || "http://localhost:4000";
