import { prisma } from "../prisma.js";
import { fetchNewsApiSignals, isNewsApiConfigured } from "./sources/newsApiSource.js";
import { fetchExaSignals, isExaConfigured } from "./sources/exaSource.js";
import { fetchFirecrawlSignals, isFirecrawlConfigured } from "./sources/firecrawlSource.js";
import { fetchGoogleNewsSignals, isGoogleNewsConfigured } from "./sources/googleNewsRssSource.js";
import { apolloLookupCompany, isApolloConfigured, summarizeApolloEnrichment } from "./sources/apolloSource.js";
import { processSignalWithAi, isAiProcessorConfigured } from "./aiProcessor.js";
import { computeContentHash } from "./dedup.js";
import { findExistingLeadByCompany } from "./companyMatcher.js";

const SOURCES = [
  { name: "NEWSAPI", isConfigured: isNewsApiConfigured, fetch: fetchNewsApiSignals },
  { name: "EXA", isConfigured: isExaConfigured, fetch: fetchExaSignals },
  { name: "FIRECRAWL", isConfigured: isFirecrawlConfigured, fetch: fetchFirecrawlSignals },
  // No credential gate — always runs, so this is the source most likely to
  // actually produce signals until NewsAPI/Exa/Firecrawl/AI keys exist.
  { name: "GOOGLE_NEWS", isConfigured: isGoogleNewsConfigured, fetch: fetchGoogleNewsSignals }
];

// Mirrors the flowchart exactly: fetch from every configured source ->
// dedup -> AI-process -> existing company? -> yes: log against that lead /
// no: Apollo lookup -> new lead. Every stage is isolated with its own
// try/catch (same "one bad item shouldn't abort the whole batch" principle
// as the IMAP poller and CSV bulk import) — one dead source, one malformed
// article, or one failed AI call shouldn't stop everything else in the run.
//
// `defaultCampaignId` is required to create a genuinely new lead (a lead
// needs a campaign) — without it, an unmatched signal is recorded and
// marked IGNORED rather than silently dropped.
export async function runIntelligencePipeline({ query, firecrawlUrls = [], defaultCampaignId } = {}) {
  const summary = {
    skippedSources: [],
    fetched: 0,
    duplicates: 0,
    processed: 0,
    matched: 0,
    created: 0,
    ignored: 0,
    failed: 0
  };

  for (const source of SOURCES) {
    if (!source.isConfigured()) {
      summary.skippedSources.push(source.name);
      continue;
    }

    let rawSignals;
    try {
      rawSignals = source.name === "FIRECRAWL" ? await source.fetch({ urls: firecrawlUrls }) : await source.fetch({ query });
    } catch (err) {
      console.error(`[market-intelligence] ${source.name} fetch failed:`, err.message);
      continue;
    }

    for (const raw of rawSignals) {
      summary.fetched += 1;
      await processOneSignal(raw, defaultCampaignId, summary);
    }
  }

  return summary;
}

async function processOneSignal(raw, defaultCampaignId, summary) {
  const contentHash = computeContentHash(raw.source, raw.rawTitle);

  const existingSignal = await prisma.marketSignal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    summary.duplicates += 1;
    return;
  }

  const signal = await prisma.marketSignal.create({
    data: {
      source: raw.source,
      sourceUrl: raw.sourceUrl,
      rawTitle: raw.rawTitle,
      rawContent: raw.rawContent,
      rawPublishedAt: raw.rawPublishedAt,
      contentHash,
      status: "PENDING"
    }
  });

  try {
    if (!isAiProcessorConfigured()) {
      throw new Error("AI processor not configured — see aiProcessor.js");
    }
    const processed = await processSignalWithAi(raw);
    const matchedLead = await findExistingLeadByCompany(processed.entityName);

    if (matchedLead) {
      await prisma.$transaction([
        prisma.marketSignal.update({
          where: { id: signal.id },
          data: {
            status: "PROCESSED",
            entityName: processed.entityName,
            signalType: processed.signalType,
            relevanceScore: processed.relevanceScore,
            aiSummary: processed.summary,
            matchedLeadId: matchedLead.id
          }
        }),
        prisma.emailActivityLog.create({
          data: {
            leadId: matchedLead.id,
            kind: "MANUAL_NOTE",
            title: `Market signal: ${processed.signalType}`,
            detail: `${processed.summary} (source: ${raw.sourceUrl})`
          }
        })
      ]);
      summary.matched += 1;
    } else if (defaultCampaignId) {
      await createLeadFromSignal(signal, processed, defaultCampaignId, summary);
    } else {
      await prisma.marketSignal.update({
        where: { id: signal.id },
        data: {
          status: "IGNORED",
          entityName: processed.entityName,
          signalType: processed.signalType,
          relevanceScore: processed.relevanceScore,
          aiSummary: processed.summary,
          failureReason: "No matching lead and no defaultCampaignId provided for new-lead creation."
        }
      });
      summary.ignored += 1;
    }
    summary.processed += 1;
  } catch (err) {
    await prisma.marketSignal.update({ where: { id: signal.id }, data: { status: "FAILED", failureReason: err.message } });
    summary.failed += 1;
  }
}

async function createLeadFromSignal(signal, processed, defaultCampaignId, summary) {
  try {
    if (!isApolloConfigured()) {
      throw new Error("Apollo not configured — see sources/apolloSource.js");
    }
    // Feeds the AI-extracted entity name into Apollo to enrich it with a
    // real company profile (industry/size/revenue/location) and a contact
    // — not just a bare name, so the new lead carries genuinely useful
    // deal-sourcing context, not a placeholder.
    const apolloResult = await apolloLookupCompany(processed.entityName);

    const newLead = await prisma.emailLead.create({
      data: {
        name: apolloResult.contact?.name ?? "Unknown contact",
        company: processed.entityName,
        email: apolloResult.contact?.email ?? `unknown@${apolloResult.domain ?? "example.com"}`,
        owner: "Unassigned",
        campaignId: defaultCampaignId
      }
    });

    // Previously the rich Apollo enrichment (industry, size, revenue,
    // location) was fetched and then discarded the moment the lead was
    // created — nothing recorded it anywhere. Logging it here is what
    // makes "feed the entity into Apollo and extract the details" actually
    // mean something beyond picking one contact's name and email.
    await prisma.emailActivityLog.create({
      data: {
        leadId: newLead.id,
        kind: "MANUAL_NOTE",
        title: "Created from market signal — Apollo enrichment",
        detail: `${summarizeApolloEnrichment(apolloResult)} · Signal: ${processed.summary} (source: ${signal.sourceUrl})`
      }
    });

    await prisma.marketSignal.update({
      where: { id: signal.id },
      data: {
        status: "PROCESSED",
        entityName: processed.entityName,
        signalType: processed.signalType,
        relevanceScore: processed.relevanceScore,
        aiSummary: processed.summary,
        createdLeadId: newLead.id
      }
    });
    summary.created += 1;
  } catch (apolloErr) {
    await prisma.marketSignal.update({
      where: { id: signal.id },
      data: {
        status: "IGNORED",
        entityName: processed.entityName,
        signalType: processed.signalType,
        relevanceScore: processed.relevanceScore,
        aiSummary: processed.summary,
        failureReason: `Apollo lookup failed: ${apolloErr.message}`
      }
    });
    summary.ignored += 1;
  }
}
