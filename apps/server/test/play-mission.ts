/**
 * Plays a mission (built-in or private) many times with bots and reports how it went: which
 * endings were reached, the story flags left behind, how many crew went down, and any run that
 * stalled. Votes go to the first option unless --choose picks one, so every branch can be tried.
 *
 *   tsx test/play-mission.ts <mission> [--runs 50] [--players 3] [--choose node=option ...] [--flags key=value ...] [--clock N] [--shield] [--path] [--log]
 *
 * --flags seeds the story, as a campaign would, to play a sequel's branches: --flags destroyer=captured
 * --clock seeds the mission's countdown at a value: --clock 4
 * --shield has Helm put the ship in the path of any missile about to strike, rather than shooting at it.
 */
import { MISSIONS, validateMission } from "@hwr/content";
import { seededRng } from "@hwr/rules-engine";
import type { FlagValue } from "@hwr/protocol";
import { Hub } from "../src/hub.js";
import { stationMove } from "./bots.js";
import { loadPrivateMissions } from "../src/private-missions.js";
import { Store } from "../src/store.js";

const args = process.argv.slice(2);
const missionId = args[0];
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const many = (name: string) => args.flatMap((a, i) => (args[i - 1] === name ? [a] : []));
const runs = Number(opt("--runs", "50"));
const players = Number(opt("--players", "3"));
const choose = Object.fromEntries(many("--choose").map((c) => c.split("=") as [string, string]));
const flags: Record<string, FlagValue> = Object.fromEntries(
  many("--flags").map((f) => {
    const [k, v] = f.split("=") as [string, string];
    return [k, v === "true" ? true : v === "false" ? false : v];
  }),
);
const log = args.includes("--log");
const shield = args.includes("--shield");

loadPrivateMissions();
const mission = missionId ? MISSIONS[missionId] : undefined;
if (!mission) {
  console.error(`usage: tsx test/play-mission.ts <mission> ...\nmissions: ${Object.keys(MISSIONS).join(", ")}`);
  process.exit(1);
}
const problems = validateMission(mission);
if (problems.length) console.log("Validation problems:\n  " + problems.join("\n  "));

const endings = new Map<string, number>();
const flagCounts = new Map<string, number>();
let downed = 0;
/** Where the campaign countdown ended, by value. */
const clocks = new Map<number, number>();
/** How many runs passed through each node. */
const visited = new Map<string, number>();
/** Where crew were first taken down, by node. */
const downedAt = new Map<string, number>();
let stalled = 0;
let steps = 0;

for (let run = 0; run < runs; run++) {
  const table = new Hub(new Store(":memory:")).create("Test", mission.id);
  const game = table.game;
  (game as unknown as { rng: unknown }).rng = seededRng(1000 + run);
  const ids = Array.from({ length: players }, (_, i) => game.join(`Bot ${i + 1}`, "player").id);
  ids.forEach((id, i) => game.handle(id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id }));
  const clockAt = Number(opt("--clock", "-1"));
  if (Object.keys(flags).length || clockAt >= 0) {
    const clock = clockAt >= 0 && mission.clock ? { ...mission.clock, value: clockAt } : undefined;
    game.state.campaign = { id: "c", name: "Test", chapters: [], ru: 0, advances: {}, story: { flags: { ...flags }, ...(clock ? { clock } : {}) } };
  }
  game.handle(ids[0]!, { type: "startGame" });
  const s = game.state;
  const ctl = (c: string) => s.characters[c]!.controllerId!;
  const standing = (id: string) => s.characters[id]!.injuries < 2;
  let n = 0;
  const seen = new Set<string>();
  const path = new Set<string>();
  for (; s.phase === "playing" && n < 1500; n++) {
    if (s.nodeId && !path.has(s.nodeId)) {
      path.add(s.nodeId);
      visited.set(s.nodeId, (visited.get(s.nodeId) ?? 0) + 1);
    }
    for (const [id, c] of Object.entries(s.characters)) {
      if (c.downed && !seen.has(id)) {
        seen.add(id);
        downedAt.set(s.nodeId ?? "?", (downedAt.get(s.nodeId ?? "?") ?? 0) + 1);
      }
    }
    if (s.awaitingContinue) game.handle(ids[0]!, { type: "advance" });
    else if (s.pendingChoice) {
      const wanted = choose[s.pendingChoice.id];
      const option = s.pendingChoice.options.find((o) => o.id === wanted) ?? s.pendingChoice.options[0]!;
      for (const id of ids) game.handle(id, { type: "vote", optionId: option.id });
    } else if (s.pendingRoll?.rolled) game.handle(ctl(s.pendingRoll.rolled.characterId), { type: "acceptRoll", bonus: 3 });
    else if (s.pendingRoll) {
      const party = game.partyIds().filter(standing);
      game.handle(ctl(s.pendingRoll.characterId ?? party[n % party.length]!), { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: true, fortuneCritical: false });
    } else if (s.scene.mode === "space" && s.space) {
      const c = game.partyIds().find((id) => standing(id) && !s.space!.acted.includes(id))!;
      try {
        game.handle(ctl(c), stationMove(s, c, { shield }));
      } catch {
        game.handle(ctl(c), { type: "stationAction", action: "rally", characterId: c });
      }
    } else {
      const c = game.partyIds().find((id) => standing(id) && !s.scene.acted.includes(id))!;
      const t = s.scene.npcs.find((x) => x.hostile && !x.defeated && !x.surrendered)!;
      game.handle(ctl(c), { type: "combatAction", action: "attack", characterId: c, targetNpcId: t.id });
    }
  }
  steps += n;
  if (s.phase !== "ended") {
    stalled++;
    if (log) console.log(`run ${run} stalled at ${s.nodeId}`);
    continue;
  }
  const ending = s.nodeId ?? "?";
  endings.set(ending, (endings.get(ending) ?? 0) + 1);
  for (const [k, v] of Object.entries(s.story?.flags ?? {})) flagCounts.set(`${k}=${String(v)}`, (flagCounts.get(`${k}=${String(v)}`) ?? 0) + 1);
  downed += Object.values(s.characters).filter((c) => c.downed).length;
  if (s.story?.clock) clocks.set(s.story.clock.value, (clocks.get(s.story.clock.value) ?? 0) + 1);
  if (log) console.log(`run ${run}: ${ending} ${JSON.stringify(s.story?.flags ?? {})}`);
}

const pct = (k: number) => `${Math.round((100 * k) / runs)}%`;
console.log(`${mission.title}: ${runs} runs, ${players} players, choices ${JSON.stringify(choose)}, flags ${JSON.stringify(flags)}`);
console.log("Endings:", [...endings].map(([k, v]) => `${k} ${pct(v)}`).join(", ") || "none");
if (clocks.size) console.log("Countdown at the end:", [...clocks].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${pct(v)}`).join(", "));
console.log("Flags:", [...flagCounts].map(([k, v]) => `${k} ${pct(v)}`).join(", ") || "none");
console.log(`Crew taken down per run: ${(downed / runs).toFixed(2)}; average steps ${Math.round(steps / runs)}; stalled ${stalled}`);
if (args.includes("--path")) console.log("Visited:", [...visited].map(([k, v]) => `${k} ${pct(v)}`).join(", "));
if (downedAt.size) console.log("Taken down at:", [...downedAt].map(([k, v]) => `${k} ${(v / runs).toFixed(2)}`).join(", "));
