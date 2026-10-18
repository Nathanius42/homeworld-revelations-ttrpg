import { describe, expect, it } from "vitest";
import { KHARSAANS_PROMISE, SYSTEM_CAP, applyRefits } from "@hwr/content";
import { seededRng } from "@hwr/rules-engine";
import { firstSentences, pickScar, recap, SCARS } from "../src/campaign.js";
import { playToEnd } from "./bots.js";
import { Hub } from "../src/hub.js";
import { Store } from "../src/store.js";

function finishedTable(hub: Hub) {
  const table = hub.create("Kharsaan's Promise", "cold-harbour");
  const game = table.game;
  (game as unknown as { rng: unknown }).rng = seededRng(7);
  const ids = [game.join("Sam", "player"), game.join("Mum", "player")].map((p) => p.id);
  ids.forEach((id, i) => game.handle(id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id }));
  game.handle(ids[0]!, { type: "startGame" });
  playToEnd(game, ids);
  table.commit();
  return { table, ids };
}

describe("campaign", () => {
  it("turns a finished mission into a chapter, banks its RU and gives each crew member an advance", () => {
    const { table } = finishedTable(new Hub(new Store(":memory:")));
    const s = table.game.state;
    expect(s.phase).toBe("ended");
    const c = s.campaign!;
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0]).toMatchObject({ missionId: "cold-harbour", missionTitle: "Cold Harbour" });
    expect(c.chapters[0]!.crew).toHaveLength(2);
    expect(c.ru).toBe(s.awards!.ru);
    expect(Object.values(c.advances)).toEqual([1, 1]);
  });

  it("continues with the same crew, seats and kit, wounds healed, and points the old table at the new one", () => {
    const hub = new Hub(new Store(":memory:"));
    const { table, ids } = finishedTable(hub);
    const old = table.game.state;
    const charId = old.players.find((p) => p.id === ids[0])!.characterId!;
    old.characters[charId]!.injuries = 1;
    const next = hub.continueCampaign(old.code);
    const s = next.game.state;
    expect(old.nextTable).toBe(s.code);
    expect(hub.continueCampaign(old.code).game.state.code).toBe(s.code); // asking twice gives the same table
    expect(s.phase).toBe("lobby");
    expect(s.name).toBe(old.name);
    expect(s.missionId).not.toBe("cold-harbour"); // the next unplayed mission
    expect(s.players.map((p) => [p.id, p.characterId])).toEqual(old.players.filter((p) => p.role !== "spectator").map((p) => [p.id, p.characterId]));
    expect(s.characters[charId]).toMatchObject({ stress: 0, injuries: 0, controllerId: ids[0] });
    expect(s.characters[charId]!.inventory!.map((i) => i.name)).toEqual(
      old.characters[charId]!.inventory!.filter((i) => i.status !== "lost" && i.status !== "broken").map((i) => i.name),
    );
    expect(s.campaign!.chapters).toHaveLength(1);
  });

  it("spends advances and Requisition between missions, then opens the next mission with a recap", () => {
    const hub = new Hub(new Store(":memory:"));
    const { table, ids } = finishedTable(hub);
    const next = hub.continueCampaign(table.game.state.code).game;
    const s = next.state;
    const me = s.players.find((p) => p.id === ids[0])!;
    next.join("Sam", "player", me.id);
    const charId = me.characterId!;
    const before = s.sheets.find((x) => x.id === charId)!.skills.engineering;
    next.handle(me.id, { type: "spendAdvance", characterId: charId, skill: before < 5 ? "engineering" : undefined, focus: before < 5 ? undefined : "Salvage" });
    expect(s.campaign!.advances[charId]).toBe(0);
    expect(() => next.handle(me.id, { type: "spendAdvance", characterId: charId, focus: "Salvage" })).toThrow(/No advance/);

    s.campaign!.ru = 2;
    next.handle(me.id, { type: "requisition", characterId: charId, itemId: "medkit" });
    expect(s.characters[charId]!.inventory!.some((i) => i.name === "Field medkit" && i.uses === 3)).toBe(true);
    expect(s.campaign!.ru).toBe(0);
    expect(() => next.handle(me.id, { type: "requisition", characterId: charId, itemId: "medkit" })).toThrow(/costs 2 RU/);

    next.join("Mum", "player", ids[1]);
    next.handle(me.id, { type: "startGame" });
    const opening = s.log.find((l) => l.type === "narration");
    expect(opening && "text" in opening ? opening.text : "").toMatch(/^Previously, aboard Kharsaan's Promise: Cold Harbour\./);
  });

  it("scars whoever was taken down, and carries a wound for whoever was hurt into the next mission", () => {
    const hub = new Hub(new Store(":memory:"));
    const table = hub.create("Kharsaan's Promise", "cold-harbour");
    const game = table.game;
    const ids = [game.join("Sam", "player"), game.join("Mum", "player")].map((p) => p.id);
    ids.forEach((id, i) => game.handle(id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id }));
    game.handle(ids[0]!, { type: "startGame" });
    const [downed, hurt] = game.partyIds();
    // Enough stress to take one down, a smaller hit for the other.
    while (game.state.characters[downed!]!.injuries < 2) game.damagePc(downed!, 20, 10, false);
    while (game.state.characters[hurt!]!.injuries < 1) game.damagePc(hurt!, 4, 10, false);
    (game as unknown as { rng: unknown }).rng = seededRng(7);
    playToEnd(game, ids);
    const s = game.state;
    expect(s.phase).toBe("ended");
    expect(s.campaign!.scars![downed!]).toHaveLength(1);
    // The bots may take the other one down too: a scar exactly when downed.
    expect(Boolean(s.campaign!.scars![hurt!])).toBe(Boolean(s.characters[hurt!]!.downed));
    expect(s.campaign!.chapters[0]!.scars![0]).toMatch(new RegExp(`^${s.sheets.find((x) => x.id === downed)!.name}: `));

    const next = hub.continueCampaign(s.code).game;
    expect(next.state.characters[downed!]!.injuries).toBe(1);
    expect(next.state.characters[hurt!]!.injuries).toBe(1);
    const me = next.state.players.find((p) => p.characterId === hurt)!;
    next.state.campaign!.ru = 1;
    next.handle(me.id, { type: "treatWound", characterId: hurt! });
    expect(next.state.characters[hurt!]!.injuries).toBe(0);
    expect(next.state.campaign!.ru).toBe(0);
    expect(() => next.handle(me.id, { type: "treatWound", characterId: hurt! })).toThrow(/no wound/);

    next.handle(me.id, { type: "startGame" });
    expect(next.state.characters[downed!]!).toMatchObject({ injuries: 1, hurt: false, downed: false });
    const opening = next.state.log.find((l) => l.type === "narration");
    expect(opening && "text" in opening ? opening.text : "").toMatch(/still carr(y|ies) the marks of it\.$/);
  });

  it("never gives the same scar twice while others are left", () => {
    const has = [...SCARS.slice(0, -1)];
    expect(pickScar("teyra", 3, has)).toBe(SCARS.at(-1));
    expect(pickScar("teyra", 3)).toBe(pickScar("teyra", 3));
  });

  it("lists saved campaigns by their latest table, and reopens them", () => {
    const hub = new Hub(new Store(":memory:"));
    const store = (hub as unknown as { store: Store }).store;
    const { table } = finishedTable(hub);
    hub.create("Unrelated ship", "cold-harbour");
    const [one] = store.campaigns();
    expect(store.campaigns()).toHaveLength(1);
    expect(one).toMatchObject({ name: "Kharsaan's Promise", chapters: 1, lastMission: "Cold Harbour", code: table.code, phase: "ended" });

    // A finished chapter reopens as the next one; reopening again resumes that table.
    const next = hub.reopenCampaign(one!.id);
    expect(next.code).not.toBe(table.code);
    expect(store.campaigns()[0]).toMatchObject({ code: next.code, phase: "lobby" });
    expect(hub.reopenCampaign(one!.id).code).toBe(next.code);
    expect(() => hub.reopenCampaign("nope")).toThrow(/No saved campaign/);
  });

  it("refits the crew's ship with banked RU, once each, and fits the refits when a ship battle starts", () => {
    const hub = new Hub(new Store(":memory:"));
    const { table, ids } = finishedTable(hub);
    const next = hub.continueCampaign(table.game.state.code).game;
    const s = next.state;
    const me = s.players.find((p) => p.id === ids[0])!;
    next.join("Sam", "player", me.id);
    s.campaign!.ru = 9;
    next.handle(me.id, { type: "refit", refitId: "armour" });
    next.handle(me.id, { type: "refit", refitId: "main-guns" });
    expect(s.campaign!.refits).toEqual(["armour", "main-guns"]);
    expect(s.campaign!.ru).toBe(0);
    expect(() => next.handle(me.id, { type: "refit", refitId: "armour" })).toThrow(/already has/);
    expect(() => next.handle(me.id, { type: "refit", refitId: "bulkheads" })).toThrow(/costs 3 RU/);

    // Play Cold Harbour with these refits until its ship battle starts.
    const battle = hub.create("Kharsaan's Promise", "cold-harbour").game;
    (battle as unknown as { rng: unknown }).rng = seededRng(7);
    const pid = battle.join("Sam", "player").id;
    battle.handle(pid, { type: "claimCharacter", characterId: battle.state.sheets[0]!.id });
    battle.state.campaign = { id: "c", name: "Ship", chapters: [], ru: 0, advances: {}, refits: ["armour", "main-guns", "nonsense"] };
    battle.handle(pid, { type: "startGame" });
    playToEnd(battle, [pid], () => battle.state.scene.mode === "space");
    const ship = battle.state.space!.ship;
    expect(ship.armour).toBe(KHARSAANS_PROMISE.armour + 1);
    expect(ship.weapons.map((w) => w.cd)).toEqual(KHARSAANS_PROMISE.weapons.map((w) => w.cd + 1));
  });

  it("caps refitted systems and ignores refits it doesn't know", () => {
    const ship = { armour: 1, maxHull: 10, systems: { communications: 12, computers: 9, engines: 11, sensors: 9, structure: 9, weapons: 10 }, weapons: [] };
    const out = applyRefits(ship, ["comms", "engines", "bulkheads", "gone"]);
    expect(out).toMatchObject({ maxHull: 12, systems: { communications: SYSTEM_CAP, engines: 12 } });
    expect(ship.maxHull).toBe(10); // the mission's ship is never changed
  });

  it("keeps the recap short", () => {
    expect(firstSentences("One. Two! Three? Four.")).toBe("One. Two!");
    expect(recap({ id: "c", name: "Ship", chapters: [], ru: 0, advances: {} })).toBeUndefined();
  });
});
