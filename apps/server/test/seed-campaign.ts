/**
 * Seeds a save file with a finished campaign chapter for the browser tests: Cold Harbour played
 * by two bots, one crew member taken down (so scarred and wounded), a countdown running and RU in
 * the bank. Prints what the test needs as JSON.
 *
 *   tsx test/seed-campaign.ts <path to hwr.sqlite>
 */
import { seededRng } from "@hwr/rules-engine";
import { Hub } from "../src/hub.js";
import { Store } from "../src/store.js";
import { playToEnd } from "./bots.js";

const file = process.argv[2];
if (!file) throw new Error("usage: tsx test/seed-campaign.ts <hwr.sqlite>");

const store = new Store(file);
const table = new Hub(store).create("Seeded Promise", "cold-harbour");
const game = table.game;
(game as unknown as { rng: unknown }).rng = seededRng(7);
const ids = [game.join("Sam", "player"), game.join("Mum", "player")].map((p) => p.id);
ids.forEach((id, i) => game.handle(id, { type: "claimCharacter", characterId: game.state.sheets[i]!.id }));
game.handle(ids[0]!, { type: "startGame" });
const downed = game.partyIds()[0]!;
while (game.state.characters[downed]!.injuries < 2) game.damagePc(downed, 20, 10, false);
playToEnd(game, ids);

const s = game.state;
if (s.phase !== "ended") throw new Error(`the seeded mission didn't finish (node ${s.nodeId})`);
const campaign = s.campaign!;
campaign.ru = 10;
campaign.story = { flags: { seeded: true }, clock: { id: "awakening", label: "Dreadnought awakening", value: 3, max: 8 } };
table.commit();
store.close();

const sheet = s.sheets.find((x) => x.id === downed)!;
console.log(
  JSON.stringify({
    campaignName: s.name,
    playerId: s.characters[downed]!.controllerId,
    characterName: sheet.name,
    scar: campaign.scars![downed]![0],
  }),
);
