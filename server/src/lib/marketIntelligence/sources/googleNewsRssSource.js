// Google News RSS search feed — https://news.google.com/rss/search?q=...
// Unlike the other three sources in this directory, this needs no API key
// or account: it's a public RSS endpoint, so it's the one source here that
// can produce genuinely real signals today without waiting on a credential.
// Response is RSS/XML, not JSON — parsed with a small regex-based extractor
// below rather than pulling in a full XML-parsing dependency, since Google
// News RSS's <item> structure is simple and stable enough not to need one.

export function isGoogleNewsConfigured() {
  return true;
}

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(itemXml, tag) {
  const match = itemXml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXmlEntities(match[1]) : null;
}

// Google's RSS <description> is always just the title re-wrapped in an <a>
// tag plus a <font> repeating the publisher name — never real article body
// text (verified against live responses). Sending that raw HTML to the AI
// processor as "content" is pure noise that reads as more substance than it
// is, so this uses the title alone (Google already appends " - Publisher"
// to it) rather than a description that adds nothing but markup.
export function parseGoogleNewsRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((itemXml) => {
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link");
      const pubDate = extractTag(itemXml, "pubDate");
      return {
        source: "GOOGLE_NEWS",
        sourceUrl: link,
        rawTitle: title,
        rawContent: title,
        rawPublishedAt: pubDate ? new Date(pubDate) : null
      };
    })
    .filter((item) => item.rawTitle && item.sourceUrl);
}

// Restricts results to the last 7 days via Google's own "when:" search
// operator (server-side filtering, not a client-side date guess) — matches
// the weekly pipeline cadence so each run only pulls what's new since the
// last one, instead of re-surfacing the same old articles every time.
export async function fetchGoogleNewsSignals({ query = "private equity funding acquisition", withinDays = 7 } = {}) {
  const scopedQuery = withinDays ? `${query} when:${withinDays}d` : query;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(scopedQuery)}&hl=en-US&gl=US&ceid=US:en`;
  // Google News RSS 403s on requests with no User-Agent — this isn't
  // impersonating a browser for scraping purposes, just satisfying that
  // check with a realistic value.
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; GlobalCapitalCRM/1.0)" } });
  if (!response.ok) {
    throw new Error(`Google News RSS request failed: ${response.status}`);
  }
  const xml = await response.text();
  return parseGoogleNewsRss(xml);
}
