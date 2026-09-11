// A minimal RFC 4180 CSV writer — only wraps a field in quotes (doubling
// any quote inside it) when it actually contains a comma, quote, or
// newline, so the common case stays plain and readable in a text editor,
// not just a spreadsheet app.
function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// `columns`: [{ label, value(row) }]. CRLF line endings — Excel (still the
// most common opener for a downloaded CSV) mis-renders bare LF as one long
// row on Windows.
export function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}
