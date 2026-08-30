// CRM Workspace's "Import" button — same simple, unquoted-comma parsing
// choice as lib/csvLeads.js (the cold-outreach domain's importer), but for
// the CRM Lead shape (mobile/capitalAsk/owner/territory) rather than
// EmailLead's (owner/country). Kept separate rather than shared since the
// two domains' required/optional fields genuinely differ.
export function parseCrmLeadsCsv(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["No content to parse."] };
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  if (!header.includes("name")) {
    return {
      rows: [],
      errors: ["CSV header is missing the required column: name. Expected header: name,company,email,mobile,capitalask,owner,territory"]
    };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const lineNumber = i + 1;
    const record = {};
    header.forEach((field, index) => {
      record[field] = cells[index] ?? "";
    });

    if (!record.name) {
      errors.push(`Line ${lineNumber}: missing required field "name".`);
      continue;
    }
    if (!record.email && !record.mobile) {
      errors.push(`Line ${lineNumber}: needs at least one contact method (email or mobile).`);
      continue;
    }

    rows.push({
      name: record.name,
      company: record.company || undefined,
      email: record.email || undefined,
      mobile: record.mobile || undefined,
      capitalAsk: record.capitalask || undefined,
      owner: record.owner || undefined,
      territory: record.territory || undefined
    });
  }

  return { rows, errors };
}
