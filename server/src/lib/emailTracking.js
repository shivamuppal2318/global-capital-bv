import { signTrackingToken } from "./trackingToken.js";

function trackingBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;
}

export function trackingPixelUrl(activityLogId) {
  return `${trackingBaseUrl()}/track/open/${activityLogId}/${signTrackingToken(activityLogId)}`;
}

export function trackingClickUrl(activityLogId, destinationUrl) {
  return `${trackingBaseUrl()}/track/click/${activityLogId}/${signTrackingToken(activityLogId)}?url=${encodeURIComponent(destinationUrl)}`;
}

// Appends a 1x1 invisible tracking pixel just before </body> (or at the end
// if there's no body tag — a template's html could be a bare fragment).
// A recipient's mail client loading this image is what "email opened"
// means in practice — imperfect (many clients block remote images by
// default, so this systematically undercounts opens), but it's the
// standard mechanism every email platform uses; there isn't a better one.
export function injectTrackingPixel(html, activityLogId) {
  const pixelTag = `<img src="${trackingPixelUrl(activityLogId)}" width="1" height="1" alt="" style="display:none;" />`;
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
