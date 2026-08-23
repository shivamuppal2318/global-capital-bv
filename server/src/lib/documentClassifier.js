import { getAnthropicClient, getAnthropicModel } from "./anthropic.js";
import { REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_LABELS } from "./requiredDocuments.js";

// How much of a document's extracted text actually gets read — enough for
// the model to recognize what kind of document it is without spending
// tokens on an entire audited financial statement.
const TEXT_EXCERPT_CHARS = 3000;

// Runs at upload time so a document tagged with the default "General"
// category gets a real shot at auto-matching one of the checklist items
// instead of always sitting uncategorized until someone manually retags it.
// Returns null (not "General") on no match, no text, or no AI configured —
// callers keep whatever category was already set in every one of those cases.
export async function classifyDocumentCategory({ filename, text }) {
  if (!text?.trim()) return null;

  const anthropic = await getAnthropicClient();
  if (!anthropic) return null;

  const system = [
    "You classify a due-diligence document against a fixed checklist of categories.",
    "Given a filename and an excerpt of the document's text, reply with ONLY the single best-matching category label, copied EXACTLY as given below — or the word None if it doesn't clearly match any of them.",
    "Do not explain your answer. Do not invent a category not in this list.",
    "",
    "Categories:",
    ...REQUIRED_DOCUMENTS.map((d) => `- ${d.label}: ${d.description}`)
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: await getAnthropicModel(),
      max_tokens: 40,
      system,
      messages: [
        {
          role: "user",
          content: `Filename: ${filename}\n\nText excerpt:\n${text.slice(0, TEXT_EXCERPT_CHARS)}`
        }
      ]
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    // Exact (case-insensitive) match only — a near-miss from the model
    // ("Audited Financials" instead of "Audited Financial Statements")
    // is treated as no match rather than silently mistagging a document.
    const matched = REQUIRED_DOCUMENT_LABELS.find((label) => label.toLowerCase() === reply.toLowerCase());
    return matched ?? null;
  } catch (err) {
    console.error("Document category classification failed:", err.message);
    return null;
  }
}

// Analyzes actual document content against each checklist item — this is
// what makes it a "gap check" rather than just re-reading the category
// tags: a file mistagged (or left as "General") can still be recognized
// here from its real content, and one that's tagged correctly but doesn't
// actually contain what it claims gets called out instead of trusted blind.
export async function runGapCheck(documents) {
  const anthropic = await getAnthropicClient();
  if (!anthropic) {
    return { configured: false, results: null };
  }

  const documentSummaries = documents.map((d) => ({
    id: d.id,
    filename: d.originalName,
    category: d.category,
    description: d.description,
    textExcerpt: d.extractedText ? d.extractedText.slice(0, TEXT_EXCERPT_CHARS) : null
  }));

  const system = [
    "You are auditing a Data Room against a required due-diligence checklist for an investment firm.",
    "For EACH checklist item below, decide whether the uploaded documents genuinely cover it — judge by real content (the text excerpt), not just whether a document's category tag happens to match the item's label.",
    'Reply with ONLY a JSON array, no other text, one object per checklist item, in the same order, each shaped exactly as: {"label": string, "status": "covered" | "partial" | "missing", "reason": string, "matchedFilenames": string[]}.',
    "- covered: at least one uploaded document's actual content clearly satisfies this item.",
    "- partial: something uploaded is related but doesn't fully satisfy it (e.g. only 2 of 3-5 years of financials, or a document that looks incomplete).",
    "- missing: nothing uploaded addresses it.",
    "reason must be one short sentence explaining the verdict. matchedFilenames lists the real filenames (from the documents below) that support a covered/partial verdict, or an empty array for missing.",
    "",
    "Checklist:",
    ...REQUIRED_DOCUMENTS.map((d) => `- ${d.label}: ${d.description}`)
  ].join("\n");

  const userContent =
    documentSummaries.length > 0
      ? `Uploaded documents (JSON):\n${JSON.stringify(documentSummaries, null, 2)}`
      : "No documents have been uploaded yet — every checklist item is missing.";

  const response = await anthropic.messages.create({
    model: await getAnthropicModel(),
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userContent }]
  });

  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  // The model is asked for JSON only, but strips fences defensively in case
  // it wraps the array in a ```json code block anyway.
  const cleaned = reply.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("The AI's response wasn't valid JSON — try running the gap check again.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("The AI's response wasn't in the expected format — try running the gap check again.");
  }

  return { configured: true, results: parsed, generatedAt: new Date().toISOString() };
}
