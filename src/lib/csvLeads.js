// Deliberately simple: splits on literal commas, no quoted-field/escaped-comma
// support (RFC 4180 style). Fine for names/companies/emails, which rarely
// contain literal commas in practice for this internal tool — if that stops
// being true, this needs a real CSV parser instead of hand-rolling one.
export function parseLeadsCsv(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["No content to parse."] };
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const requiredFields = ["name", "company", "email"];
  const missingFields = requiredFields.filter((field) => !header.includes(field));
  if (missingFields.length > 0) {
    return {
      rows: [],
      errors: [`CSV header is missing required column(s): ${missingFields.join(", ")}. Expected header: name,company,email,owner`]
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const lineNumber = i + 1;
    const record = {};
    header.forEach((field, index) => {
      record[field] = cells[index] ?? "";
    });

    if (!record.name || !record.company || !record.email) {
      errors.push(`Line ${lineNumber}: missing required field(s) (need name, company, email).`);
      continue;
    }
    if (!emailPattern.test(record.email)) {
      errors.push(`Line ${lineNumber}: invalid email "${record.email}".`);
      continue;
    }

    rows.push({
      name: record.name,
      company: record.company,
      email: record.email,
      owner: record.owner || "Rahul R"
    });
  }

  return { rows, errors };
}

function escapeCsvCell(value) {
  const normalized = String(value ?? "");
  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

// Builds CSV text (header + rows) for both the "download a starter template"
// and "download the rows that will actually be imported" cases — same shape
// parseLeadsCsv expects back, so a downloaded/re-uploaded file round-trips.
export function buildLeadsCsv(rows) {
  const header = ["name", "company", "email", "owner"];
  const lines = [header.join(","), ...rows.map((row) => header.map((field) => escapeCsvCell(row[field])).join(","))];
  return lines.join("\n");
}
