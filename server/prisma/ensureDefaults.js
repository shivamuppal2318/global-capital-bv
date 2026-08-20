// Runs on every backend boot (after migrate deploy). Unlike seed.js (which
// wipes and recreates all data — safe for local dev, NOT safe for
// production once real leads/conversations exist), this only fills in the
// handful of singleton config rows the app assumes exist and does nothing
// if they're already there. Safe to run repeatedly.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
    } else {
      console.log(`Admin ${email} already exists — leaving it untouched (no ADMIN_PASSWORD set).`);
    }
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
