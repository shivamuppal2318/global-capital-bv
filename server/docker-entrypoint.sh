#!/bin/sh
# Startup phases run one at a time with their own banner so a failure is
# attributable from `docker logs` alone. Previously these were chained with
# `&&`, which meant any failure killed the container instantly — and a dead
# container has no readable runtime logs, so the actual error was invisible.
# Migrations/bootstrap failures are therefore logged and tolerated here; the
# API still starts (endpoints touching a missing table will error, which is
# visible and debuggable, unlike a boot loop).

# Presence only — never the value. Empty is fine: the server then generates
# and persists its own signing key (see src/lib/auth.js).
if [ -n "$JWT_SECRET" ]; then
  echo "==> JWT_SECRET supplied via environment"
else
  echo "==> JWT_SECRET not set — the server will use its database-stored key"
fi

echo "==> [1/3] prisma migrate deploy"
if npx prisma migrate deploy; then
  echo "==> [1/3] migrations OK"
else
  echo "==> [1/3] MIGRATIONS FAILED (continuing so the server stays up and this log stays readable)"
fi

echo "==> [2/3] ensureDefaults"
if node prisma/ensureDefaults.js; then
  echo "==> [2/3] defaults OK"
else
  echo "==> [2/3] ENSURE-DEFAULTS FAILED (continuing)"
fi

echo "==> [3/3] starting API server"
exec node src/index.js
