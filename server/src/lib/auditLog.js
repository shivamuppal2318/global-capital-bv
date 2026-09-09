import { prisma } from "../db.js";

// Fire-and-forget by design: a logging failure must never break the action
// being logged (an admin resetting a password shouldn't fail because the
// audit write hiccuped) — errors are swallowed and only surfaced to the
// server console, never to the HTTP response or the caller.
//
// `actor` is explicit rather than always reading req.user because the one
// action most worth auditing — a login — happens before req.user exists
// (requireAuth hasn't run yet); every other call site just passes req.user.
export async function recordAudit({ req, actor, action, entityType, entityId, detail }) {
  const resolvedActor = actor ?? req?.user ?? null;
  try {
    await prisma.auditLog.create({
      data: {
        actorId: resolvedActor?.id ?? null,
        actorName: resolvedActor?.name ?? "Unknown",
        actorEmail: resolvedActor?.email ?? "unknown",
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        detail: detail ?? null,
        ipAddress: req?.ip ?? null
      }
    });
  } catch (err) {
    console.error(`Failed to record audit log for action "${action}":`, err);
  }
}
