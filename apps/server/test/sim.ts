/**
 * Balance simulator: plays the default mission with a simple bot table.
 *   npx tsx test/sim.ts            -> outcome statistics for 1-6 players
 *   npx tsx test/sim.ts dump 4 42  -> full log of one session (players, seed)
 *   npx tsx test/sim.ts rates      -> how often tests pass, by difficulty
 */
import { seededRng } from "@hwr/rules-engine";
import { DEFAULT_MISSION_ID } from "@hwr/content";
import { Game, newTableState } from "../src/engine.js";
import { loadPrivateMissions } from "../src/private-missions.js";

// This PC's private missions (reference/missions) can be simulated too, e.g. HWR_MISSION=khar-toba.
loadPrivateMissions();

/** Pick the mission with HWR_MISSION=cold-harbour (default: the default mission). */
const MISSION = process.env.HWR_MISSION ?? DEFAULT_MISSION_ID;

export function playSession(players: number, seed: number, choice = 0, missionId = MISSION): Game {
  const game = new Game(newTableState({ id: "t", code: "A", name: "T", missionId, aiAvailable: false }), seededRng(seed));
  const ids = Array.from({ length: players }, (_, i) => {
    const p = game.join(`P${i}`, "player");
    game.handle(p.id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id });
    return p.id;
  });
  game.handle(ids[0]!, { type: "startGame" });
  const s = game.state;
  const ctl = (c: string) => s.characters[c]!.controllerId!;
  const standing = (id: string) => s.characters[id]!.injuries < 2;
  for (let n = 0; s.phase === "playing" && n < 600; n++) {
    if (s.awaitingContinue) game.handle(ids[0]!, { type: "advance" });
    else if (s.pendingChoice) for (const id of ids) game.handle(id, { type: "vote", optionId: s.pendingChoice!.options[choice % s.pendingChoice!.options.length]!.id });
    else if (s.pendingRoll?.rolled) game.handle(ctl(s.pendingRoll.rolled.characterId), { type: "acceptRoll", bonus: 3 });
    else if (s.pendingRoll) {
      const c = s.pendingRoll.characterId ?? game.partyIds().filter(standing)[n % game.partyIds().filter(standing).length]!;
      game.handle(ctl(c), { type: "roll", boughtDice: s.pools.momentum >= 1 ? 1 : 0, payWithThreat: false, useFocus: true, fortuneCritical: false });
    } else if (s.scene.mode === "space" && s.space) {
      const sp = s.space;
      const c = game.partyIds().find((id) => standing(id) && !sp.acted.includes(id))!;
      const target = sp.enemies.find((e) => !e.destroyed && !e.optional) ?? sp.enemies.find((e) => !e.destroyed)!;
      const plan = ["fire", "scan", "evasive", "fire", "jam", "fire"] as const;
      const action = sp.round >= 4 && sp.acted.length === 0 ? "breakaway" : plan[sp.acted.length % plan.length]!;
      try {
        game.handle(ctl(c), { type: "stationAction", action, characterId: c, targetId: target.id });
      } catch {
        // That station's system is offline: rally the crew instead.
        game.handle(ctl(c), { type: "stationAction", action: "rally", characterId: c });
      }
    } else {
      const c = game.partyIds().find((id) => standing(id) && !s.scene.acted.includes(id))!;
      const t = s.scene.npcs.find((x) => x.hostile && !x.defeated && !x.surrendered)!;
      game.handle(ctl(c), { type: "combatAction", action: "attack", characterId: c, targetNpcId: t.id });
    }
  }
  return game;
}

const [mode, a, b] = process.argv.slice(2);
if (mode === "dump") {
  const game = playSession(Number(a ?? 4), Number(b ?? 42));
  for (const l of game.state.log) {
    if (l.type === "roll") {
      const r = l.roll;
      const res = r.result;
      console.log(
        `  ROLL ${r.characterName}: ${r.label} TN${res.targetNumber} D${res.difficulty} [${res.dice.map((d) => d.face)}] ${res.passed ? "PASS" : "fail"} m${res.momentum}` +
          (r.stress ? ` stress ${r.stress.total}->${r.stress.inflicted} inj+${r.stress.injuriesGained}` : "") +
          (r.work ? ` work ${r.work.total}->${r.work.effective}` : ""),
      );
    } else console.log(`${l.type}: ${"text" in l ? l.text.slice(0, 100) : ""}`);
  }
} else if (process.argv[2] === "rates") {
  const byD: Record<string, [number, number]> = {};
  for (let players = 1; players <= 6; players++)
    for (let seed = 1; seed <= 100; seed++)
      for (const l of playSession(players, seed * 31 + players, seed).state.log) {
        if (l.type !== "roll") continue;
        const key = `D${l.roll.result.difficulty}`;
        const t = (byD[key] ??= [0, 0]);
        t[0] += l.roll.result.passed ? 1 : 0;
        t[1]++;
      }
  const all = Object.values(byD).reduce((a, [p, n]) => [a[0] + p, a[1] + n], [0, 0]);
  for (const [k, [p, n]] of Object.entries(byD).sort()) console.log(`${k}: ${Math.round((p / n) * 100)}% of ${n}`);
  console.log(`all: ${Math.round((all[0] / all[1]) * 100)}% of ${all[1]}`);
} else {
  const stats: Record<string, number> = {};
  const runs = 200;
  for (let players = 1; players <= 6; players++)
    for (let seed = 1; seed <= runs; seed++) {
      const game = playSession(players, seed * 31 + players, seed);
      const text = game.state.log.map((l) => ("text" in l ? l.text : "")).join("\n");
      const k = (x: string) => (stats[x] = (stats[x] ?? 0) + 1);
      k(`p${players} ending ${game.state.nodeId}`);
      k(`p${players} space ${/blossom of fire\.[\s\S]*Without its fighters|the Taiidan lose you/.test(text) ? (text.includes("lose you") ? "escaped" : "won") : /broadside from the destroyer/.test(text) ? "lost" : "n/a"}`);
      k(`p${players} combat ${/driven back to the corvette|Pinned behind the crates/.test(text) ? "lost" : "won or talked down"}`);
    }
  console.log(Object.entries(stats).sort().map(([k, v]) => `${k}: ${Math.round((v / runs) * 100)}%`).join("\n"));
}
