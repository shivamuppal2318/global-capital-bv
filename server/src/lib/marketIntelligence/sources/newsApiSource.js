// NewsAPI.ai (Event Registry) — https://newsapi.ai. No account available
// here, so the endpoint URL and response shape below are written from
// their public docs and NOT verified against a live call. Before relying
// on this, hit the real endpoint once with a valid key and adjust
// normalizeNewsApiArticle() to match whatever actually comes back.
const REQUIRED_ENV = "NEWSAPI_AI_KEY";

export function isNewsApiConfigured() {
  return Boolean(process.env[REQUIRED_ENV]);
}

// Pure — testable without any network access or API key.
export function normalizeNewsApiArticle(article) {
  return {
    source: "NEWSAPI",
    sourceUrl: article.url,
    rawTitle: article.title,
    rawContent: article.body ?? article.title,
    rawPublishedAt: article.dateTimePub ? new Date(article.dateTimePub) : null
  };
}

export async function fetchNewsApiSignals({ query = "private equity funding" } = {}) {
  if (!isNewsApiConfigured()) {
    throw new Error(`NewsAPI.ai is not configured — set ${REQUIRED_ENV}.`);
  }

  const response = await fetch("https://eventregistry.org/api/v1/article/getArticles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "getArticles",
      keyword: query,
      articlesSortBy: "date",
      articlesCount: 25,
      apiKey: process.env[REQUIRED_ENV]
    })
  });

  if (!response.ok) {
    throw new Error(`NewsAPI.ai request failed: ${response.status}`);
  }

  const data = await response.json();
  const articles = data?.articles?.results ?? [];
  return articles.map(normalizeNewsApiArticle);
}
