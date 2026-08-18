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
  const match = itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXmlEntities(match[1]) : null;
}

// Pure — testable without any network access. Drops items missing a title
// or link rather than passing through a half-formed signal that would fail
// confusingly further down the pipeline.
export function parseGoogleNewsRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((itemXml) => {
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link");
      const pubDate = extractTag(itemXml, "pubDate");
      const description = extractTag(itemXml, "description");
      return {
        source: "GOOGLE_NEWS",
        sourceUrl: link,
        rawTitle: title,
        rawContent: description ?? title,
        rawPublishedAt: pubDate ? new Date(pubDate) : null
      };
    })
    .filter((item) => item.rawTitle && item.sourceUrl);
}

export async function fetchGoogleNewsSignals({ query = "private equity funding acquisition" } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
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
