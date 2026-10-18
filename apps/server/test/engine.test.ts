import { describe, expect, it } from "vitest";
import { scriptedRng, seededRng } from "@hwr/rules-engine";
import { DEFAULT_MISSION_ID, MISSIONS, buildCustomSheet } from "@hwr/content";
import { Game, GameError, newTableState } from "../src/engine.js";
import { assignGallerySlots, portraitOrFallback, type LocalPortrait } from "../src/local-portraits.js";

function newGame(seed: number, players: number, missionId = DEFAULT_MISSION_ID) {
  const game = new Game(newTableState({ id: "t", code: "ABCD", name: "Test", missionId, aiAvailable: false }), seededRng(seed));
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const p = game.join(`Player ${i + 1}`, "player");
    game.handle(p.id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id });
    ids.push(p.id);
  }
  return { game, ids };
}

/** Plays like a simple-minded table: first option, no dice bought, attack the first target. */
function autoplay(game: Game, ids: string[], maxSteps = 500): number {
  game.handle(ids[0]!, { type: "startGame" });
  let steps = 0;
  while (game.state.phase === "playing" && steps++ < maxSteps) {
    const s = game.state;
    const controllerOf = (charId: string) => s.characters[charId]!.controllerId!;
    const activeChar = () => game.partyIds().find((id) => s.characters[id]!.injuries < 2)!;
    if (s.awaitingContinue) {
      game.handle(ids[0]!, { type: "advance" });
    } else if (s.pendingChoice) {
      for (const id of ids) game.handle(id, { type: "vote", optionId: s.pendingChoice!.options[steps % 2 === 0 ? 0 : s.pendingChoice!.options.length - 1]!.id });
    } else if (s.pendingRoll?.rolled) {
      game.handle(controllerOf(s.pendingRoll.rolled.characterId), { type: "acceptRoll", bonus: 3 });
    } else if (s.pendingRoll) {
      const charId = s.pendingRoll.characterId ?? activeChar();
      game.handle(controllerOf(charId), { type: "takeRoll", characterId: charId });
      game.handle(controllerOf(charId), { type: "roll", boughtDice: s.pools.momentum >= 1 ? 1 : 0, payWithThreat: false, useFocus: true, fortuneCritical: false });
    } else if (s.scene.mode === "space" && s.space) {
      const sp = s.space;
      const charId = game.partyIds().find((id) => s.characters[id]!.injuries < 2 && !sp.acted.includes(id))!;
      const target = sp.enemies.find((e) => !e.destroyed && !e.optional) ?? sp.enemies.find((e) => !e.destroyed)!;
      const plan = ["fire", "scan", "evasive", "fire", "jam", "fire"] as const;
      const action = sp.round >= 4 && sp.acted.length === 0 ? "breakaway" : plan[sp.acted.length % plan.length]!;
      try {
        game.handle(controllerOf(charId), { type: "stationAction", action, characterId: charId, targetId: target.id });
      } catch {
        // That station's system is offline: rally the crew instead.
        game.handle(controllerOf(charId), { type: "stationAction", action: "rally", characterId: charId });
      }
    } else if (s.scene.mode === "action") {
      const charId = game.partyIds().find((id) => s.characters[id]!.injuries < 2 && !s.scene.acted.includes(id))!;
      const target = s.scene.npcs.find((n) => n.hostile && !n.defeated && !n.surrendered)!;
      game.handle(controllerOf(charId), { type: "combatAction", action: "attack", characterId: charId, targetNpcId: target.id });
    } else {
      throw new Error(`stuck at ${s.nodeId}`);
    }
  }
  return steps;
}

