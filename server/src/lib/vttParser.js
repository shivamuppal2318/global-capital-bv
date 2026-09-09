// Turns Zoom's WebVTT audio-transcript file into plain text — Zoom's own
// format (confirmed against their published transcript samples) is
// standard VTT: a "WEBVTT" header, then repeating blocks of a numeric cue
// index, a "start --> end" timestamp line, then one or more text lines
// (often "Speaker Name: said this"), separated by blank lines.
//
// Deliberately lossy: cue numbers and timestamps are dropped, keeping only
// the spoken text (with speaker labels, since Zoom includes those inline)
// — that's what an AI summary and a human skim both actually want, not a
// time-coded transcript.
export function parseVttToPlainText(vttContent) {
  if (!vttContent || typeof vttContent !== "string") return "";

  const CUE_INDEX = /^\d+$/;
  const TIMESTAMP_LINE = /-->/;

  const lines = vttContent.replace(/\r\n/g, "\n").split("\n");
  const textLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "WEBVTT") continue;
    if (line.startsWith("NOTE")) continue;
    if (CUE_INDEX.test(line)) continue;
    if (TIMESTAMP_LINE.test(line)) continue;
    textLines.push(line);
  }

  // Consecutive lines from the same speaker often arrive as separate cues
  // (one per sentence) — collapsing runs of plain continuation text onto
  // one paragraph per speaker turn reads far closer to a real transcript
  // than one short line per cue.
  const paragraphs = [];
  let current = null;
  for (const line of textLines) {
    const speakerMatch = line.match(/^([^:]{1,60}):\s*(.*)$/);
    if (speakerMatch && speakerMatch[1] === current?.speaker) {
      // Same speaker as the running paragraph — this is a continuation
      // cue, not a new turn, so fold it in instead of starting a new one.
      current.text += ` ${speakerMatch[2]}`;
    } else if (speakerMatch) {
      if (current) paragraphs.push(current);
      current = { speaker: speakerMatch[1], text: speakerMatch[2] };
    } else if (current) {
      current.text += ` ${line}`;
    } else {
      current = { speaker: null, text: line };
    }
  }
  if (current) paragraphs.push(current);

  return paragraphs.map((p) => (p.speaker ? `${p.speaker}: ${p.text}` : p.text)).join("\n").trim();
}
