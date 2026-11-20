// Startup file for hosts that run the app with plain `node`,
// such as cPanel's "Setup Node.js App" (Phusion Passenger).
//
// It lets Node run the TypeScript source directly, builds the
// browser code if it hasn't been built yet, then starts the server.

const { existsSync } = require("node:fs");
const { join } = require("node:path");

process.chdir(__dirname);

(async () => {
  const { register } = await import("tsx/esm/api");
  register();

  if (!existsSync(join(__dirname, "public", "app.js"))) {
    await import("./scripts/build.mjs");
  }

  await import("./src/server/index.ts");
})().catch((err) => {
  console.error("LgDeck failed to start:", err);
  process.exit(1);
});
