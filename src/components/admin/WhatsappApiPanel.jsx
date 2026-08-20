import { ConnectionPanel } from "../whatsapp/settings/ConnectionPanel";

// Reuses the exact same panel/API the WhatsApp Business module used to
// render under Settings → Connection — moved here so WhatsApp Cloud API
// credentials live in one admin-only place instead of two.
export function WhatsappApiPanel() {
  return <ConnectionPanel />;
}
