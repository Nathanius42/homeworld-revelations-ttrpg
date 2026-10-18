/**
 * The virtual family: plays a whole mission against a running server (the repo's or the portable
 * build's) the way a table does, over real WebSockets, and times everything. Bot players claim
 * crew, vote, roll, accept, fight and press Next after human-like pauses; a TV spectator asks
 * for Kokoro speech for every narration line, as the real TV does; and a probe checks the
 * server answers within moments throughout. It catches what only showed up with real people at
 * the first family playtest: a server too busy to answer taps.
 *
 *   npx tsx test/virtual-table.ts [--url http://localhost:8787] [--players 4] [--mission silent-beacon]
 *                                 [--think 300-1500] [--no-tts] [--minutes 25] [--json out.json]
 *
 * Exits non-zero if taps were slow (95% within 500 ms, none over 3 s) or the mission didn't finish.
 */
import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { stationMove } from "./bots.js";
import { chooseKokoro, chunks, speakableText, type ClientMessage, type LogEntry, type ServerMessage, type StationAction, type TableState } from "@hwr/protocol";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const URL_BASE = opt("url", "http://localhost:8787").replace(/\/$/, "");
const PLAYERS = Number(opt("players", "4"));
const MISSION = opt("mission", "silent-beacon");
const [THINK_MIN, THINK_MAX] = opt("think", "300-1500").split("-").map(Number) as [number, number];
const TTS = !args.includes("--no-tts");
const MINUTES = Number(opt("minutes", "40"));
const JSON_OUT = opt("json", "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

/** Every tap, from sending to the next state the server sends back to that player. */
const taps: { type: string; ms: number }[] = [];
const errors: string[] = [];
const health: number[] = [];
const speech: { ms: number; seconds: number; ok: boolean; slow: boolean }[] = [];

class Bot {
  ws!: WebSocket;
  playerId?: string;
  state?: TableState;
  characterId?: string;
  /** A tap waiting for the server's answer. */
  private waiting?: { type: string; at: number; seq: number };
  private busy = false;
  /** The round in which this player's station turned out to be offline: they rally the crew instead, as people do. */
  offlineRound?: number;
  /** Set when the server refuses a breakaway: this battle has to be fought out. */
  noBreakaway?: boolean;
  onState?: (s: TableState) => void;

  constructor(
    readonly index: number,
    readonly name: string,
    readonly role: "player" | "spectator",
  ) {}

  connect(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${URL_BASE.replace(/^http/, "ws")}/ws`);
      this.ws.on("open", () => this.ws.send(JSON.stringify({ type: "hello", tableCode: code, name: this.name, role: this.role } satisfies ClientMessage)));
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        const msg = JSON.parse(String(data)) as ServerMessage;
        if (msg.type === "error") {
          errors.push(`${this.name}: ${msg.message}`);
          if (/offline/i.test(msg.message)) this.offlineRound = this.state?.space?.round;
          if (/no breaking away/i.test(msg.message)) this.noBreakaway = true;
          this.waiting = undefined;
          // A refusal changes nothing on the table, so no new state will prompt a retry: decide again now.
          if (this.state) this.onState?.(this.state);
          return;
        }
        if (msg.type === "welcome") {
          this.playerId = msg.playerId;
          resolve();
        }
        if (this.state && msg.state.seq < this.state.seq) return;
        this.state = msg.state;
        if (this.waiting && msg.state.seq > this.waiting.seq) {
          taps.push({ type: this.waiting.type, ms: performance.now() - this.waiting.at });
          this.waiting = undefined;
        }
        this.onState?.(msg.state);
      });
    });
  }

  /** After a human-like pause, decides on the state as it is then and sends one tap (one at a time per player). */
  async tap(decideNow: () => ClientMessage | undefined): Promise<void> {
    if (this.busy || this.waiting) return;
    this.busy = true;
    await think();
    this.busy = false;
    const msg = decideNow();
    if (!msg || this.waiting || !this.state) return;
    this.waiting = { type: msg.type, at: performance.now(), seq: this.state.seq };
    this.ws.send(JSON.stringify(msg));
  }
}

/** What this bot would do now: the same rules the waiting-on banner explains to people. */
function decide(bot: Bot, s: TableState, players: Bot[]): ClientMessage | undefined {
  if (s.phase !== "playing" || s.gmThinking || !bot.characterId) return undefined;
  const me = bot.characterId;
  const standing = (id: string) => (s.characters[id]?.injuries ?? 0) < 2;
  const party = players.map((p) => p.characterId!).filter(standing);
  const roll = s.pendingRoll;
  if (roll?.rolled) return roll.rolled.characterId === me ? { type: "acceptRoll", bonus: s.pools.momentum >= 1 ? 1 : 0 } : undefined;
  if (roll) {
    // Open tests go round the table, so each family member gets a turn.
    const taker = roll.characterId ?? party[s.log.filter((l) => l.type === "roll").length % Math.max(1, party.length)];
    if (taker !== me) return undefined;
    return { type: "roll", boughtDice: s.pools.momentum >= 1 ? 1 : 0, payWithThreat: false, useFocus: true, fortuneCritical: false, approachIndex: 0 };
  }
  if (s.pendingChoice) return s.pendingChoice.votes[bot.playerId!] ? undefined : { type: "vote", optionId: s.pendingChoice.options[0]!.id };
  if (s.scene.mode === "space" && s.space) {
    const sp = s.space;
    if (!standing(me) || sp.acted.includes(me)) return undefined;
    // Locked stations and missiles in flight come first, as a family would see to them.
    if (sp.locked?.length || sp.enemies.some((e) => e.impact && !e.destroyed)) return bot.offlineRound === sp.round ? { type: "stationAction", action: "rally", characterId: me } : stationMove(s, me);
    const target = sp.enemies.find((e) => !e.destroyed && !e.optional) ?? sp.enemies.find((e) => !e.destroyed);
    const plan: StationAction[] = ["fire", "scan", "evasive", "fire", "jam", "fire"];
    const planned = sp.round >= 4 && sp.acted.length === 0 && !bot.noBreakaway ? "breakaway" : plan[sp.acted.length % plan.length]!;
    const action = bot.offlineRound === sp.round ? "rally" : planned;
    return { type: "stationAction", action, characterId: me, targetId: target?.id };
  }
  if (s.scene.mode === "action") {
    if (!standing(me) || s.scene.acted.includes(me)) return undefined;
    const t = s.scene.npcs.find((x) => x.hostile && !x.defeated && !x.surrendered);
    return t ? { type: "combatAction", action: "attack", characterId: me, targetNpcId: t.id } : undefined;
  }
  // Like people, the table waits for the TV to finish reading before moving the story on.
  if (s.awaitingContinue && bot.index === 0 && !tvBusy()) return { type: "advance" };
  return undefined;
}

let tvBusy = () => false;

/** The TV: reads each new narration line aloud with Kokoro, one sentence at a time like the real client. */
async function tvReader(tv: Bot): Promise<void> {
  let seen = tv.state?.log.at(-1)?.id;
  const queue: { text: string; voice: string; speed: number }[] = [];
  let reading = false;
  let kokoro = TTS;
  tvBusy = () => kokoro && (reading || queue.length > 0);
  const pump = async () => {
    if (reading || !kokoro) return;
    reading = true;
    while (queue.length && kokoro) {
      const line = queue.shift()!;
      const started = performance.now();
      try {
        const res = await fetch(`${URL_BASE}/api/tts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(line) });
        const ms = performance.now() - started;
        if (res.ok) {
          const wav = Buffer.from(await res.arrayBuffer());
          const seconds = Math.max(0, wav.length - 44) / (24000 * 4);
          speech.push({ ms, seconds, ok: true, slow: false });
          // Playing the line takes as long as the line.
          await sleep(seconds * 1000);
        } else {
          const body = (await res.json().catch(() => ({}))) as { slow?: boolean };
          speech.push({ ms, seconds: 0, ok: false, slow: Boolean(body.slow) });
          if (res.status === 404 || body.slow) kokoro = false;
        }
      } catch {
        speech.push({ ms: performance.now() - started, seconds: 0, ok: false, slow: false });
      }
    }
    reading = false;
  };
  tv.onState = (s) => {
    const from = seen ? s.log.findIndex((e) => e.id === seen) + 1 : s.log.length;
    seen = s.log.at(-1)?.id;
    for (const e of s.log.slice(from)) {
      if (e.type !== "narration") continue;
      // Exactly what the real TV asks for: the same sentences, in each speaker's own voice.
      const narration = e as Extract<LogEntry, { type: "narration" }>;
      const choice = chooseKokoro(narration, s.missionVoices);
      for (const text of chunks(speakableText(narration.text))) queue.push({ text, ...choice });
    }
    void pump();
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  const res = await fetch(`${URL_BASE}/api/tables`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Virtual family", missionId: MISSION }) });
  if (!res.ok) throw new Error(`Couldn't start a table: ${res.status} ${await res.text()}`);
  const { code } = (await res.json()) as { code: string };
  console.log(`table ${code} · ${MISSION} · ${PLAYERS} players · think ${THINK_MIN}-${THINK_MAX} ms · speech ${TTS ? "on" : "off"}`);

  const tv = new Bot(-1, "Table screen", "spectator");
  await tv.connect(code);
  void tvReader(tv);
  const players = Array.from({ length: PLAYERS }, (_, i) => new Bot(i, `Bot ${i + 1}`, "player"));
  for (const p of players) await p.connect(code);

  // Everyone claims a crew member, then the first player begins.
  const sheets = players[0]!.state!.sheets;
  for (const [i, p] of players.entries()) {
    p.characterId = sheets[i]!.id;
    p.ws.send(JSON.stringify({ type: "claimCharacter", characterId: p.characterId } satisfies ClientMessage));
  }
  await sleep(500);
  players[0]!.ws.send(JSON.stringify({ type: "startGame" } satisfies ClientMessage));

  // The health probe stands in for anyone's next tap: it must always be answered quickly.
  const probe = setInterval(async () => {
    const t = performance.now();
    try {
      await fetch(`${URL_BASE}/api/health`, { signal: AbortSignal.timeout(15000) });
      health.push(performance.now() - t);
    } catch {
      health.push(15000);
    }
  }, 500);

  for (const p of players) {
    p.onState = (s) => {
      if (decide(p, s, players)) void p.tap(() => p.state && decide(p, p.state, players));
    };
  }
  // Nudge everyone now and then, in case a state arrived while a bot was mid-pause.
  const nudge = setInterval(() => {
    for (const p of players) if (p.state) p.onState?.(p.state);
  }, 1000);

  const deadline = started + MINUTES * 60_000;
  while (Date.now() < deadline && players[0]!.state?.phase !== "ended") await sleep(500);
  clearInterval(probe);
  clearInterval(nudge);
  for (const b of [tv, ...players]) b.ws.close();

  const s = players[0]!.state!;
  const ms = taps.map((t) => t.ms);
  const okSpeech = speech.filter((x) => x.ok);
  const report = {
    mission: MISSION,
    players: PLAYERS,
    finished: s.phase === "ended",
    ending: s.nodeId,
    minutes: Number(((Date.now() - started) / 60000).toFixed(1)),
    taps: { count: ms.length, p50: Math.round(percentile(ms, 50)), p95: Math.round(percentile(ms, 95)), max: Math.round(Math.max(0, ...ms)) },
    slowestTaps: [...taps].sort((a, b) => b.ms - a.ms).slice(0, 5).map((t) => `${t.type} ${Math.round(t.ms)} ms`),
    health: { checks: health.length, p95: Math.round(percentile(health, 95)), max: Math.round(Math.max(0, ...health)) },
    speech: {
      lines: speech.length,
      spoken: okSpeech.length,
      slowFallback: speech.some((x) => x.slow),
      averageMakeMs: Math.round(okSpeech.reduce((a, x) => a + x.ms, 0) / Math.max(1, okSpeech.length)),
      averageLineSeconds: Number((okSpeech.reduce((a, x) => a + x.seconds, 0) / Math.max(1, okSpeech.length)).toFixed(1)),
    },
    errors: errors.slice(0, 10),
  };
  console.log(JSON.stringify(report, null, 2));
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  const ok = report.finished && report.taps.p95 <= 500 && report.taps.max <= 3000 && report.health.max <= 3000;
  console.log(ok ? "PASS: the table stayed responsive" : "FAIL: see above");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
