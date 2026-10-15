import fs from "node:fs";
import path from "node:path";
import express from "express";
import { basicAuth } from "./auth.ts";
import { config, describeSources } from "./config.ts";
import { DEMO_EDITIONS } from "./demo.ts";
import { broadcast, onEdition, publish } from "./editions.ts";
import { LINEAR_UPLOAD_HOSTS } from "./linear.ts";
import { pollAll, wire } from "./pollers.ts";
import { store } from "./store.ts";
import type { Edition, PaperConfig, WireStatus } from "../shared/types.ts";

const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.send("ok"));
app.use(basicAuth);
app.use(express.json({ limit: "200kb" }));

app.get("/api/config", (_req, res) => {
  const body: PaperConfig = {
    paperName: config.paperName,
    motto: config.motto,
    celebrateSeconds: config.celebrateSeconds,
    demo: config.demo,
  };
  res.json(body);
});

app.get("/api/editions", (_req, res) => res.json(store.editions(30)));

app.get("/api/status", (_req, res) => {
  const body: WireStatus = { ...wire, sources: describeSources() };
  res.json(body);
});

// Server-sent events: one "edition" event per new release.
app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (edition: Edition, celebrate: boolean) =>
    res.write(`event: edition\ndata: ${JSON.stringify({ edition, celebrate })}\n\n`);
  const off = onEdition(send);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    off();
    clearInterval(ping);
  });
});

// Linear uploads need our API key, so screenshots are proxied.
app.get("/api/media", async (req, res) => {
  const raw = String(req.query.u ?? "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return res.status(400).send("Bad media URL");
  }
  if (url.protocol !== "https:" || !LINEAR_UPLOAD_HOSTS.includes(url.hostname)) {
    return res.status(403).send("Only Linear uploads are proxied");
  }
  const upstream = await fetch(url, {
    headers: {
      Authorization: config.linearApiKey,
      ...(req.headers.range ? { Range: req.headers.range } : {}),
    },
  });
  res.status(upstream.status);
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) res.set(h, v);
  }
  res.set("Cache-Control", "private, max-age=86400");
  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  req.on("close", () => reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
});

let demoIndex = 0;
async function printDemo(celebrate: boolean) {
  const template = DEMO_EDITIONS[demoIndex++ % DEMO_EDITIONS.length];
  const number = store.nextNumber();
  const edition: Edition = {
    ...structuredClone(template),
    number,
    id: `demo:${number}`,
    shippedAt: new Date().toISOString(),
  };
  store.addEdition(edition);
  broadcast(edition, celebrate);
  return edition;
}

// Press T on the screen (or POST here) to print a test edition.
app.post("/api/test", async (_req, res) => res.json(await printDemo(true)));

/**
 * Let CI (or a human) announce a release directly:
 *   curl -X POST /api/announce -H "Authorization: Bearer $ANNOUNCE_TOKEN" \
 *        -H "Content-Type: application/json" -d '{"title":"…","tickets":["BDLS-1"]}'
 */
app.post("/api/announce", async (req, res) => {
  if (!config.announceToken) return res.status(404).send("Set ANNOUNCE_TOKEN to enable announcements");
  if (req.headers.authorization !== `Bearer ${config.announceToken}`) return res.status(401).send("Wrong token");
  const { title, tickets = [], notes = "", by, url, version } = req.body ?? {};
  if (!title && !tickets.length) return res.status(400).send("Send a title and/or tickets");
  const edition = await publish(
    {
      id: `announce:${Date.now()}`,
      source: "announce",
      sourceLabel: title || "Announced release",
      url,
      version,
      shippedAt: new Date().toISOString(),
      shippedBy: by ? [{ name: String(by) }] : [],
      messages: [...(tickets as string[]), ...(title ? [String(title)] : []), ...String(notes).split("\n").filter(Boolean)],
    },
    true,
  );
  res.json(edition ?? { skipped: true });
});

const dist = path.resolve("dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`\n📰 ${config.paperName} is on the presses at http://localhost:${config.port}`);
  const sources = describeSources();
  console.log(sources.length ? `   Watching: ${sources.join(", ")}` : "   Not watching anything yet. Set GITHUB_SOURCES or DEMO=true in .env");
  if (config.githubSources.length && !config.githubToken) console.log("   ⚠ No GITHUB_TOKEN: private repos will fail and rate limits are tight");
  if (!config.linearApiKey) console.log("   ⚠ No LINEAR_API_KEY: ticket titles and screenshots won't be looked up");
  if (process.env.NODE_ENV === "production" && !config.basicAuthPassword) {
    console.log("   ⚠ No BASIC_AUTH_PASSWORD: anyone who can reach this URL can read the paper");
  }
});

if (config.demo && store.editions().length === 0) {
  for (let i = 0; i < DEMO_EDITIONS.length; i++) await printDemo(false);
}
await pollAll();
setInterval(pollAll, config.pollSeconds * 1000);
