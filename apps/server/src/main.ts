import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer } from "ws";
import type { ClientMessage } from "@hwr/protocol";
import { MISSIONS, REQUISITION, designerOptions } from "@hwr/content";
import { checkClaudeKey, createAnthropicClient } from "./claude-gm.js";
import { Hub } from "./hub.js";
import { lanAddresses, networkProfiles } from "./network.js";
import { hasPrivate, privateDir, privateStatus } from "./private-assets.js";
import { Devices, fromHost } from "./host.js";
import { LOCAL_PORTRAITS_DIR, extraFamilyPortraits, gallerySlots, localPortraits } from "./local-portraits.js";
import { loadPrivateMissions } from "./private-missions.js";
import { Settings, keyHint, looksLikeClaudeKey } from "./settings.js";
import { Store } from "./store.js";
import { TtsSlowError, speak, ttsAvailable, ttsSlow, validRequest, warmUp } from "./tts.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
// The portable build points these at its own folders; in the repo they default to the workspace.
const webDist = process.env.HWR_WEB_DIST ?? resolve(here, "../../web/dist");
const dataFile = process.env.HWR_DATA ?? resolve(here, "../data/hwr.sqlite");
// Licensed ship models prepared by tools/ship-studio/prep.py. Only served if present on this PC.
const localShips = privateDir("ships");
const hasLocalShips = hasPrivate("ships");

// Before the hub restores saved tables, which may be playing one of them.
const privateMissions = loadPrivateMissions();

// The Claude key: from .env if there is one (it wins), otherwise whatever the host pasted into the host console.
const settings = new Settings(dataFile);
const envKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
let apiKey = envKey ?? settings.claudeKey;
const keySource = (): "env" | "console" | undefined => (envKey ? "env" : apiKey ? "console" : undefined);
const store = new Store(dataFile);
const hub = new Hub(store, apiKey ? createAnthropicClient(apiKey) : undefined);

// The portable build asks for warnings only, so its console window stays readable.
const app = Fastify({ logger: { level: process.env.HWR_LOG_LEVEL ?? "info" } });

app.get("/api/health", async () => ({ ok: true, ai: Boolean(apiKey), localShips: hasLocalShips, private: privateStatus(), ttsSlow: ttsSlow() }));

// Soundtrack tracks tagged by mood (tools/music/build.py). Without them the client keeps the synthesised drone.
if (hasPrivate("music")) {
  type Tracks = Record<string, { file: string; title: string; album: string }[]>;
  const playlist = JSON.parse(readFileSync(resolve(privateDir("music"), "playlist.json"), "utf8")) as { moods: Tracks; sets?: Record<string, Tracks> };
  const withUrls = (moods: Tracks) =>
    Object.fromEntries(Object.entries(moods).map(([mood, tracks]) => [mood, tracks.map((t) => ({ ...t, url: `/local/music/${t.file.split("/").map(encodeURIComponent).join("/")}` }))]));
  await app.register(fastifyStatic, { root: privateDir("music"), prefix: "/local/music/", decorateReply: false });
  app.get("/api/music", async () => ({
    moods: withUrls(playlist.moods),
    sets: Object.fromEntries(Object.entries(playlist.sets ?? {}).map(([name, moods]) => [name, withUrls(moods)])),
  }));
} else {
  app.get("/api/music", async (_req, reply) => reply.code(404).send({ error: "No music on this PC." }));
}

// Game sound effects for story events (tools/sfx/build.py). Without them the client synthesises its cues.
if (hasPrivate("sfx")) {
  const manifest = JSON.parse(readFileSync(resolve(privateDir("sfx"), "sfx.json"), "utf8")) as { events: Record<string, string[]> };
  await app.register(fastifyStatic, { root: privateDir("sfx"), prefix: "/local/sfx/", decorateReply: false });
  app.get("/api/sfx", async () => ({
    events: Object.fromEntries(Object.entries(manifest.events).map(([event, files]) => [event, files.map((f) => `/local/sfx/${f}`)])),
  }));
} else {
  app.get("/api/sfx", async (_req, reply) => reply.code(404).send({ error: "No game sounds on this PC." }));
}

// The game's kiith badges (tools/branding/badges.py). Without them the client shows the kiith name alone.
if (hasPrivate("badges")) {
  const index = JSON.parse(readFileSync(resolve(privateDir("badges"), "index.json"), "utf8")) as { kiith: Record<string, string> };
  await app.register(fastifyStatic, { root: privateDir("badges"), prefix: "/local/badges/", decorateReply: false });
  app.get("/api/badges", async () => ({
    kiith: Object.fromEntries(Object.entries(index.kiith).map(([kiith, file]) => [kiith, `/local/badges/${encodeURIComponent(file)}`])),
  }));
} else {
  app.get("/api/badges", async () => ({ kiith: {} }));
}

