import { Router } from "express";
import { prisma } from "../db.js";
import { testZoomConnection } from "../lib/zoomClient.js";

const router = Router();

function maskSecret(value) {
  if (!value) return null;
  return `•••• •••• ${value.slice(-4)}`;
}

async function getOrCreateSettings() {
  const existing = await prisma.zoomSettings.findFirst();
  if (existing) return existing;
  return prisma.zoomSettings.create({ data: {} });
}

router.get("/settings", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      accountId: settings.accountId ?? "",
      clientId: settings.clientId ?? "",
      hasClientSecret: Boolean(settings.clientSecret),
      clientSecretPreview: maskSecret(settings.clientSecret),
      hostEmail: settings.hostEmail ?? "",
      connected: settings.connected,
      lastTestedAt: settings.lastTestedAt
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/settings", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    const { accountId, clientId, clientSecret, hostEmail } = req.body;
    const updated = await prisma.zoomSettings.update({
      where: { id: settings.id },
      data: {
        accountId: accountId ?? settings.accountId,
        clientId: clientId ?? settings.clientId,
        // Never blank out a saved secret just because the form field was left empty.
        clientSecret: clientSecret || settings.clientSecret,
        hostEmail: hostEmail ?? settings.hostEmail,
        connected: false
      }
    });
    res.json({
      accountId: updated.accountId ?? "",
      clientId: updated.clientId ?? "",
      hasClientSecret: Boolean(updated.clientSecret),
      clientSecretPreview: maskSecret(updated.clientSecret),
      hostEmail: updated.hostEmail ?? "",
      connected: updated.connected,
      lastTestedAt: updated.lastTestedAt
    });
  } catch (err) {
    next(err);
  }
});

router.post("/settings/test", async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    if (!settings.accountId || !settings.clientId || !settings.clientSecret || !settings.hostEmail) {
      return res.json({ success: false, message: "Fill in Account ID, Client ID, Client Secret and Host Email first." });
    }

    try {
      const result = await testZoomConnection(settings);
      await prisma.zoomSettings.update({ where: { id: settings.id }, data: { connected: true, lastTestedAt: new Date() } });
      res.json({ success: true, message: `Connected — scheduling as ${result.displayName} (${result.email}).` });
    } catch (zoomErr) {
      await prisma.zoomSettings.update({ where: { id: settings.id }, data: { connected: false } });
      res.json({ success: false, message: zoomErr.message });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
