import { describe, expect, it } from "vitest";
import type { Rng } from "@hwr/rules-engine";
import { CREW_QUALITY, KHARSAANS_PROMISE, MISSIONS, validateMission, type EnemyShipSpec, type Mission, type SpaceNode } from "@hwr/content";
import type { StationAction } from "@hwr/protocol";
import { Game, GameError, newTableState } from "../src/engine.js";

/** Dice the test controls: every d20 shows `d20`, every other die shows `other` (capped to its sides). */
function fixedDice(): Rng & { d20: number; other: number } {
  return {
    d20: 1,
    other: 1,
    die(sides) {
      return Math.min(sides, sides === 20 ? this.d20 : this.other);
    },
  };
}

const missile = (id: string, rounds = 2): EnemyShipSpec => ({
  id,
  name: `Missile ${id}`,
  className: "Planet killer",
  scale: 2,
  systems: { communications: 0, computers: 0, engines: 10, sensors: 0, structure: 4, weapons: 0 },
  maxHull: 4,
  armour: 0,
  weapons: [],
  crew: CREW_QUALITY.basic,
  range: "Medium",
  impact: { rounds, text: `${id} strikes the planet.`, cd: 2 },
});

const frigate: EnemyShipSpec = {
  id: "frigate",
  name: "Vaygr frigate",
  className: "Vaygr assault frigate",
  scale: 3,
  systems: { communications: 8, computers: 8, engines: 8, sensors: 8, structure: 9, weapons: 9 },
  maxHull: 12,
  armour: 1,
  weapons: [{ name: "Pulse cannon", cd: 2, range: "Medium" }],
  crew: CREW_QUALITY.basic,
  range: "Medium",
};

function battle(space: Partial<SpaceNode>): Mission {
  const fight: SpaceNode = {
    id: "fight",
    type: "space",
    intro: "Battle stations.",
    ship: { ...KHARSAANS_PROMISE, maxHull: 30 },
    enemies: [frigate],
    victory: { text: "Won.", next: "won" },
    defeat: { text: "Lost.", next: "lost" },
    ...space,
  };
  const mission: Mission = {
    id: `staged-${Math.random().toString(36).slice(2)}`,
    title: "Staged",
    blurb: "",
    recommendedPlayers: "1-6",
    art: "/art/scenes/title.webp",
    clock: { id: "awakening", label: "Dreadnought awakening", max: 8 },
    startNode: "fight",
    nodes: {
      fight,
      won: { id: "won", type: "end", text: "Victory.", ru: 1 },
      lost: { id: "lost", type: "end", text: "Defeat.", ru: 0 },
    },
    npcs: {},
    gmNotes: "",
  };
  expect(validateMission(mission)).toEqual([]);
  MISSIONS[mission.id] = mission;
  return mission;
}

function play(mission: Mission, players = 3) {
  const dice = fixedDice();
  const game = new Game(newTableState({ id: "t", code: "ABCD", name: "Test", missionId: mission.id, aiAvailable: false }), dice);
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const p = game.join(`Player ${i + 1}`, "player");
    game.handle(p.id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id });
    ids.push(p.id);
  }
  game.handle(ids[0]!, { type: "startGame" });
  const chars = ids.map((id) => game.state.players.find((p) => p.id === id)!.characterId!);
  /** One crew member works a station and, if it needs a roll, rolls and accepts it. */
  const act = (i: number, action: StationAction, extra: { targetId?: string; station?: StationAction } = {}) => {
    game.handle(ids[i]!, { type: "stationAction", action, characterId: chars[i]!, ...extra });
    if (game.state.pendingRoll) {
      game.handle(ids[i]!, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: true, fortuneCritical: false });
      game.handle(ids[i]!, { type: "acceptRoll", bonus: 0 });
    }
  };
  /** Everyone rallies, which needs no target and changes nothing: the round just passes. */
  const passRound = () => chars.forEach((_, i) => act(i, "rally"));
  return { game, dice, act, passRound };
}

