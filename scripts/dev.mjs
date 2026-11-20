// Development mode: rebuilds the browser code on every change
// and restarts the server when server code changes.
import { context } from "esbuild";
import { spawn } from "node:child_process";

const ctx = await context({
  entryPoints: ["src/client/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "public/app.js",
  sourcemap: true,
  logLevel: "info",
});
await ctx.watch();

const server = spawn("npx", ["tsx", "watch", "src/server/index.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const stop = async () => {
  server.kill();
  await ctx.dispose();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
