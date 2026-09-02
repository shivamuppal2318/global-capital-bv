import { prisma } from "../db.js";
import { getMeetingRecordings, downloadZoomRecordingFile } from "./zoomClient.js";
import { parseVttToPlainText } from "./vttParser.js";
import { getAnthropicClient, getAnthropicModel } from "./anthropic.js";

// Shared by the recording.completed webhook (routes/zoomWebhook.js, the
// automatic path) and the manual "Fetch Transcript & Summary" button
// (routes/meetings.js, for whenever the webhook hasn't fired yet — Zoom's
// processing lag, a webhook delivery miss, or local dev where Zoom has no
// way to reach this server at all) — one pipeline, so the two paths can't
// drift into producing different results for the same recording.
//
// zoomIdentifier is whatever Zoom's API will accept for GET
// /meetings/{id}/recordings — the numeric meeting ID (manual path, already
// on the Meeting row) or the recording's own UUID (webhook path, from the
// payload) both work.
export async function processMeetingRecording({ meeting, zoomSettings, zoomIdentifier }) {
  const recordings = await getMeetingRecordings({
    accountId: zoomSettings.accountId,
    clientId: zoomSettings.clientId,
    clientSecret: zoomSettings.clientSecret,
    meetingId: zoomIdentifier ?? meeting.zoomMeetingId
  });

  if (!recordings) {
    return { ok: false, reason: "No recording found for this call yet — Zoom may still be processing it." };
  }

  const transcriptFile = (recordings.recording_files ?? []).find(
    (f) => f.file_type === "TRANSCRIPT" || f.recording_type === "audio_transcript"
  );
  if (!transcriptFile) {
    return {
      ok: false,
      reason: "Zoom has a recording for this call, but no audio transcript — check that Audio Transcript is turned on for Cloud Recording in the Zoom account's recording settings."
    };
  }

  const vttContent = await downloadZoomRecordingFile({
    accountId: zoomSettings.accountId,
    clientId: zoomSettings.clientId,
    clientSecret: zoomSettings.clientSecret,
    downloadUrl: transcriptFile.download_url
  });
  const transcriptText = parseVttToPlainText(vttContent);
  if (!transcriptText) {
    return { ok: false, reason: "The transcript file came back empty." };
  }

  const summary = await summarizeTranscript(transcriptText, {
    leadName: meeting.lead?.name,
    company: meeting.lead?.company
  });

  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      zoomRecordingUuid: recordings.uuid ?? meeting.zoomRecordingUuid,
      transcriptText,
      transcriptFetchedAt: new Date(),
      transcriptSummary: summary,
      transcriptSummaryUpdatedAt: summary ? new Date() : meeting.transcriptSummaryUpdatedAt
    },
    include: { lead: true }
  });

  return { ok: true, meeting: updated, summarized: Boolean(summary) };
}

// Same anthropic.messages.create pattern as the existing notes summariser
// (routes/meetings.js's POST /:id/summarise) — different system prompt
// since this is a full call transcript, not hand-typed notes, and can run
// thousands of words long. No Claude key configured isn't treated as an
// error here (unlike the notes route, which is a direct user action) —
// the transcript is still worth having on its own; summary just stays
// null until a key is added, same "store what succeeded" reasoning as
// sendSystemEmail's {sent:false, reason} pattern elsewhere in this app.
export async function summarizeTranscript(transcriptText, { leadName, company } = {}) {
  const anthropic = await getAnthropicClient();
  if (!anthropic) return null;

  const who = leadName ? `${leadName}${company ? ` (${company})` : ""}` : "the counterparty";
  // Anthropic's context window comfortably fits a full call transcript,
  // but a stray multi-hour recording could run long enough to matter for
  // cost — capped generously rather than silently truncating a normal
  // 30-60 minute call's transcript, which won't come close to this.
  const truncated = transcriptText.length > 60_000 ? `${transcriptText.slice(0, 60_000)}\n\n[transcript truncated]` : transcriptText;

  const response = await anthropic.messages.create({
    model: await getAnthropicModel(),
    max_tokens: 600,
    system:
      "You summarise Zoom call transcripts for a private equity deal team. Reply with 4-6 short bullet points covering: what was discussed, any concerns, objections or open questions raised, decisions made, and clear next steps with who owns them if stated. " +
      "Use only what the transcript actually says — do not invent numbers, commitments or next steps that weren't said. If the transcript is too thin or garbled to summarise meaningfully, say so in one line instead of guessing.",
    messages: [{ role: "user", content: `Call with ${who}.\n\nTranscript:\n${truncated}` }]
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
