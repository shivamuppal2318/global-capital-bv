// Runs on every backend boot (after migrate deploy). Unlike seed.js (which
// wipes and recreates all data — safe for local dev, NOT safe for
// production once real leads/conversations exist), this only fills in the
// handful of singleton config rows the app assumes exist and does nothing
// if they're already there. Safe to run repeatedly.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
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
