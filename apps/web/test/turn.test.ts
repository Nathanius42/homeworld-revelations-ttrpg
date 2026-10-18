import { describe, expect, it } from "vitest";
import type { CharacterSheet, TableState } from "@hwr/protocol";
import { suggestedTaker, waitingOn } from "../src/turn";

function sheet(id: string, name: string, reason: number, engineering: number): CharacterSheet {
  return {
    id,
    name,
    kiith: "Kiith Paktu",
    crewRole: "Engineer",
    rank: "Lieutenant",
    portrait: "",
    tagline: "",
    attributes: { agility: 8, brawn: 8, coordination: 8, insight: 8, reason, will: 8 },
    skills: { combat: 1, command: 1, engineering, exploration: 1, flight: 1, medical: 1 },
    focuses: [],
    talents: [],
    truths: [],
    aspects: [],
    weapons: [],
    armour: 0,
    maxStress: 10,
    equipment: [],
  };
}

/** Three crew, each played by someone: Jaal (Sam), Teyra (Mum), Druun (Kit). */
function table(): TableState {
  const sheets = [sheet("jaal", "Jaal Manaan", 9, 2), sheet("teyra", "Teyra S'jet", 10, 3), sheet("druun", "Druun Somtaaw", 10, 3)];
  const players = [
    { id: "p1", name: "Sam", role: "player" as const, characterId: "jaal", connected: true },
    { id: "p2", name: "Mum", role: "player" as const, characterId: "teyra", connected: true },
    { id: "p3", name: "Kit", role: "player" as const, characterId: "druun", connected: true },
  ];
  return {
    phase: "playing",
    sheets,
    players,
    characters: Object.fromEntries(players.map((p) => [p.characterId, { sheetId: p.characterId, stress: 0, injuries: 0, fortune: 1, controllerId: p.id }])),
    scene: { mode: "scene", acted: [], npcs: [], round: 0 },
    log: [],
    gmThinking: false,
    awaitingContinue: false,
  } as unknown as TableState;
}

const openTest = { id: "r1", kind: "test", origin: "mission", attribute: "reason", skill: "engineering", difficulty: 2, reason: "Rebuild the scrubber feed" } as TableState["pendingRoll"];

describe("waitingOn", () => {
  it("names the best-placed crew member for an open test, and tells their phone it's their move", () => {
    const s = { ...table(), pendingRoll: openTest };
    const forMum = waitingOn(s, "p2")!;
    expect(forMum.text).toBe("Teyra (Mum) is best placed, or anyone: take the test to rebuild the scrubber feed. Others can assist");
    expect(forMum.mine).toBe(true);
    expect(forMum.characterIds).toEqual(["teyra"]);
    expect(waitingOn(s, "p1")!.mine).toBe(false);
  });

  it("among equals, suggests whoever has rolled least", () => {
    const s = { ...table(), pendingRoll: openTest, log: [{ id: "l1", at: 0, type: "roll", roll: { characterName: "Teyra S'jet" } }] } as unknown as TableState;
    expect(suggestedTaker(s)).toBe("druun");
  });

  it("skips crew who are down", () => {
    const s = { ...table(), pendingRoll: openTest };
    s.characters.teyra!.injuries = 2;
    s.characters.druun!.injuries = 2;
    expect(suggestedTaker(s)).toBe("jaal");
  });

  it("lists who still has to vote", () => {
    const s = { ...table(), pendingChoice: { id: "c", prompt: "?", options: [{ id: "a", label: "A" }], votes: { p1: "a" } } } as unknown as TableState;
    const w = waitingOn(s, "p3")!;
    expect(w.text).toBe("Vote: waiting for Teyra (Mum) and Druun (Kit)");
    expect(w.mine).toBe(true);
  });

  it("says who is left to act in a fight round", () => {
    const s = table();
    s.scene = { ...s.scene, mode: "action", round: 2, acted: ["jaal"] };
    expect(waitingOn(s)!.text).toBe("Round 2: Teyra (Mum) and Druun (Kit) still to act, in any order");
  });

  it("leaves Next to anyone, and says nothing before play starts", () => {
    expect(waitingOn({ ...table(), awaitingContinue: true }, "p1")).toMatchObject({ text: "Anyone: press Next ▸ to carry on", mine: false });
    expect(waitingOn({ ...table(), phase: "lobby" }, "p1")).toBeUndefined();
  });
});
