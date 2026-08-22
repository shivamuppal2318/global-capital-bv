import fs from "node:fs/promises";

// Pulls readable text out of an uploaded file so the AI assistant can
// answer from it. Anything we can't read is not an error — the file is
// still stored, listed and downloadable, it just can't be cited. The
// reason is recorded so the UI can say so instead of leaving the user
// wondering why a document never gets referenced.

// Beyond this, storing the full text bloats the row and the AI prompt for
// no real gain — the assistant only ever sees an excerpt anyway.
const MAX_STORED_CHARS = 200_000;

const PLAIN_TEXT_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml"
];

function tidy(text) {
  return text
    .replace(/\r\n/g, "\n")
    // Collapse the runs of blank lines PDF extraction tends to produce.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractText(filePath, mimeType, originalName) {
  const ext = originalName.toLowerCase().split(".").pop();

  try {
    if (PLAIN_TEXT_TYPES.includes(mimeType) || ["txt", "md", "csv", "json", "xml", "html"].includes(ext)) {
      const raw = await fs.readFile(filePath, "utf8");
      const text = tidy(raw);
      return text
        ? { text: text.slice(0, MAX_STORED_CHARS), note: null }
        : { text: null, note: "The file is empty." };
    }

    if (mimeType === "application/pdf" || ext === "pdf") {
      // Imported lazily: pdf-parse pulls in a sizeable dependency tree, and
      // most uploads aren't PDFs.
      const { default: pdfParse } = await import("pdf-parse");
      const buffer = await fs.readFile(filePath);
      const parsed = await pdfParse(buffer);
      const text = tidy(parsed.text ?? "");
      return text
        ? { text: text.slice(0, MAX_STORED_CHARS), note: null }
        : {
            text: null,
            note: "No text layer found — this looks like a scanned PDF. The AI can't read it without OCR."
          };
    }

    if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const { default: mammoth } = await import("mammoth");
      const { value } = await mammoth.extractRawText({ path: filePath });
      const text = tidy(value ?? "");
      return text
        ? { text: text.slice(0, MAX_STORED_CHARS), note: null }
        : { text: null, note: "The document contains no readable text." };
    }

    if (mimeType.startsWith("image/")) {
      return { text: null, note: "Images aren't read as text — stored and downloadable, but the AI can't quote from it." };
    }

    // .doc (the pre-2007 binary format) is deliberately not handled:
    // mammoth only reads .docx, and adding a binary parser for a format
    // people rarely upload isn't worth the dependency.
    return { text: null, note: `No text extractor for ${mimeType || ext || "this file type"}.` };
  } catch (err) {
    // A corrupt or password-protected file shouldn't fail the upload —
    // keep the file, record why it isn't searchable.
    return { text: null, note: `Could not read the contents: ${err.message}` };
  }
}