describe("Director", () => {
  const cases = Object.values(MISSIONS).flatMap((m) => [1, 2, 3, 4, 5, 6].map((p) => [m.title, p, m.id] as const));
  it.each(cases)("plays %s to an ending with %i players", (_title, players, missionId) => {
    for (let seed = 1; seed <= 25; seed++) {
      const { game, ids } = newGame(seed * 7919 + players, players, missionId);
      autoplay(game, ids);
      expect(game.state.phase, `seed ${seed}`).toBe("ended");
      expect(game.state.awards!.ru).toBeGreaterThan(0);
      expect(game.state.pools.threat).toBeGreaterThanOrEqual(0);
      expect(game.state.pools.momentum).toBeLessThanOrEqual(6);
    }
  });

  it("starts Threat at twice the party size", () => {
    const { game, ids } = newGame(1, 4);
    game.handle(ids[0]!, { type: "startGame" });
    expect(game.state.pools.threat).toBe(8);
  });

  it("refuses a seventh player and a second GM", () => {
    const { game } = newGame(1, 6);
    expect(() => game.join("Seven", "player")).toThrow(GameError);
    game.join("GM", "gm");
    expect(() => game.join("GM 2", "gm")).toThrow(GameError);
  });

  it("won't let a player roll for someone else's character", () => {
    const { game, ids } = newGame(3, 2);
    game.handle(ids[0]!, { type: "startGame" });
    game.handle(ids[0]!, { type: "advance" });
    game.handle(ids[0]!, { type: "advance" });
    for (const id of ids) game.handle(id, { type: "vote", optionId: "direct" });
    expect(game.state.pendingRoll).toBeDefined();
    const other = game.state.sheets[1]!.id;
    expect(() => game.handle(ids[0]!, { type: "takeRoll", characterId: other })).toThrow(GameError);
  });

  it("charges escalating Momentum for bought dice, then Threat when the pool runs dry", () => {
    const { game, ids } = newGame(5, 1);
    game.handle(ids[0]!, { type: "startGame" });
    game.handle(ids[0]!, { type: "advance" });
    game.handle(ids[0]!, { type: "advance" });
    game.handle(ids[0]!, { type: "vote", optionId: "direct" });
    const before = game.state.pools.threat;
    game.handle(ids[0]!, { type: "roll", boughtDice: 3, payWithThreat: false, useFocus: false, fortuneCritical: false });
    expect(game.state.pendingRoll!.rolled!.result.dice).toHaveLength(5);
    expect(game.state.pools.threat).toBe(before + 6);
  });
});

describe("assists", () => {
  /** Two players at the first test (fly silent through the debris, D2), with scripted dice. */
  function atFirstTest(faces: number[]) {
    const game = new Game(newTableState({ id: "t", code: "ABCD", name: "T", missionId: DEFAULT_MISSION_ID, aiAvailable: false }), scriptedRng(faces));
    const a = game.join("A", "player");
    const b = game.join("B", "player");
    game.handle(a.id, { type: "claimCharacter", characterId: "jaal-manaan" });
    game.handle(b.id, { type: "claimCharacter", characterId: "saiyuun-paktu" });
    game.handle(a.id, { type: "startGame" });
    game.handle(a.id, { type: "advance" });
    game.handle(a.id, { type: "advance" });
    game.handle(a.id, { type: "vote", optionId: "silent" });
    game.handle(b.id, { type: "vote", optionId: "silent" });
    return { game, a, b };
  }

  it("adds the assistant's successes when the leader scores", () => {
    // Jaal: Coordination 11 + Flight 5 = TN 16. Saiyuun assists: 8 + 3 = TN 11.
    const { game, a, b } = atFirstTest([3, 19, 1]);
    game.handle(b.id, { type: "assist", characterId: "saiyuun-paktu" });
    expect(game.state.pendingRoll!.assists).toHaveLength(1);
    game.handle(a.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false });
    const record = game.state.pendingRoll!.rolled!;
    expect(record.assists![0]!.die.successes).toBe(2);
    expect(record.result.successes).toBe(3);
    expect(record.result.passed).toBe(true);
  });

  it("ignores assists when the leader scores nothing", () => {
    const { game, a, b } = atFirstTest([18, 19, 1]);
    game.handle(b.id, { type: "assist", characterId: "saiyuun-paktu" });
    game.handle(a.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false });
    const record = game.state.pendingRoll!.rolled!;
    expect(record.result.successes).toBe(0);
    expect(record.result.passed).toBe(false);
  });

  it("won't let you assist your own roll or an attack", () => {
    const { game, a } = atFirstTest([3, 19, 1]);
    game.handle(a.id, { type: "takeRoll", characterId: "jaal-manaan" });
    expect(() => game.handle(a.id, { type: "assist", characterId: "jaal-manaan" })).toThrow(GameError);
  });
});