if (hasLocalShips) {
  await app.register(fastifyStatic, { root: localShips, prefix: "/local/ships/", decorateReply: false });
}

for (const reason of privateMissions.skipped) app.log.warn(`Private mission skipped: ${reason}`);
if (privateMissions.loaded.length) {
  app.log.info(`Private missions: ${privateMissions.loaded.join(", ")}`);
  await app.register(fastifyStatic, { root: privateDir("missions"), prefix: "/local/missions/", decorateReply: false });
}

// Narration voices generated on this PC (Kokoro). Any device at the table may ask; the TV usually does.
if (ttsAvailable()) {
  // Warnings, so the portable build's server.log (warnings only) shows how the voices are doing.
  warmUp((msg) => app.log.warn(msg));
  app.post("/api/tts", async (req, reply) => {
    const ask = validRequest(req.body);
    if (typeof ask === "string") return reply.code(400).send({ error: ask });
    try {
      const wav = await speak(ask.text, ask.voice, ask.speed);
      return reply.header("content-type", "audio/wav").header("cache-control", "private, max-age=86400").send(wav);
    } catch (err) {
      if (err instanceof TtsSlowError) return reply.code(503).send({ error: err.message, slow: true });
      req.log.warn({ err }, "Kokoro failed");
      return reply.code(503).send({ error: "The voice engine isn't working; the browser's voices will take over." });
    }
  });
} else {
  app.post("/api/tts", async (_req, reply) => reply.code(404).send({ error: "No Kokoro voices on this PC." }));
}

// How other devices reach this server, so a host browsing at localhost can still hand out a working link.
app.get("/api/host-info", async () => ({ port, addresses: lanAddresses() }));

app.get("/api/missions", async () =>
  Object.values(MISSIONS).map((m) => ({ id: m.id, title: m.title, blurb: m.blurb, recommendedPlayers: m.recommendedPlayers, art: m.art })),
);

// Saved tables are the host's business: other devices get an empty list.
app.get("/api/tables", async (req) => (fromHost(req) ? store.list() : []));
app.get("/api/campaigns", async (req) => (fromHost(req) ? store.campaigns() : []));

const devices = new Devices();
const startedAt = Date.now();

/** Everything the host console shows. Only answered on this PC. */
app.get("/api/host", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "The host console only opens on the PC running the game." });
  return {
    port,
    addresses: lanAddresses(),
    profiles: await networkProfiles(),
    devices: devices.list(),
    remoteDevices: devices.remoteCount(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    tables: store.list(10),
    campaigns: store.campaigns(),
    ai: Boolean(apiKey),
    claude: { source: keySource(), hint: keyHint(apiKey) },
    private: privateStatus(),
  };
});

/** Pastes a Claude key on the host console: checked with Anthropic (free), saved beside the saves, and live at once. */
app.post<{ Body: { key?: string } }>("/api/host/claude-key", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Only the host can set the Claude key." });
  if (envKey) return reply.code(409).send({ error: "This PC's .env file sets the key, and it wins. Change it there and restart." });
  const key = String(req.body?.key ?? "").trim();
  if (!looksLikeClaudeKey(key)) return reply.code(400).send({ error: "That doesn't look like a Claude API key. They start sk-ant- and come from the Claude Console." });
  const problem = await checkClaudeKey(key);
  if (problem) return reply.code(422).send({ error: problem.message });
  settings.claudeKey = key;
  apiKey = key;
  hub.setAi(createAnthropicClient(key));
  req.log.info(`Claude key saved from the host console (${keyHint(key)})`);
  return { ok: true, hint: keyHint(key) };
});

app.delete("/api/host/claude-key", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Only the host can remove the Claude key." });
  if (envKey) return reply.code(409).send({ error: "This PC's .env file sets the key. Remove it there and restart." });
  settings.claudeKey = undefined;
  apiKey = undefined;
  hub.setAi(undefined);
  return { ok: true };
});

/** The launcher's "Open TV view": the TV view of the table played most recently, or the host console if there's none. */
/**
 * The table the TV shows: the one last selected or started on the host console, else the most
 * recent unfinished one. The TV page at /tv follows it, so the host never has to re-aim the TV.
 */
let selectedTable: string | undefined;
function hostTable(): string | undefined {
  const open = store.list(20).filter((t) => t.phase !== "ended");
  return open.find((t) => t.code === selectedTable)?.code ?? open[0]?.code;
}

app.get("/api/host/current", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Open the TV view from the QR code on the host console." });
  return { code: hostTable() ?? null };
});

app.post<{ Body: { code?: string } }>("/api/host/current", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Only the host can choose the table on the TV." });
  const code = String(req.body?.code ?? "").toUpperCase();
  if (!hub.get(code)) return reply.code(404).send({ error: "No table with that code." });
  selectedTable = code;
  return { code };
});

