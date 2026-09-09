// Zoom Server-to-Server OAuth — the current recommended way to call Zoom's
// API from a backend with no per-user login flow. Requires an Account ID,
// Client ID and Client Secret from a "Server-to-Server OAuth" app created in
// the Zoom App Marketplace, plus the email of a licensed user on that
// account to schedule meetings as (hostEmail).

async function getAccessToken({ accountId, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.reason ?? body?.error_description ?? "Zoom rejected the credentials.");
  }
  return body.access_token;
}

export async function testZoomConnection({ accountId, clientId, clientSecret, hostEmail }) {
  const token = await getAccessToken({ accountId, clientId, clientSecret });
  const response = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(hostEmail)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Could not find that host on the connected Zoom account.");
  }
  return { displayName: `${body.first_name ?? ""} ${body.last_name ?? ""}`.trim() || body.email, email: body.email };
}

export async function createZoomMeeting({ accountId, clientId, clientSecret, hostEmail, topic, startTime, durationMinutes }) {
  const token = await getAccessToken({ accountId, clientId, clientSecret });
  const response = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(hostEmail)}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time: new Date(startTime).toISOString(),
      duration: durationMinutes,
      settings: { join_before_host: true, waiting_room: false }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Zoom rejected the meeting request.");
  }
  return { id: String(body.id), joinUrl: body.join_url, startUrl: body.start_url };
}

// Cloud Recording's list of files for one meeting (video, audio, chat,
// and — when "Audio transcript" is on for the account — a TRANSCRIPT file
// in WebVTT). Requires Zoom Cloud Recording, which needs a Pro-or-higher
// plan; a Free/Basic account has nothing to return here. meetingId can be
// either the numeric meeting ID or the recording's own UUID — Zoom accepts
// both on this endpoint, double-URL-encoded when it's a UUID starting with
// "/" or containing "//" per Zoom's own docs, which meeting UUIDs often do.
export async function getMeetingRecordings({ accountId, clientId, clientSecret, meetingId }) {
  const token = await getAccessToken({ accountId, clientId, clientSecret });
  const encodedId = /[/]/.test(String(meetingId))
    ? encodeURIComponent(encodeURIComponent(meetingId))
    : encodeURIComponent(meetingId);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodedId}/recordings`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null; // Not recorded, or Zoom hasn't finished processing yet.
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Zoom rejected the recordings request.");
  }
  return body;
}

// Recording file download URLs need the same bearer token as every other
// Zoom API call (an OAuth access token appended as a header works exactly
// like Zoom's alternative `?access_token=` query-param form) — this is a
// plain file fetch, not a v2 JSON endpoint, so the body is returned as text
// as-is (the transcript file is WebVTT; see lib/vttParser.js for parsing).
export async function downloadZoomRecordingFile({ accountId, clientId, clientSecret, downloadUrl }) {
  const token = await getAccessToken({ accountId, clientId, clientSecret });
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Zoom rejected the recording file download (${response.status}).`);
  }
  return response.text();
}
