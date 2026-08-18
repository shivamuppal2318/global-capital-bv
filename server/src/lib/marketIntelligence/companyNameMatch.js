// Strips common legal-entity suffixes so "Acme Inc", "Acme, Incorporated",
// and "ACME CORP" all normalize to the same string before comparison.
const COMMON_SUFFIXES = new Set([
  "incorporated", "inc", "corporation", "corp", "limited", "ltd", "llc", "llp",
  "gmbh", "bv", "nv", "sa", "plc", "co", "company", "group", "holdings"
]);

export function normalizeCompanyName(name) {
  if (!name) {
    return "";
  }
  let normalized = name.toLowerCase().trim();
  normalized = normalized.replace(/[.,'"]/g, "");
  normalized = normalized.replace(/[-_&]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();

  const words = normalized.split(" ");
  while (words.length > 1 && COMMON_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ").trim();
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
      }
    }
  }
  return matrix[a.length][b.length];
}

// 1.0 = identical (after normalization), 0.0 = completely different.
// Plain edit-distance ratio on the normalized names — no external library,
// no ML, just a well-understood algorithm applied to cleaned-up input.
export function companyNameSimilarity(a, b) {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);
  if (!normA || !normB) {
    return 0;
  }
  if (normA === normB) {
    return 1;
  }
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}
