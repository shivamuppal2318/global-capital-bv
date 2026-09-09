import { signTrackingToken } from "./trackingToken.js";

function trackingBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;
}

// trackingRouter is mounted at /api/track (see app.js) — these previously
// omitted /api, so every open-tracking pixel and click-tracked link in a
// real sent email hit the global auth gate (401) instead of the actual
// public route: opens were never recorded, and a clicked link never
// redirected the recipient anywhere.
export function trackingPixelUrl(activityLogId) {
  return `${trackingBaseUrl()}/api/track/open/${activityLogId}/${signTrackingToken(activityLogId)}`;
}

export function trackingClickUrl(activityLogId, destinationUrl) {
  return `${trackingBaseUrl()}/api/track/click/${activityLogId}/${signTrackingToken(activityLogId)}?url=${encodeURIComponent(destinationUrl)}`;
}

// Appends a 1x1 invisible tracking pixel just before </body> (or at the end
// if there's no body tag — a template's html could be a bare fragment).
// A recipient's mail client loading this image is what "email opened"
// means in practice — imperfect (many clients block remote images by
// default, so this systematically undercounts opens), but it's the
// standard mechanism every email platform uses; there isn't a better one.
//
// Deliberately NOT display:none — confirmed live this was the actual bug
// behind every campaign showing a permanent 0% open rate: Gmail (and most
// other real mail clients) treat display:none as a spam/tracker-evasion
// signal and skip fetching the image entirely, so the pixel never loaded
// and no EMAIL_OPENED event was ever recorded, real opens included. The
// 1x1 size alone already makes it invisible; border:0 avoids an old-Outlook
// border artifact around a bare <img> with no CSS at all.
export function injectTrackingPixel(html, activityLogId) {
  const pixelTag = `<img src="${trackingPixelUrl(activityLogId)}" width="1" height="1" alt="" style="border:0;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixelTag}</body>`);
  }
  return `${html}${pixelTag}`;
}

// Rewrites every http(s) <a href="..."> in the HTML to route through the
// click-tracking redirect first. Deliberately excludes the unsubscribe
// link itself — wrapping *that* in a tracking redirect would be actively
// hostile (a one-click unsubscribe should go straight to the unsubscribe
// handler, not bounce through another hop first) — matched by checking the
// href against the known unsubscribeUrl passed in.
//
// Regex-based, not a full HTML parser — simple and dependency-free, but
// won't handle single-quoted or unquoted href attributes or hrefs split
// across lines. Good enough for the templates this app generates (all
// double-quoted, single-line hrefs); revisit with a real HTML parser if
// hand-authored templates ever produce something fancier.
export function wrapLinksForClickTracking(html, activityLogId, { skipUrl } = {}) {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (match, url) => {
    if (skipUrl && url === skipUrl) {
      return match;
    }
    return `href="${trackingClickUrl(activityLogId, url)}"`;
  });
}
