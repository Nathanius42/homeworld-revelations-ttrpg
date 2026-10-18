import { describe, expect, it } from "vitest";
import { MISSIONS, meets, validateMission, type Mission } from "@hwr/content";
import { Hub } from "../src/hub.js";
import { Store } from "../src/store.js";

const clock = { id: "awakening", label: "Dreadnought awakening", max: 4 };

/** Abandon ship: scuttle the destroyer or run. A hidden option needs a flag nobody has set. */
const first: Mission = {
  id: "story-first",
  title: "Abandon Ship",
  blurb: "",
  recommendedPlayers: "1-6",
  art: "/art/scenes/title.webp",
  sequel: "story-second",
  clock,
  startNode: "boarded",
  nodes: {
    boarded: { id: "boarded", type: "narration", speaker: "Narrator", text: "Boarders on deck four.", effects: { setFlags: { boarded: true }, clock: 1 }, next: "abandon" },
    abandon: {
      id: "abandon",
      type: "choice",
      prompt: "What of the ship?",
      options: [
        { id: "scuttle", label: "Scuttle her", next: "end", effects: { setFlags: { destroyer: "scuttled" } } },
        { id: "run", label: "Just run", next: "end", effects: { clock: 2 } },
        { id: "secret", label: "Use the codes", next: "end", requires: { flag: "knowsCodes" } },
      ],
    },
    end: { id: "end", type: "end", text: "The crew reach the lifeboats.", ru: 1 },
  },
  npcs: {},
  gmNotes: "",
};

/** The destroyer comes back, unless it was scuttled. */
const second: Mission = {
  id: "story-second",
  title: "Old Friends",
  blurb: "",
  recommendedPlayers: "1-6",
  art: "/art/scenes/title.webp",
  clock,
  startNode: "check",
  nodes: {
    check: { id: "check", type: "branch", cases: [{ when: { flag: "destroyer", equals: "scuttled" }, next: "quiet" }], otherwise: "ambush" },
    quiet: { id: "quiet", type: "narration", speaker: "Narrator", text: "Only wreckage where she died.", next: "end" },
    ambush: { id: "ambush", type: "narration", speaker: "Narrator", text: "Your old destroyer, flying Vaygr colours.", next: "end" },
    end: { id: "end", type: "end", text: "Done.", ru: 1 },
  },
  npcs: {},
  gmNotes: "",
};

MISSIONS[first.id] = first;
MISSIONS[second.id] = second;

function play() {
  const hub = new Hub(new Store(":memory:"));
  const table = hub.create("Pride of Hiigara", first.id);
  const game = table.game;
  const [p] = [game.join("Sam", "player")];
  game.handle(p!.id, { type: "claimCharacter", characterId: game.state.sheets[0]!.id });
  game.handle(p!.id, { type: "startGame" });
  game.handle(p!.id, { type: "advance" });
  return { hub, table, game, p: p! };
}

describe("story flags and the countdown", () => {
  it("starts the mission's countdown, sets flags from narration and choices, and hides options the story hasn't earned", () => {
    const { game, p } = play();
    const s = game.state;
    expect(s.story).toMatchObject({ flags: { boarded: true }, clock: { id: "awakening", value: 1, max: 4 } });
    expect(s.pendingChoice!.options.map((o) => o.id)).toEqual(["scuttle", "run"]);
    game.handle(p.id, { type: "vote", optionId: "run" });
    expect(s.story!.clock!.value).toBe(3);
    expect(s.log.some((l) => l.type === "system" && l.text === "Dreadnought awakening: 3 of 4.")).toBe(true);
    expect(s.phase).toBe("ended");
    expect(s.campaign!.story).toEqual(s.story);
  });

  it("carries the story into the next mission, where a branch remembers the choice", () => {
    for (const [option, expected] of [
      ["scuttle", "Only wreckage where she died."],
      ["run", "Your old destroyer, flying Vaygr colours."],
    ] as const) {
      const { hub, table, game, p } = play();
      game.handle(p.id, { type: "vote", optionId: option });
      const next = hub.continueCampaign(table.code).game;
      expect(next.state.missionId).toBe(second.id);
      expect(next.state.story).toBeUndefined();
      next.join("Sam", "player", p.id);
      next.handle(p.id, { type: "startGame" });
      const lines = next.state.log.filter((l) => l.type === "narration").map((l) => ("text" in l ? l.text : ""));
      expect(lines).toContain(expected);
      // The same countdown carries on rather than starting again.
      expect(next.state.story!.clock!.value).toBe(option === "run" ? 3 : 1);
    }
  });

  it("checks conditions and countdown bounds", () => {
    const story = { flags: { a: true, b: "x" }, clock: { ...clock, value: 2 } };
    expect(meets({ flag: "a" }, story)).toBe(true);
    expect(meets({ flag: "b", equals: "y" }, story)).toBe(false);
    expect(meets({ notFlag: "c" }, story)).toBe(true);
    expect(meets({ clockAtLeast: 3 }, story)).toBe(false);
    expect(meets({ flag: "a" }, undefined)).toBe(false);
  });

  it("validates story nodes", () => {
    expect(validateMission(first)).toEqual([]);
    expect(validateMission(second)).toEqual([]);
    const gated = structuredClone(first);
    (gated.nodes.abandon as Extract<Mission["nodes"][string], { type: "choice" }>).options.forEach((o) => (o.requires = { flag: "x" }));
    expect(validateMission(gated)).toContain("abandon has no option without a requirement");
    const noClock = structuredClone(first);
    delete noClock.clock;
    expect(validateMission(noClock)).toContain("boarded moves a countdown, but the mission has no clock");
  });
});
