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
