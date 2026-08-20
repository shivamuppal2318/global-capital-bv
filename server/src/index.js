import "dotenv/config";
import app from "./app.js";

// Fail fast and loudly rather than booting into a server where every login
// attempt throws a confusing 500 later.
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set — required to sign/verify login sessions. Refusing to start.");
  process.exit(1);
}

const port = process.env.PORT ?? 4000;

app.listen(port, () => {
  console.log(`WhatsApp Business API server listening on http://localhost:${port}`);
});
