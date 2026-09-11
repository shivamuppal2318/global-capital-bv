// Where a lead lands when the inbound webhook caller doesn't specify a
// campaign — a generic website contact form has no business knowing this
// system's campaign names. Its own file so both emailLeads.js (creates it
// lazily) and channelPartnerScope.js (has to recognize it by name to grant
// every employee read access below) can import it without one importing
// the other.
export const WEBSITE_LEADS_CAMPAIGN_NAME = "Website Leads";
