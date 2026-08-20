import "dotenv/config";
import app from "./app.js";
import { initJwtSecret } from "./lib/auth.js";

const port = process.env.PORT ?? 4000;

// The signing key must exist before any request can be authenticated, so
// resolve it (env var, or the self-generated one stored in the database)
// before accepting traffic.
const { source } = await initJwtSecret();
console.log(`JWT signing secret loaded from ${source}.`);

app.listen(port, () => {
  console.log(`WhatsApp Business API server listening on http://localhost:${port}`);
});