/** The launcher's "Copy join link": the latest table's address as phones on the network would use it. */
app.get("/api/host/join-link", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Only the host can ask for the join link." });
  const address = lanAddresses()[0]?.address ?? "localhost";
  const code = hostTable();
  return { url: `http://${address}:${port}${code ? `/t/${code}` : ""}`, code: code ?? null };
});

app.post("/api/host/quit", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Only the host can stop the game." });
  req.log.warn("Quit from the host console: stopping the server");
  setTimeout(() => void shutdown(), 200);
  return { ok: true };
});

/** Kit the fleet issues between missions for banked RU. */
app.get("/api/requisition", async () => REQUISITION);

app.get("/api/designer", async () => ({ ...designerOptions(), familyPortraits: extraFamilyPortraits() }));

// Gallery portraits are swapped for family faces of the same sex when this PC has them.
if (gallerySlots().size) {
  app.addHook("onRequest", async (req, reply) => {
    const m = /^\/art\/portraits\/gallery-(\d)\.webp(?:\?.*)?$/.exec(req.url);
    const family = m ? gallerySlots().get(Number(m[1]) - 1) : undefined;
    if (family && typeof reply.sendFile === "function") {
      reply.header("cache-control", "no-cache");
      return reply.sendFile(family.file, LOCAL_PORTRAITS_DIR);
    }
  });
}

if (localPortraits().length) {
  await app.register(fastifyStatic, { root: LOCAL_PORTRAITS_DIR, prefix: "/local/portraits/", decorateReply: false });
}

// A saved campaign picked back up on the host PC: its unfinished chapter, or the next one. The TV follows.
app.post<{ Body: { campaignId?: string } }>("/api/campaigns/reopen", async (req, reply) => {
  if (!fromHost(req)) return reply.code(403).send({ error: "Saved campaigns are reopened on the host PC." });
  try {
    const table = hub.reopenCampaign(String(req.body?.campaignId ?? ""));
    selectedTable = table.code;
    return { code: table.code };
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }
});

app.post<{ Body: { name?: string; missionId?: string; continueFrom?: string } }>("/api/tables", async (req, reply) => {
  // The next chapter of a campaign: anyone at the finished table can start it, and the TV follows.
  if (req.body?.continueFrom) {
    try {
      const next = hub.continueCampaign(req.body.continueFrom);
      selectedTable = next.code;
      return { code: next.code };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  }
  // An empty id (the host console before its mission list loads) means the default mission.
  const missionId = req.body?.missionId || undefined;
  if (missionId && !MISSIONS[missionId]) return reply.code(400).send({ error: "Unknown mission." });
  const table = hub.create(req.body?.name ?? "", missionId);
  // A table started on the host console goes straight onto the TV.
  if (fromHost(req)) selectedTable = table.code;
  return { code: table.code };
});

app.get<{ Params: { code: string } }>("/api/tables/:code", async (req, reply) => {
  const table = hub.get(req.params.code);
  if (!table) return reply.code(404).send({ error: "No table with that code." });
  const s = table.game.state;
  return { code: s.code, name: s.name, phase: s.phase, missionTitle: s.missionTitle };
});

if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/ws") || req.url.startsWith("/local")) return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
} else {
  app.get("/", async () => "HWR server is running. Build the web app (pnpm build) or use the Vite dev server on port 5173.");
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
app.server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/ws")) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    const timer = setTimeout(() => ws.close(4001, "No hello"), 10_000);
    ws.once("message", (data) => {
      clearTimeout(timer);
      let hello: ClientMessage;
      try {
        hello = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return ws.close(4002, "Bad hello");
      }
      if (hello.type !== "hello") return ws.close(4002, "Bad hello");
      const table = hub.get(hello.tableCode);
      if (!table) {
        ws.send(JSON.stringify({ type: "error", message: "No table with that code." }));
        return ws.close(4004, "No such table");
      }
      try {
        table.connect(ws, hello);
        devices.add(ws, { address: req.socket.remoteAddress ?? "", tableCode: table.code, name: hello.name, role: hello.role, since: Date.now() });
        ws.once("close", () => devices.remove(ws));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Could not join." }));
        ws.close(4003, "Could not join");
      }
    });
  });
});

const shutdown = async () => {
  // A clean close waits on open connections; never let one keep the server alive after Quit.
  setTimeout(() => {
    app.log.warn("Clean shutdown took over 3 s: exiting anyway");
    try {
      store.close();
    } catch {
      // Already closed by the clean path.
    }
    process.exit(0);
  }, 3000);
  wss.close();
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host });
app.log.info(`GM: ${apiKey ? `Claude available (key from ${keySource() === "env" ? ".env" : "the host console"})` : "Director only (no Claude key yet; paste one on the host console)"}; saves in ${dataFile}`);
