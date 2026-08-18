import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { formatRelativeTime } from "../utils.js";

const router = Router();

function maskSecret(value) {
  if (!value) return null;
  return `•••• •••• ${value.slice(-4)}`;
}

router.get("/", async (req, res, next) => {
  try {
    const [account, businessHours, team, notifications] = await Promise.all([
      prisma.businessSettings.findFirst(),
      prisma.businessHour.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.agent.findMany({ orderBy: { name: "asc" } }),
      prisma.notificationPreference.findMany()
    ]);

    res.json({
      account: account
        ? {
            phone: account.phone,
            displayName: account.displayName,
            category: account.category,
            wabaId: account.wabaId,
            tier: account.tier,
            quality: account.quality,
            status: account.status
          }
        : null,
      webhook: account
        ? {
            url: account.webhookUrl,
            appId: account.appIdMasked,
            tokenStatus: account.tokenStatus,
            lastPing: `Healthy · ${formatRelativeTime(account.lastPingAt)}`
          }
        : null,
      businessHours: businessHours.map((h) => [h.dayLabel, h.hoursLabel]),
      team: team.map((a) => ({ name: a.name, role: a.role, status: a.status.charAt(0) + a.status.slice(1).toLowerCase() })),
      notifications: notifications.map((n) => ({ id: n.id, label: n.label, enabled: n.enabled }))
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/notifications/:id", async (req, res, next) => {
  try {
    const pref = await prisma.notificationPreference.findUnique({ where: { id: req.params.id } });
    if (!pref) return res.status(404).json({ error: "Notification preference not found" });
    const updated = await prisma.notificationPreference.update({
      where: { id: pref.id },
      data: { enabled: req.body.enabled ?? !pref.enabled }
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// --- WhatsApp Cloud API connection -----------------------------------------

router.get("/connection", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account) return res.status(404).json({ error: "Settings not initialized" });

    res.json({
      embeddedSignupConfigId: account.embeddedSignupConfigId ?? "",
      phoneNumberId: account.phoneNumberId ?? "",
      wabaId: account.wabaId ?? "",
      appId: account.appId ?? "",
      hasAccessToken: Boolean(account.accessToken),
      accessTokenPreview: maskSecret(account.accessToken),
      hasAppSecret: Boolean(account.appSecret),
      appSecretPreview: maskSecret(account.appSecret),
      campaignBatchSize: account.campaignBatchSize,
      autoCreateLead: account.autoCreateLead,
      leadDefaultStatus: account.leadDefaultStatus,
      leadDefaultSource: account.leadDefaultSource,
      leadDefaultAssignedTo: account.leadDefaultAssignedTo,
      webhookUrl: account.webhookUrl,
      webhookVerifyToken: account.webhookVerifyToken
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/connection", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account) return res.status(404).json({ error: "Settings not initialized" });

    const {
      embeddedSignupConfigId,
      phoneNumberId,
      wabaId,
      appId,
      appSecret,
      accessToken,
      campaignBatchSize,
      autoCreateLead,
      leadDefaultStatus,
      leadDefaultSource,
      leadDefaultAssignedTo
    } = req.body;

    const updated = await prisma.businessSettings.update({
      where: { id: account.id },
      data: {
        embeddedSignupConfigId: embeddedSignupConfigId ?? account.embeddedSignupConfigId,
        phoneNumberId: phoneNumberId ?? account.phoneNumberId,
        wabaId: wabaId ?? account.wabaId,
        appId: appId ?? account.appId,
        // Only overwrite secrets when a new value is actually sent — an empty
        // field in the form should never blank out a previously saved token.
        appSecret: appSecret || account.appSecret,
        accessToken: accessToken || account.accessToken,
        campaignBatchSize: campaignBatchSize ?? account.campaignBatchSize,
        autoCreateLead: autoCreateLead ?? account.autoCreateLead,
        leadDefaultStatus: leadDefaultStatus ?? account.leadDefaultStatus,
        leadDefaultSource: leadDefaultSource ?? account.leadDefaultSource,
        leadDefaultAssignedTo: leadDefaultAssignedTo ?? account.leadDefaultAssignedTo
      }
    });

    res.json({
      embeddedSignupConfigId: updated.embeddedSignupConfigId ?? "",
      phoneNumberId: updated.phoneNumberId ?? "",
      wabaId: updated.wabaId ?? "",
      appId: updated.appId ?? "",
      hasAccessToken: Boolean(updated.accessToken),
      accessTokenPreview: maskSecret(updated.accessToken),
      hasAppSecret: Boolean(updated.appSecret),
      appSecretPreview: maskSecret(updated.appSecret),
      campaignBatchSize: updated.campaignBatchSize,
      autoCreateLead: updated.autoCreateLead,
      leadDefaultStatus: updated.leadDefaultStatus,
      leadDefaultSource: updated.leadDefaultSource,
      leadDefaultAssignedTo: updated.leadDefaultAssignedTo
    });
  } catch (err) {
    next(err);
  }
});

// Verifies the saved credentials by calling Meta's Graph API directly (a
// read-only account lookup — this never sends a WhatsApp message).
router.post("/connection/test", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account?.phoneNumberId || !account?.accessToken) {
      return res.json({ success: false, message: "Add a Phone Number ID and Permanent Access Token first." });
    }

    const url = `https://graph.facebook.com/v20.0/${account.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` } });
    const body = await response.json();

    if (!response.ok) {
      return res.json({ success: false, message: body?.error?.message ?? "Meta rejected the credentials." });
    }

    await prisma.businessSettings.update({ where: { id: account.id }, data: { lastPingAt: new Date(), status: "Connected" } });
    res.json({
      success: true,
      message: `Connected to ${body.verified_name ?? body.display_phone_number ?? "WhatsApp Business Account"}.`,
      details: body
    });
  } catch (err) {
    // A network failure here (no internet, DNS, Meta unreachable) is an
    // expected "test failed" outcome, not a server error.
    res.json({ success: false, message: `Could not reach Meta: ${err.message}` });
  }
});

router.post("/connection/webhook/regenerate-token", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account) return res.status(404).json({ error: "Settings not initialized" });
    const webhookVerifyToken = crypto.randomBytes(16).toString("hex");
    const updated = await prisma.businessSettings.update({ where: { id: account.id }, data: { webhookVerifyToken } });
    res.json({ webhookVerifyToken: updated.webhookVerifyToken });
  } catch (err) {
    next(err);
  }
});

