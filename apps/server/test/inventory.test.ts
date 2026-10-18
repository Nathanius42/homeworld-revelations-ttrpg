import { describe, expect, it } from "vitest";
import { scriptedRng } from "@hwr/rules-engine";
import { DEFAULT_MISSION_ID } from "@hwr/content";
import { Game, newTableState } from "../src/engine.js";
import { capacity, guessSize, itemFromEquipment, load } from "../src/inventory.js";

/** Teyra (Reason 12 + Exploration 5 = TN 17) at the table, mission started, with scripted dice. */
function withTeyra(faces: number[]) {
  const game = new Game(newTableState({ id: "t", code: "ABCD", name: "T", missionId: DEFAULT_MISSION_ID, aiAvailable: false }), scriptedRng(faces));
  const p = game.join("Nat", "player");
  game.handle(p.id, { type: "claimCharacter", characterId: "teyra-sjet" });
  game.handle(p.id, { type: "startGame" });
  const test = () => game.callSideTest({ characterId: "teyra-sjet", attribute: "reason", skill: "exploration", difficulty: 2, reason: "Read the glyphs" });
  const roll = (itemId?: string) => game.handle(p.id, { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: false, fortuneCritical: false, ...(itemId ? { itemId } : {}) });
  const accept = () => game.handle(p.id, { type: "acceptRoll" });
  const toolkit = () => game.inventoryOf("teyra-sjet").find((i) => i.name === "Researcher's toolkit")!;
  return { game, test, roll, accept, toolkit };
}

describe("inventory", () => {
  it("starts from the sheet's equipment, with charges and sizes", () => {
    const { toolkit, game } = withTeyra([]);
    expect(toolkit()).toMatchObject({ uses: 3, size: "medium", status: "ok", origin: "Starting kit" });
    expect(itemFromEquipment("Goggles").size).toBe("small");
    expect(guessSize("Crate of plasma rifles")).toBe("large");
    // Teyra: Brawn 7, so she can carry 13; her starting kit fits.
    const { load: now, capacity: max } = game.loadOf("teyra-sjet");
    expect(max).toBe(capacity(7));
    expect(now).toBeLessThanOrEqual(max);
  });

  it("makes a test one step easier, spends a charge, and helps once per scene", () => {
    // 3 is a success, 15 isn't: one success, which passes only at the eased difficulty of 1.
    const { game, test, roll, accept, toolkit } = withTeyra([3, 15, 4, 16]);
    test();
    roll(toolkit().id);
    const rolled = game.state.pendingRoll!.rolled!;
    expect(rolled.result.difficulty).toBe(1);
    expect(rolled.result.passed).toBe(true);
    expect(rolled.item?.name).toBe("Researcher's toolkit");
    expect(toolkit().uses).toBe(2);
    accept();
    test();
    expect(() => roll(toolkit().id)).toThrow(/already helped in this scene/);
  });

  it("is damaged by a complication and broken by a second", () => {
    const { game, test, roll, accept, toolkit } = withTeyra([3, 20, 3, 20]);
    test();
    roll(toolkit().id);
    accept();
    expect(toolkit().status).toBe("damaged");
    toolkit().usedInScene = undefined; // a new scene
    test();
    roll(toolkit().id);
    accept();
    expect(toolkit().status).toBe("broken");
    expect(game.state.log.some((l) => l.type === "system" && l.text.includes("breaks"))).toBe(true);
    test();
    expect(() => roll(toolkit().id)).toThrow(/broken/);
  });

  it("refuses hammerspace: nothing beyond what a character can carry", () => {
    const { game } = withTeyra([]);
    // Starting kit 7 of 13; swords and a rifle make 11, so a large crate (4) won't fit.
    game.giveItem("teyra-sjet", "Pair of ceremonial swords", "Taken from the derelict's armoury", undefined, "medium");
    game.giveItem("teyra-sjet", "Pirate's rifle", "Dropped by a raider", undefined, "medium");
    expect(game.loadOf("teyra-sjet").load).toBe(11);
    expect(() => game.giveItem("teyra-sjet", "Crate of plasma rifles", "Raider stash", undefined, "large")).toThrow(/won't fit.*carrying/);
    // Stowing something frees room; taking it back needs room again.
    game.changeItem("teyra-sjet", "Pair of ceremonial swords", "stowed", "left in the hold");
    const before = game.loadOf("teyra-sjet").load;
    expect(before).toBe(load(game.inventoryOf("teyra-sjet")));
    game.giveItem("teyra-sjet", "Crate of plasma rifles", "Raider stash", undefined, "large");
    expect(() => game.changeItem("teyra-sjet", "Pair of ceremonial swords", "ok", "back from the hold")).toThrow(/won't fit/);
  });

  it("stows a mission find aboard when nobody has room", () => {
    const { game } = withTeyra([]);
    while (game.loadOf("teyra-sjet").capacity - game.loadOf("teyra-sjet").load >= 4) game.giveItem("teyra-sjet", "Ration crate", "Galley", undefined, "large");
    const item = game.giveItem("teyra-sjet", "Engine part", "Salvage", undefined, "large", true);
    expect(item.status).toBe("stowed");
  });
});