describe("character designer", () => {
  const design = () => ({
    name: "Arin Kaalel",
    kiith: "Kaalel",
    crewRole: "Pilot",
    tagline: "",
    portrait: "/art/portraits/gallery-1.webp",
    attributes: { agility: 9, brawn: 9, coordination: 9, insight: 9, reason: 9, will: 9 },
    skills: { combat: 2, command: 2, engineering: 3, exploration: 3, flight: 2, medical: 2 },
    focuses: ["Small Craft", "Navigation", "Gunnery"],
    aspects: [],
  });

  it("adds a valid design to the table and gives it to its designer", () => {
    const { game, ids } = newGame(1, 1);
    const p = game.join("Designer", "player");
    game.handle(p.id, { type: "createCharacter", character: design() });
    const sheet = game.state.sheets.at(-1)!;
    expect(sheet.name).toBe("Arin Kaalel");
    expect(game.state.players.find((x) => x.id === p.id)!.characterId).toBe(sheet.id);
    game.handle(ids[0]!, { type: "startGame" });
    expect(game.partyIds()).toContain(sheet.id);
  });

  it("refuses an illegal design and says why", () => {
    const { game } = newGame(1, 1);
    const p = game.join("Designer", "player");
    const bad = { ...design(), skills: { ...design().skills, flight: 5, combat: 5 } };
    expect(() => game.handle(p.id, { type: "createCharacter", character: bad })).toThrow(/total|only one skill/i);
  });

  it("accepts a family portrait only when this PC has it", () => {
    const family = { ...design(), portrait: "/local/portraits/family-1.webp" };
    expect(() => buildCustomSheet(family, "x")).toThrow(/portrait/i);
    expect(buildCustomSheet(family, "x", ["/local/portraits/family-1.webp"]).portrait).toBe("/local/portraits/family-1.webp");
  });

  it("puts family portraits into gallery slots of the same sex, and leaves the stock art without them", () => {
    const fam = (n: number, sex: string): LocalPortrait => ({ url: `/local/portraits/family-${n}.webp`, file: `family-${n}.webp`, label: `F${n}`, sex });
    const family = [fam(1, "man"), fam(3, "woman"), fam(4, "woman"), fam(5, "man"), fam(6, "")];
    const slots = assignGallerySlots(family, ["man", "woman", "man", "any", "woman"]);
    expect(slots.get(0)?.file).toBe("family-1.webp");
    expect(slots.get(1)?.file).toBe("family-3.webp");
    expect(slots.get(2)?.file).toBe("family-5.webp");
    expect(slots.get(4)?.file).toBe("family-4.webp");
    expect(slots.get(3)?.file).toBe("family-6.webp");
    expect(new Set([...slots.values()].map((p) => p.url)).size).toBe(slots.size);
    expect(assignGallerySlots([]).size).toBe(0);
  });

  it("gives a saved family portrait a stable gallery fallback on a PC without it", () => {
    const url = "/local/portraits/family-1.webp";
    expect(portraitOrFallback(url, "custom-abc", [url])).toBe(url);
    const fallback = portraitOrFallback(url, "custom-abc", []);
    expect(fallback).toMatch(/^\/art\/portraits\/gallery-[1-8]\.webp$/);
    expect(portraitOrFallback(url, "custom-abc", [])).toBe(fallback);
    expect(portraitOrFallback("/art/portraits/gallery-3.webp", "x", [])).toBe("/art/portraits/gallery-3.webp");
  });
});

describe("real dice", () => {
  it("scores the faces a player rolled at the table, and marks the roll", async () => {
    const { Game, newTableState } = await import("../src/engine.js");
    const game = new Game(newTableState({ id: "t", code: "RD", name: "T", missionId: "silent-beacon", aiAvailable: false }));
    const p = game.join("Sam", "player");
    game.handle(p.id, { type: "claimCharacter", characterId: game.state.sheets[0]!.id });
    game.handle(p.id, { type: "startGame" });
    for (let i = 0; i < 20 && !game.state.pendingRoll; i++) {
      if (game.state.awaitingContinue) game.handle(p.id, { type: "advance" });
      else if (game.state.pendingChoice) game.handle(p.id, { type: "vote", optionId: game.state.pendingChoice.options[0]!.id });
    }
    expect(game.state.pendingRoll).toBeDefined();
    expect(() => game.handle(p.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false, faces: [3] })).toThrow(/Enter all 2 dice/);
    expect(() => game.handle(p.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false, faces: [3, 21] })).toThrow(/1 to 20/);
    game.handle(p.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false, faces: [1, 20] });
    const rolled = game.state.pendingRoll!.rolled!;
    expect(rolled.physical).toBe(true);
    expect(rolled.result.dice.map((d) => d.face)).toEqual([1, 20]);
  });
});
