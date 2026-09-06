import { prisma } from "./prisma.js";

// A sending mailbox can be tagged with the country it represents (e.g. a
// UAE-registered inbox for AE leads) — matching sender geography to
// recipient geography is a real deliverability lever a single campaign-wide
// "Sending mailbox" assignment (routes/emailCampaigns.js) can't express,
// since one campaign's leads often span several countries. A lead whose
// country matches an active mailbox's country always routes there,
// regardless of which mailbox the campaign itself is assigned to. Falls
// back to the campaign's assigned mailbox (then the single global
// env-configured provider) for any lead whose country isn't set, or has no
// matching mailbox — so nothing breaks for countries that haven't been
// configured yet.
// `client` is injectable (same reason as accountSendCap.js's
// isAccountUnderDailyCap) — testable without mocking Prisma's proxy-based
// model delegates.
export async function resolveEmailAccount(lead, campaign, client = prisma) {
  if (lead.country) {
    // Scoped to the campaign's own owner boundary — without this, the
    // country match searched every mailbox in the system regardless of who
    // configured it. A Channel Partner's campaign could end up sending
    // through a completely different partner's (or a staff member's own)
    // connected mailbox just because it happened to share a country tag,
    // and a staff/admin campaign could just as easily route through a
    // partner's mailbox instead. Each side only ever matches within its own
    // boundary: a partner's campaign only matches that same partner's own
    // mailboxes; a staff/admin campaign only matches non-partner mailboxes
    // (the shared company one, or any employee's own).
    const ownerFilter = campaign?.ownerChannelPartnerId
      ? { ownerChannelPartnerId: campaign.ownerChannelPartnerId }
      : { ownerChannelPartnerId: null };
    const match = await client.emailAccount.findFirst({
      where: { isActive: true, country: { equals: lead.country, mode: "insensitive" }, ...ownerFilter },
      orderBy: { updatedAt: "desc" }
    });
    if (match) {
      return match;
    }
  }
  // A campaign's explicitly-assigned mailbox was still used to send even
  // after an admin deactivated it — this fallback returned campaign.emailAccount
  // unconditionally, with no isActive check at all (unlike the country-match
  // branch above, which already required it). Deactivating a mailbox now
  // actually stops it being used here too, falling back to the single
  // global env-configured provider exactly as "no mailbox assigned" already does.
  return campaign?.emailAccount?.isActive ? campaign.emailAccount : null;
}
