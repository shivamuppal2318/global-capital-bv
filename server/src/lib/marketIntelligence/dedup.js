import crypto from "node:crypto";

// Two sources reporting the same underlying event with slightly different
// article text would otherwise both create signals — hashing source +
// normalized title (not full content, which varies more between
// re-publications of the same story) catches the common case cheaply.
// Not foolproof: a genuinely different article with a coincidentally
// identical title would be wrongly treated as a duplicate. Good enough for
// a first pass; a real implementation might hash a content fingerprint
// (e.g. simhash) instead of the title.
export function computeContentHash(source, rawTitle) {
  const normalized = `${source}:${rawTitle.trim().toLowerCase().replace(/\s+/g, " ")}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