// --- Phone numbers -----------------------------------------------------------

router.get("/phone-numbers", async (req, res, next) => {
  try {
    const numbers = await prisma.whatsappPhoneNumber.findMany({ orderBy: { createdAt: "asc" } });
    res.json(numbers);
  } catch (err) {
    next(err);
  }
});

// Re-pulls the phone number list from Meta when credentials are configured;
// otherwise just returns what's already stored so the UI still has something to show.
router.post("/phone-numbers/refresh", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account?.wabaId || !account?.accessToken) {
      const numbers = await prisma.whatsappPhoneNumber.findMany({ orderBy: { createdAt: "asc" } });
      return res.json({ refreshedFromMeta: false, numbers });
    }

    const url = `https://graph.facebook.com/v20.0/${account.wabaId}/phone_numbers?fields=display_phone_number,verified_name,quality_rating,code_verification_status`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` } });
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.data)) {
      const numbers = await prisma.whatsappPhoneNumber.findMany({ orderBy: { createdAt: "asc" } });
      return res.json({ refreshedFromMeta: false, error: body?.error?.message, numbers });
    }

    await prisma.whatsappPhoneNumber.deleteMany();
    await prisma.whatsappPhoneNumber.createMany({
      data: body.data.map((n) => ({
        phoneNumber: n.display_phone_number,
        displayName: n.verified_name ?? "—",
        qualityRating: n.quality_rating ?? "Unknown",
        status: n.code_verification_status ?? "Connected"
      }))
    });
    const numbers = await prisma.whatsappPhoneNumber.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ refreshedFromMeta: true, numbers });
  } catch (err) {
    next(err);
  }
});

router.patch("/phone-numbers/:id/select", async (req, res, next) => {
  try {
    const number = await prisma.whatsappPhoneNumber.findUnique({ where: { id: req.params.id } });
    if (!number) return res.status(404).json({ error: "Phone number not found" });
    await prisma.whatsappPhoneNumber.updateMany({ data: { isSending: false } });
    const updated = await prisma.whatsappPhoneNumber.update({ where: { id: number.id }, data: { isSending: true } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// --- Lead ingestion API key (Integrations & API) ----------------------------

router.get("/integrations", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account) return res.status(404).json({ error: "Settings not initialized" });
    res.json({ apiKey: account.leadWebhookApiKey, webhookUrl: `http://localhost:${process.env.PORT ?? 4000}/api/leads/inbound` });
  } catch (err) {
    next(err);
  }
});

router.post("/integrations/regenerate-key", async (req, res, next) => {
  try {
    const account = await prisma.businessSettings.findFirst();
    if (!account) return res.status(404).json({ error: "Settings not initialized" });
    const leadWebhookApiKey = `gc_live_${crypto.randomBytes(24).toString("hex")}`;
    const updated = await prisma.businessSettings.update({ where: { id: account.id }, data: { leadWebhookApiKey } });
    res.json({ apiKey: updated.leadWebhookApiKey });
  } catch (err) {
    next(err);
  }
});

export default router;
