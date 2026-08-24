// Single source of truth for what an employee can be granted access to.
// The ids match the sidebar nav ids in src/data/crmData.js so the Admin
// Panel checkbox list, the nav filtering, and the API guards below can't
// drift apart.
export const MODULES = [
  { id: "command-center", label: "Executive Dashboard", group: "Intelligence" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" },
  { id: "leads", label: "Leads", group: "Intelligence" },
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach" },
  { id: "cold-bulk-mailing", label: "MailX", group: "CRM & Outreach" },
  { id: "whatsapp-business", label: "WhatsApp Business", group: "CRM & Outreach" },
  { id: "nda", label: "NDA", group: "Relationships" },
  { id: "meetings", label: "Zoom Call", group: "Relationships" },
  { id: "data-room", label: "Data Room", group: "Relationships" },
  { id: "ioi", label: "IOI", group: "Relationships" },
  { id: "visit-planning", label: "Visit Planning", group: "Relationships" },
  { id: "field-visit", label: "Field Visit", group: "Relationships" },
  { id: "term-sheet", label: "Term Sheet", group: "Relationships" }
];

export const MODULE_IDS = MODULES.map((m) => m.id);

// What a newly created employee gets before an admin tailors it — the
// day-to-day CRM surface, without the AI/intelligence tooling or the
// company-wide outreach machinery.
//
// Deliberately excludes "leads": that nav item opens the Email Outreach
// module (see App.jsx), so granting it hands over campaign sending too.
// "crm-workspace" already covers day-to-day lead handling, so outreach
// stays something an admin turns on per person rather than a default.
export const DEFAULT_EMPLOYEE_MODULES = ["crm-workspace", "meetings"];

// Drops ids that no longer exist. Accounts granted a module before it was
// retired still carry it in the database; reporting those back would
// overstate what someone can actually reach ("6 modules" when only 2 are
// real). They're cleaned from storage the next time an admin saves.
export function liveModules(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((id) => MODULE_IDS.includes(id));
}

export function isAdmin(user) {
  return user?.role === "ADMIN";
}

export function hasModule(user, moduleId) {
  if (isAdmin(user)) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(moduleId);
}

// Route guard. Pass every module that should unlock the route — for a
// router shared by more than one module, pass all of them rather than
// locking it to one.
export function requireModule(...moduleIds) {
  return (req, res, next) => {
    if (moduleIds.some((id) => hasModule(req.user, id))) return next();
    return res.status(403).json({
      error: "You don't have access to this module. Ask an admin to enable it for your account."
    });
  };
}
