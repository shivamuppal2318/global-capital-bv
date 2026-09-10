// Scopes a query to only the rows a given caller is allowed to see, across
// every staff-side screen that's about one lead's deal work (CRM Workspace,
// NDA, IOI, Visit Planning, Field Visit/Term Sheet, Zoom Call, Data Room).
// Two restricted caller types:
// - A Channel Partner sees only their own referred leads, via
//   Lead.channelPartner -- the pre-existing convention
//   channelPartners.js's own withReferredLeads already uses.
// - A non-admin staff EMPLOYEE sees only their own leads, via Lead.owner --
//   the free-text "who currently holds this account" field, same
//   convention lib/executiveKpis.js already established for DOE-scoping
//   the Executive Dashboard/Outreach-DOE screens.
// An ADMIN, or a request with no req.user at all (an external API caller,
// e.g. the lead-ingestion webhook), is always unscoped ({}).
export function leadOwnerWhereClause(req) {
  if (req.channelPartner) return { channelPartner: req.channelPartner.businessName };
  if (req.user && req.user.role !== "ADMIN") return { owner: req.user.name };
  return {};
}

// Channel-Partner-only, for a model that relates to Lead via a `lead`
// relation rather than carrying channelPartner directly (NdaRecord,
// IoiRecord, VisitPlan, DealStageRecord, Meeting, Document). Deliberately
// does NOT also handle the non-admin-employee case here: NdaRecord/
// IoiRecord/VisitPlan/DealStageRecord each carry their own `owner` field
// and must be scoped by THAT (see employeeOwnerWhereClause below), not by
// the parent Lead's -- the two can genuinely differ (a different rep can
// run the NDA than the one who owns the deal). Meeting/Document have no
// owner field of their own, so those need the lead-relation employee
// scope instead -- see relatedLeadEmployeeOwnerWhereClause /
// documentEmployeeOwnerWhereClause below.
export function relatedLeadOwnerWhereClause(req) {
  return req.channelPartner ? { lead: { channelPartner: req.channelPartner.businessName } } : {};
}

// For models with their own free-text `owner` field (NdaRecord, IoiRecord,
// VisitPlan, DealStageRecord) -- restricts a non-admin EMPLOYEE to their
// own records directly. Spread this ALONGSIDE relatedLeadOwnerWhereClause
// (unchanged, above) in the same where clause -- they check mutually
// exclusive caller types (Channel Partner vs. non-admin employee) and set
// different keys (`lead` vs `owner`), so combining both is always safe.
export function employeeOwnerWhereClause(req) {
  if (req.channelPartner || !req.user || req.user.role === "ADMIN") return {};
  return { owner: req.user.name };
}

// For models with NO owner field of their own (Meeting) -- restricts a
// non-admin EMPLOYEE via the parent Lead's owner instead. Same
// "spread alongside relatedLeadOwnerWhereClause" pattern as
// employeeOwnerWhereClause above, just nested under `lead` since that's
// the only place this model carries any owner-shaped signal at all.
export function relatedLeadEmployeeOwnerWhereClause(req) {
  if (req.channelPartner || !req.user || req.user.role === "ADMIN") return {};
  return { lead: { owner: req.user.name } };
}

// Data Room specifically: Document.leadId is nullable (null = the shared
// company-wide template library, not tied to any lead). A non-admin
// EMPLOYEE still sees that shared library -- it's a real company
// resource, not any one rep's private data -- on top of documents
// attached to leads they own. A Channel Partner's own scoping
// (relatedLeadOwnerWhereClause, unchanged) deliberately does NOT get this
// exception: a partner only ever sees documents on their own referred
// leads, same as before this existed.
export function documentEmployeeOwnerWhereClause(req) {
  if (req.channelPartner || !req.user || req.user.role === "ADMIN") return {};
  return { OR: [{ leadId: null }, { lead: { owner: req.user.name } }] };
}
