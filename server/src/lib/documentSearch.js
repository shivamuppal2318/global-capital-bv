import { prisma } from "../db.js";

// Picks which Data Room documents to put in front of the assistant for a
// given question.
//
// This is keyword overlap, not semantic search: there's no embedding model
// or vector store here, so asking about "revenue" won't surface a document
// that only ever says "turnover". That's a real limitation and the reason
// the whole corpus is never simply pasted in — a data room of any size
// would blow past the context window and cost a fortune per message.
// Scoring picks a handful of likely-relevant documents instead.

const MAX_DOCS = 5;
const MAX_CHARS_PER_DOC = 6_000;
const MAX_TOTAL_CHARS = 24_000;

// Words too common to indicate relevance — without this, "what is the
// company revenue" matches every document containing "the".
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "day", "get",
  "has", "him", "his", "how", "its", "new", "now", "old", "see", "two", "who", "did", "yes", "his", "from", "with",
  "that", "this", "what", "when", "where", "which", "your", "have", "they", "them", "then", "than", "there", "these",
  "about", "would", "could", "should", "tell", "show", "give", "does", "into", "over", "some", "want", "need", "know"
]);

export function tokenize(text) {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Exported for its own sake — scoring is the part worth testing without a
// database or a model.
export function scoreDocument(doc, queryTerms) {
  if (queryTerms.length === 0) return 0;

  const haystack = `${doc.originalName} ${doc.category} ${doc.description ?? ""} ${doc.extractedText ?? ""}`.toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    const occurrences = haystack.split(term).length - 1;
    if (occurrences === 0) continue;
    // Diminishing returns: a document repeating one term 100 times isn't
    // 100x more relevant than one mentioning it twice.
    score += 1 + Math.log10(occurrences);
    // A hit in the title/category is a stronger signal than one buried in
    // the body.
    if (`${doc.originalName} ${doc.category}`.toLowerCase().includes(term)) score += 2;
  }
  return score;
}

// Returns { documents, inventory } — inventory lists every document so the
// assistant knows what exists even when nothing matched, which lets it say
// "there's a Q3 report but it doesn't mention that" instead of "I have no
// documents".
export async function retrieveRelevantDocuments(question) {
  const all = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      category: true,
      description: true,
      extractedText: true,
      extractionNote: true,
      sizeBytes: true,
      createdAt: true
    }
  });

  const inventory = all.map((d) => ({
    name: d.originalName,
    category: d.category,
    description: d.description ?? null,
    readable: Boolean(d.extractedText),
    note: d.extractionNote ?? null,
    uploaded: d.createdAt.toISOString().slice(0, 10)
  }));

  const terms = [...new Set(tokenize(question))];
  const readable = all.filter((d) => d.extractedText);

  const ranked = readable
    .map((doc) => ({ doc, score: scoreDocument(doc, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Nothing matched but documents exist: fall back to the most recent few
  // rather than sending none, so a vague question ("what do we have on
  // file?") still gets something concrete.
  const chosen = (ranked.length > 0 ? ranked.map((r) => r.doc) : readable).slice(0, MAX_DOCS);

  const documents = [];
  let budget = MAX_TOTAL_CHARS;
  for (const doc of chosen) {
    if (budget <= 0) break;
    const excerpt = doc.extractedText.slice(0, Math.min(MAX_CHARS_PER_DOC, budget));
    budget -= excerpt.length;
    documents.push({
      name: doc.originalName,
      category: doc.category,
      description: doc.description ?? null,
      truncated: excerpt.length < doc.extractedText.length,
      excerpt
    });
  }

  return { documents, inventory };
}
