// Runs on every backend boot (after migrate deploy). Unlike seed.js (which
// wipes and recreates all data — safe for local dev, NOT safe for
// production once real leads/conversations exist), this only fills in the
// handful of singleton config rows the app assumes exist and does nothing
// if they're already there. Safe to run repeatedly.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same UPLOAD_DIR default as lib/fileUpload.js — not importable directly
// since that module also configures multer, which this script has no
// Express request to hand it.
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

// Shared by ensureNdaTemplateDocument/ensureIoiTemplateDocument below — a
// standard template (assets/<sourceFileName>, also served to clients at
// GET /api/client-portal/<module>/template) copied in as a real Document
// row, company-wide (leadId: null), so its quick-add form can default
// "Attach <X> document" to it instead of every new record starting on
// "None". A fixed storedName makes each one idempotent across every boot.
async function ensureTemplateDocument({ storedName, sourceFileName, originalName, mimeType, category, description }) {
  const existing = await prisma.document.findUnique({ where: { storedName } });
  if (existing) {
    // Keeps a since-renamed originalName (e.g. this doc's own past
    // "LOI Template" -> "IOI Template" rename) in sync on every boot,
    // same self-healing reasoning as the admin password re-sync above.
    if (existing.originalName !== originalName) {
      await prisma.document.update({ where: { storedName }, data: { originalName } });
      console.log(`Renamed existing document to "${originalName}".`);
    } else {
      console.log(`${originalName} document already exists — skipping.`);
    }
    return;
  }

  const sourcePath = path.join(__dirname, "..", "assets", sourceFileName);
  const fileBuffer = await fs.readFile(sourcePath).catch((err) => {
    console.error(`Could not read ${sourcePath} — skipping ${originalName} document: ${err.message}`);
    return null;
  });
  if (!fileBuffer) return;

  await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), fileBuffer);

  await prisma.document.create({
    data: { originalName, storedName, mimeType, sizeBytes: fileBuffer.length, category, description, leadId: null, uploadedById: null }
  });
  console.log(`Created ${originalName} document.`);
}

function ensureNdaTemplateDocument() {
  return ensureTemplateDocument({
    storedName: "standard-nda-template.pdf",
    sourceFileName: "nda-template.pdf",
    originalName: "Global Capital BV — Reciprocal NDA Template.pdf",
    mimeType: "application/pdf",
    category: "NDA",
    description: "Standard reciprocal NDA template — defaults into every new NDA record."
  });
}

function ensureIoiTemplateDocument() {
  return ensureTemplateDocument({
    storedName: "standard-ioi-template.docx",
    sourceFileName: "ioi-template.docx",
    originalName: "Global Capital BV — IOI Template.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "IOI",
    description: "Standard Letter of Intent template — defaults into every new IOI record."
  });
}

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || "admin@globalcapital.local").trim().toLowerCase();
  const pinnedPassword = process.env.ADMIN_PASSWORD;

  const existingByEmail = await prisma.user.findUnique({ where: { email } });

  if (existingByEmail) {
    // Setting ADMIN_PASSWORD is an explicit "these are the credentials"
    // instruction, so it's re-applied on every boot — that's what makes it a
    // usable break-glass recovery path when the admin password is lost.
    // Trade-off: an in-app password change for THIS account is reverted on
    // the next deploy. Clear ADMIN_PASSWORD once real accounts exist.
    if (pinnedPassword) {
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { passwordHash: await bcrypt.hash(pinnedPassword, 12), role: "ADMIN", status: "ACTIVE" }
      });
      console.log(`Admin ${email} already existed — password re-synced from ADMIN_PASSWORD.`);
      return;
    }

    // An account that has never been logged into is unusable if its
    // one-time generated password scrolled out of the logs, which would
    // lock everyone out permanently. Re-issuing a password for an account
    // nobody has ever signed into gives up nothing (there's no session or
    // work to hijack) and makes the deploy self-healing. Once someone logs
    // in, lastLoginAt is set and this stops touching the account.
    if (!existingByEmail.lastLoginAt) {
      const reissued = crypto.randomBytes(9).toString("base64url");
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { passwordHash: await bcrypt.hash(reissued, 12), status: "ACTIVE" }
      });
      console.log("=".repeat(60));
      console.log("Admin account exists but has never been used — password re-issued:");
      console.log(`  email:    ${email}`);
      console.log(`  password: ${reissued}`);
      console.log("Log in and change it; this stops re-issuing after the first login.");
      console.log("=".repeat(60));
      return;
    }

    console.log(`Admin ${email} already exists and has been used — leaving it untouched.`);
    return;
  }

  // A differently-addressed admin may already exist (e.g. created by an
  // earlier deploy before ADMIN_EMAIL was configured). Adding the requested
  // one is still correct — extra admins are harmless and removable in-app.
  const password = pinnedPassword || crypto.randomBytes(9).toString("base64url");

  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  console.log("=".repeat(60));
  console.log("Created bootstrap admin account:");
  console.log(`  email:    ${email}`);
  if (!pinnedPassword) {
    console.log(`  password: ${password}  (generated — save this now, it will not be shown again)`);
  } else {
    console.log("  password: (set from ADMIN_PASSWORD env var)");
  }
  console.log("Log in, then create real employee accounts from Admin Panel.");
  console.log("=".repeat(60));
}

async function main() {
  await ensureAdminUser();
  await ensureNdaTemplateDocument();
  await ensureIoiTemplateDocument();

  const existing = await prisma.businessSettings.findFirst();
  if (existing) {
    console.log("BusinessSettings already present — skipping defaults bootstrap.");
    return;
  }

  console.log("No BusinessSettings row found — creating defaults...");

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:4000";

  await prisma.businessSettings.create({
    data: {
      phone: "",
      displayName: "Global Capital BV",
      category: "Financial Services",
      wabaId: "",
      tier: "",
      quality: "Unknown",
      status: "Not connected",
      webhookUrl: `${appBaseUrl}/api/whatsapp/webhook`,
      webhookVerifyToken: crypto.randomBytes(16).toString("hex"),
      appIdMasked: "",
      tokenStatus: "Not connected",
      campaignBatchSize: 50,
      autoCreateLead: false,
      leadDefaultStatus: "Default",
      leadDefaultSource: "Default",
      leadDefaultAssignedTo: "Default",
      leadWebhookApiKey: `gc_live_${crypto.randomBytes(24).toString("hex")}`
    }
  });

  await prisma.businessHour.createMany({
    data: [
      { dayLabel: "Mon – Fri", hoursLabel: "09:00 – 18:00 CET", sortOrder: 0 },
      { dayLabel: "Saturday", hoursLabel: "10:00 – 14:00 CET", sortOrder: 1 },
      { dayLabel: "Sunday", hoursLabel: "Closed", sortOrder: 2 }
    ]
  });

  await prisma.notificationPreference.createMany({
    data: [
      { label: "New message alerts", enabled: true },
      { label: "SLA breach alerts", enabled: true },
      { label: "Campaign delivery reports", enabled: true },
      { label: "Weekly performance digest", enabled: false }
    ]
  });

  console.log("Defaults created.");
}

main()
  .catch((err) => {
    console.error("ensureDefaults failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
