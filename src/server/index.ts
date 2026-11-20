import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { api } from "./api.ts";

const app = new Hono();

// Basic protection: the API only accepts JSON for changes, which stops
// other websites from submitting forms to it on your behalf.
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const type = c.req.header("content-type") ?? "";
    if (!type.startsWith("application/json")) {
      return c.json({ error: "Requests must be sent as JSON." }, 415);
    }
  }
  await next();
});

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
});

app.route("/api", api);
app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`LgDeck is running at http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`);
});
