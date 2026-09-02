import { prisma } from "../db.js";
import { encryptSecret, decryptSecret } from "./credentialCrypto.js";

export async function getZoomInfoSettingsRow() {
  return prisma.zoomInfoSettings.findFirst();
}

export async function saveZoomInfoSettings({ clientId, clientSecret }) {
  const existing = await prisma.zoomInfoSettings.findFirst();
  const data = {
    ...(clientId !== undefined ? { clientId } : {}),
    // Never blank out a saved secret just because the form field was left
    // empty — same rule Zoom's own settings already follow.
    ...(clientSecret ? { clientSecretEncrypted: encryptSecret(clientSecret) } : {}),
    connected: false
  };

  return existing
    ? prisma.zoomInfoSettings.update({ where: { id: existing.id }, data })
    : prisma.zoomInfoSettings.create({ data });
}

export async function getZoomInfoCredentials() {
  const row = await getZoomInfoSettingsRow();
  if (!row?.clientId || !row?.clientSecretEncrypted) return null;
  return { clientId: row.clientId, clientSecret: decryptSecret(row.clientSecretEncrypted) };
}
