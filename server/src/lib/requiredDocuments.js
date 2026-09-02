// The standard due-diligence request list every prospective portfolio
// company is asked for (see "List of Documents"), for initial analysis and
// understanding an entity's financial and operational structure. Reference
// only — not tied to a specific lead/deal. Served to the frontend via
// GET /api/documents/required-documents so the Data Room checklist, the
// upload classifier, and the AI gap check can never disagree about the list.
export const REQUIRED_DOCUMENTS = [
  {
    label: "Certificate of Incorporation",
    description: "Certificate of Incorporation and business registration documents."
  },
  {
    label: "Company Profile",
    description: "Profile of the company, including details of Key Managerial Personnel."
  },
  {
    label: "Audited Financial Statements",
    description: "Balance sheet, P&L and cash flow statements for the last 3–5 years."
  },
  {
    label: "Loans & Debt Obligations",
    description:
      "Amount, tenure, interest rate and repayment schedules for existing loans/borrowings — please provide this as an Excel sheet. Also attach sanction/approval letters and term sheets for existing loans as well as any possible debt offers."
  },
  {
    label: "Bank Statements",
    description: "Bank statements for the last 6 months."
  },
  {
    label: "Financial Projections",
    description: "Revenue, operating costs, profitability (P&L), balance sheet and cash flow projections for the next 5–7 years."
  },
  {
    label: "Debts & Creditors",
    description: "Details of debts, creditors, and overdue payments."
  },
  {
    label: "Past Performance & Milestones",
    description: "Past performance and key milestones achieved."
  },
  {
    label: "Assets & Properties",
    description:
      "Fixed assets (land, buildings, machinery, vehicles), ownership/lease documents, and photographs/Google locations of the relevant sites."
  },
  {
    label: "Fund Utilisation Strategy",
    description: "Fund utilisation purposes and strategy."
  }
];

export const REQUIRED_DOCUMENT_LABELS = REQUIRED_DOCUMENTS.map((d) => d.label);
