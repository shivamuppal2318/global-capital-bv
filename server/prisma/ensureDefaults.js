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
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existing) {
    console.log("An admin user already exists — skipping admin bootstrap.");
    return;
  }

  const email = (process.env.ADMIN_EMAIL || "admin@globalcapital.local").trim().toLowerCase();
  // ADMIN_PASSWORD lets an operator pin a known password via Coolify's env
  // var UI; without it, a random one is generated and logged ONCE here —
  // there is no other way to recover it, so whoever deploys must grab it
  // from the deployment logs (or set ADMIN_PASSWORD before first boot).
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");

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
  if (!process.env.ADMIN_PASSWORD) {
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
