// Single source of truth for what an employee can be granted access to.
// The ids match the sidebar nav ids in src/data/crmData.js so the Admin
// Panel checkbox list, the nav filtering, and the API guards below can't
// drift apart.
export const MODULES = [
  { id: "command-center", label: "Command Center", group: "Intelligence" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" },
  { id: "lead-discovery", label: "Lead Discovery", group: "Intelligence" },
  { id: "leads", label: "Leads", group: "Intelligence" },
  { id: "qualification", label: "Qualification", group: "Intelligence" },
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach" },
  { id: "cold-bulk-mailing", label: "Cold Bulk Mailing", group: "CRM & Outreach" },
  { id: "whatsapp-business", label: "WhatsApp Business", group: "CRM & Outreach" },
  { id: "telephony-sms", label: "Telephony & SMS", group: "CRM & Outreach" },
  { id: "templates-cadences", label: "Templates & Cadences", group: "CRM & Outreach" },
  { id: "companies", label: "Companies", group: "Relationships" },
  { id: "contacts", label: "Contacts", group: "Relationships" },
  { id: "communications", label: "Communications", group: "Relationships" },
  { id: "meetings", label: "Meetings", group: "Relationships" },
  { id: "pipeline", label: "Pipeline", group: "Deal Execution" },
  { id: "deals", label: "Deals", group: "Deal Execution" }
];

export const MODULE_IDS = MODULES.map((m) => m.id);

// What a newly created employee gets before an admin tailors it — the
// day-to-day CRM surface, without the AI/intelligence tooling or the
// company-wide outreach machinery.
export const DEFAULT_EMPLOYEE_MODULES = ["crm-workspace", "leads", "companies", "contacts", "communications", "meetings"];

export function isAdmin(user) {
  return user?.role === "ADMIN";
}

export function hasModule(user, moduleId) {
  if (isAdmin(user)) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(moduleId);
}

// Route guard. Pass every module that should unlock the route — a router
// shared by two modules (e.g. email templates serve both Cold Bulk Mailing
// and Templates & Cadences) passes both rather than being locked to one.
export function requireModule(...moduleIds) {
  return (req, res, next) => {
    if (moduleIds.some((id) => hasModule(req.user, id))) return next();
    return res.status(403).json({
      error: "You don't have access to this module. Ask an admin to enable it for your account."
    });
  };
}