describe("staged ship battles", () => {
  it("a missile nobody stops strikes at the end of its last round", () => {
    const m = battle({ enemies: [frigate, missile("m1", 2)], impactEffects: { clock: 1 } });
    const { game, passRound } = play(m);
    passRound();
    expect(game.state.space?.enemies.find((e) => e.id === "m1")?.impacted).toBeFalsy();
    passRound();
    const m1 = game.state.space!.enemies.find((e) => e.id === "m1")!;
    expect(m1.impacted).toBe(true);
    expect(m1.destroyed).toBe(true);
    expect(game.state.story?.clock?.value).toBe(1);
    expect(game.state.log.some((l) => l.type === "narration" && l.text === "m1 strikes the planet.")).toBe(true);
  });

  it("any hit that gets through destroys a missile", () => {
    const m = battle({ enemies: [frigate, missile("m1", 3)] });
    const { game, act } = play(m);
    act(0, "fire", { targetId: "m1" });
    expect(game.state.space!.enemies.find((e) => e.id === "m1")!.destroyed).toBe(true);
  });

  it("Helm can put the ship in a missile's path: the missile dies and the ship takes the blast", () => {
    const m = battle({ enemies: [frigate, missile("m1", 3)], interceptEffects: { setFlags: { shielded: true } } });
    const { game, act } = play(m);
    expect(() => act(0, "intercept", { targetId: "frigate" })).toThrow(GameError);
    act(0, "intercept", { targetId: "m1" });
    const sp = game.state.space!;
    expect(sp.enemies.find((e) => e.id === "m1")!.destroyed).toBe(true);
    expect(sp.enemies.find((e) => e.id === "m1")!.impacted).toBeFalsy();
    expect(sp.ship.hull).toBeGreaterThan(0);
    expect(game.state.story?.flags.shielded).toBe(true);
  });

  it("phases bring in a second wave once the first is cleared, and only then can the crew win", () => {
    const boss = { ...frigate, id: "boss", name: "Keeper" };
    const m = battle({ phases: [{ id: "keeper", when: { cleared: true }, text: "A Keeper unfolds from the dark.", spawn: [boss] }] });
    const { game, act } = play(m);
    const sp = () => game.state.space!;
    const nearlyWrecked = (id: string) => Object.assign(sp().enemies.find((e) => e.id === id)!, { hull: 12, breaches: { ...sp().enemies[0]!.breaches, structure: 2 } });
    nearlyWrecked("frigate");
    act(0, "fire", { targetId: "frigate" });
    expect(sp().enemies.find((e) => e.id === "frigate")!.destroyed).toBe(true);
    expect(game.state.scene.mode).toBe("space");
    expect(sp().enemies.some((e) => e.id === "boss" && !e.destroyed)).toBe(true);
    nearlyWrecked("boss");
    act(1, "fire", { targetId: "boss" });
    expect(game.state.space).toBeUndefined();
    expect(game.state.phase).toBe("ended");
    expect(game.state.log.some((l) => l.type === "narration" && l.text === "Won.")).toBe(true);
  });

  it("a phase with a story requirement is passed over for good when the story doesn't meet it", () => {
    const m = battle({
      phases: [
        { id: "surge", when: { round: 2 }, requires: { flag: "knowsName" }, text: "She answers to her name.", effects: { clock: -1 } },
        { id: "late", when: { round: 2 }, text: "Round two begins.", effects: { clock: 2 } },
      ],
    });
    const { game, passRound } = play(m);
    passRound();
    expect(game.state.space!.phasesDone).toEqual(["surge", "late"]);
    expect(game.state.story?.clock?.value).toBe(2);
  });

  it("locked stations refuse orders until Engineering overrides them", () => {
    const m = battle({ locked: ["fire"] });
    const { game, act } = play(m);
    expect(() => act(0, "fire", { targetId: "frigate" })).toThrow(/locked out/);
    expect(() => act(0, "override", { station: "scan" })).toThrow(GameError);
    act(0, "override", { station: "fire" });
    expect(game.state.space!.locked).toEqual([]);
    act(1, "fire", { targetId: "frigate" });
    expect(game.state.space!.acted).toContain(game.state.players[1]!.characterId);
  });

  it("an awake ship acts on its own at the end of the round: a low roll surges through its own systems", () => {
    const rogue = { speaker: "Vash'Kora", fire: ["I choose {target}."], surge: ["You are not my makers."], seize: ["The {station} is mine."] };
    const m = battle({ rogue, phases: [{ id: "wake", when: { round: 1 }, text: "The ship stirs.", rogue: true }] });
    const { game, passRound } = play(m);
    expect(game.state.space!.rogue).toBe(true);
    const hullBefore = game.state.space!.ship.hull;
    passRound();
    expect(game.state.log.some((l) => l.type === "narration" && l.speaker === "Vash'Kora" && l.text === "You are not my makers.")).toBe(true);
    expect(game.state.space!.ship.hull).toBeGreaterThan(hullBefore);
  });

  it("a high roll lets the ship seize a station", () => {
    const rogue = { speaker: "Vash'Kora", fire: ["I choose {target}."], surge: ["Not yet."], seize: ["The {station} is mine."], awake: true };
    const m = battle({ rogue });
    const { game, dice, passRound } = play(m);
    dice.other = 6;
    passRound();
    // The highest pick of what this fight allows: no breaking away here, and no missiles to intercept.
    expect(game.state.space!.locked).toEqual(["jam"]);
    expect(game.state.log.some((l) => l.type === "narration" && l.speaker === "Vash'Kora" && /^The .+ is mine\.$/.test(l.text))).toBe(true);
  });

  it("an effect can take refits away for the rest of the campaign, naming only the ones the crew had", () => {
    const m = battle({ phases: [{ id: "cut", when: { round: 2 }, text: "You cut her out of the guns.", effects: { loseRefits: ["fire-control", "main-guns"] } }] });
    const { game, passRound } = play(m);
    game.state.campaign = { id: "c", name: "Test", chapters: [], ru: 0, advances: {}, refits: ["armour", "fire-control"] };
    passRound();
    expect(game.state.campaign.refits).toEqual(["armour"]);
    expect(game.state.campaign.lostRefits).toEqual(["fire-control", "main-guns"]);
    expect(game.state.log.some((l) => l.type === "system" && l.text === "Lost for good: fire-control computer.")).toBe(true);
  });

  it("a phase can end the battle outright", () => {
    const m = battle({ phases: [{ id: "flee", when: { round: 2 }, text: "The Vaygr break off.", end: "victory" }] });
    const { game, passRound } = play(m);
    passRound();
    expect(game.state.phase).toBe("ended");
  });

  it("the validator catches phases waiting on ships that never fly", () => {
    const node = { ...(battle({}).nodes.fight as SpaceNode), phases: [{ id: "p", when: { destroyed: "ghost" }, text: "" }] };
    const broken = { ...battle({}), nodes: { ...battle({}).nodes, fight: node } };
    expect(validateMission(broken)).toEqual(["fight phase p waits on missing ship ghost"]);
  });
});
