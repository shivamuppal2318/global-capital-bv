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
  firstName: ["first name", "firstname", "fname", "given name"],
  lastName: ["last name", "lastname", "lname", "surname", "family name"],
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
  // A name can come as a single "name" column or split "first name"/"last
  // name" columns (the common export shape from newsletter/CRM tools) — at
  // least one of those forms has to be present. Company is no longer
  // required: it defaults to "—" per row below, matching the same
  // already-established fallback the inbound lead webhook uses (see
  // server/src/routes/emailLeads.js's POST /inbound).
  const hasNameColumn = header.includes("name") || header.includes("firstName");
  const missing = [!header.includes("email") ? "email" : null, !hasNameColumn ? "name (or first name)" : null].filter(Boolean);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`CSV header is missing required column(s): ${missing.join(", ")}. Expected header: email,first name,last name,country`]
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

    const name = record.name || [record.firstName, record.lastName].filter(Boolean).join(" ").trim();
    if (!name || !record.email) {
      errors.push(`Line ${lineNumber}: missing required field(s) (need email, and a name or first/last name).`);
      continue;
    }
    if (!emailPattern.test(record.email)) {
      errors.push(`Line ${lineNumber}: invalid email "${record.email}".`);
      continue;
    }

    rows.push({
      name,
      // No company column in this format — "—" mirrors the same fallback
      // the inbound lead webhook already uses when company isn't provided
      // (server/src/routes/emailLeads.js's POST /inbound).
      company: record.company || "—",
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
