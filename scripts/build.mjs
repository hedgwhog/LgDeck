// Bundles the browser code (src/client) into public/app.js.
import { build } from "esbuild";

await build({
  entryPoints: ["src/client/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "public/app.js",
  minify: true,
  sourcemap: true,
  logLevel: "info",
});
