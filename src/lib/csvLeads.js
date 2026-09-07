function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

const HEADER_ALIASES = {
  name: ["name", "full name", "fullname", "lead name", "contact name"],
  company: ["company", "company name", "companyname", "organization", "organisation"],
  email: ["email", "email address", "emailaddress", "contact email"],
  owner: ["owner", "assigned to", "assigned_to", "rep"],
  country: ["country", "country code", "country_code", "region"]
};

function normalizeHeaderCell(cell) {
  return cell
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function canonicalHeader(cell) {
  const normalized = normalizeHeaderCell(cell);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] ?? normalized;
}

export function parseLeadsCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["No content to parse."] };
  }

  const header = parseCsvLine(lines[0]).map(canonicalHeader);
  const requiredFields = ["name", "company", "email"];
  const missingFields = requiredFields.filter((field) => !header.includes(field));
  if (missingFields.length > 0) {
    return {
      rows: [],
      errors: [`CSV header is missing required column(s): ${missingFields.join(", ")}. Expected header: name,company,email,owner,country`]
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
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
      owner: record.owner || "Rahul R",
      // Optional — drives automatic sending-mailbox routing by country (see
      // server/src/lib/accountRouting.js). Blank is fine, just means no
      // country-based routing for that row.
      country: record.country || null
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
  const header = ["name", "company", "email", "owner", "country"];
  const lines = [header.join(","), ...rows.map((row) => header.map((field) => escapeCsvCell(row[field])).join(","))];
  return lines.join("\n");
}
