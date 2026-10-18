/**
 * Plays a whole campaign with bots: the first mission, then each sequel in turn on the continued
 * table, as a family would. Between chapters the crew buy what refits they can afford. Reports how
 * each chapter ended, the countdown after it, and the story and refits the campaign finished with.
 *
 *   tsx test/play-campaign.ts <first mission> [--runs 20] [--players 3]
 */
import { MISSIONS, SHIP_REFITS } from "@hwr/content";
import { seededRng } from "@hwr/rules-engine";
import { Hub } from "../src/hub.js";
import { loadPrivateMissions } from "../src/private-missions.js";
import { Store } from "../src/store.js";
import { playToEnd } from "./bots.js";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
};
const runs = Number(opt("--runs", "20"));
const players = Number(opt("--players", "3"));
loadPrivateMissions();
const first = args[0] && MISSIONS[args[0]] ? args[0] : undefined;
if (!first) {
  console.error(`usage: tsx test/play-campaign.ts <first mission> ...\nmissions: ${Object.keys(MISSIONS).join(", ")}`);
  process.exit(1);
}

/** chapter title -> ending node -> count */
const endings = new Map<string, Map<string, number>>();
const clocks = new Map<string, number[]>();
const finalFlags = new Map<string, number>();
const finalRefits = new Map<string, number>();
let stalled = 0;

for (let run = 0; run < runs; run++) {
  const hub = new Hub(new Store(":memory:"));
  let table = hub.create("Test", first);
  let ids: string[] = [];
  for (let chapter = 0; chapter < 12; chapter++) {
    const game = table.game;
    (game as unknown as { rng: unknown }).rng = seededRng(5000 + run * 31 + chapter);
    if (chapter === 0) {
      ids = Array.from({ length: players }, (_, i) => game.join(`Bot ${i + 1}`, "player").id);
      ids.forEach((id, i) => game.handle(id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id }));
    } else {
      for (const p of game.state.players) game.join(p.name, "player", p.id);
      // The crew spend Requisition on the ship before anything else.
      for (const refit of SHIP_REFITS) {
        try {
          game.handle(ids[0]!, { type: "refit", refitId: refit.id });
        } catch {
          // Already fitted, or not enough RU.
        }
      }
    }
    const title = MISSIONS[game.state.missionId]!.title;
    game.handle(ids[0]!, { type: "startGame" });
    playToEnd(game, ids);
    table.commit();
    const s = game.state;
    if (s.phase !== "ended") {
      stalled++;
      console.log(`run ${run} stalled in ${title} at ${s.nodeId}`);
      break;
    }
    const byEnd = endings.get(title) ?? new Map<string, number>();
    byEnd.set(s.nodeId ?? "?", (byEnd.get(s.nodeId ?? "?") ?? 0) + 1);
    endings.set(title, byEnd);
    if (s.story?.clock) clocks.set(title, [...(clocks.get(title) ?? []), s.story.clock.value]);
    if (!MISSIONS[s.missionId]!.sequel) {
      for (const [k, v] of Object.entries(s.story?.flags ?? {})) finalFlags.set(`${k}=${String(v)}`, (finalFlags.get(`${k}=${String(v)}`) ?? 0) + 1);
      for (const r of s.campaign?.refits ?? []) finalRefits.set(r, (finalRefits.get(r) ?? 0) + 1);
      break;
    }
    table = hub.continueCampaign(s.code);
  }
}

const pct = (k: number) => `${Math.round((100 * k) / runs)}%`;
console.log(`Campaign from ${MISSIONS[first]!.title}: ${runs} runs, ${players} players, stalled ${stalled}`);
for (const [title, byEnd] of endings) {
  const c = clocks.get(title);
  const clock = c?.length ? `; countdown after: ${Math.min(...c)}-${Math.max(...c)} (average ${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(1)})` : "";
  console.log(`  ${title}: ${[...byEnd].map(([k, v]) => `${k} ${pct(v)}`).join(", ")}${clock}`);
}
console.log("Final flags:", [...finalFlags].map(([k, v]) => `${k} ${pct(v)}`).join(", ") || "none");
console.log("Final refits:", [...finalRefits].map(([k, v]) => `${k} ${pct(v)}`).join(", ") || "none");
