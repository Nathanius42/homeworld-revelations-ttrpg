import type { ClientMessage, TableState } from "@hwr/protocol";
import type { Game } from "../src/engine.js";

/**
 * A bot's bridge station in a ship battle: the first to act takes back a locked station, missiles
 * closest to striking are shot down first (or, with `shield`, Helm puts the ship in their way),
 * and otherwise everyone fires on the first enemy that matters.
 */
export function stationMove(s: TableState, characterId: string, opts: { shield?: boolean; breakawayFrom?: number } = {}): Extract<ClientMessage, { type: "stationAction" }> {
  const sp = s.space!;
  const can = (a: string) => !sp.locked?.includes(a as never);
  if (sp.locked?.length && sp.acted.length === 0) return { type: "stationAction", action: "override", characterId, station: sp.locked[0]! };
  const missiles = sp.enemies.filter((e) => !e.destroyed && e.impact).sort((a, b) => (a.impactRound ?? 0) - (b.impactRound ?? 0));
  const urgent = missiles[0];
  if (urgent) {
    if (opts.shield && can("intercept") && (urgent.impactRound ?? 0) <= sp.round) return { type: "stationAction", action: "intercept", characterId, targetId: urgent.id };
    if (can("fire")) return { type: "stationAction", action: "fire", characterId, targetId: urgent.id };
    if (can("intercept")) return { type: "stationAction", action: "intercept", characterId, targetId: urgent.id };
  }
  if (opts.breakawayFrom !== undefined && sp.round >= opts.breakawayFrom && can("breakaway")) return { type: "stationAction", action: "breakaway", characterId };
  const target = sp.enemies.find((e) => !e.destroyed && !e.optional) ?? sp.enemies.find((e) => !e.destroyed)!;
  if (can("fire")) return { type: "stationAction", action: "fire", characterId, targetId: target.id };
  if (sp.locked?.length) return { type: "stationAction", action: "override", characterId, station: sp.locked[0]! };
  return { type: "stationAction", action: "rally", characterId };
}

/** Plays a table's mission to the end (or until `stop`) with simple bots, as the balance simulator does. */
export function playToEnd(game: Game, ids: string[], stop: () => boolean = () => false): void {
  const s = game.state;
  const ctl = (c: string) => s.characters[c]!.controllerId!;
  const standing = (id: string) => s.characters[id]!.injuries < 2;
  for (let n = 0; s.phase === "playing" && !stop() && n < 800; n++) {
    if (s.awaitingContinue) game.handle(ids[0]!, { type: "advance" });
    else if (s.pendingChoice) for (const id of ids) game.handle(id, { type: "vote", optionId: s.pendingChoice!.options[0]!.id });
    else if (s.pendingRoll?.rolled) game.handle(ctl(s.pendingRoll.rolled.characterId), { type: "acceptRoll", bonus: 3 });
    else if (s.pendingRoll) {
      const party = game.partyIds().filter(standing);
      game.handle(ctl(s.pendingRoll.characterId ?? party[n % party.length]!), { type: "roll", boughtDice: 0, payWithThreat: false, useFocus: true, fortuneCritical: false });
    } else if (s.scene.mode === "space" && s.space) {
      const c = game.partyIds().find((id) => standing(id) && !s.space!.acted.includes(id))!;
      try {
        game.handle(ctl(c), stationMove(s, c, { breakawayFrom: 3 }));
      } catch {
        game.handle(ctl(c), { type: "stationAction", action: "rally", characterId: c });
      }
    } else {
      const c = game.partyIds().find((id) => standing(id) && !s.scene.acted.includes(id))!;
      const t = s.scene.npcs.find((x) => x.hostile && !x.defeated && !x.surrendered)!;
      game.handle(ctl(c), { type: "combatAction", action: "attack", characterId: c, targetNpcId: t.id });
    }
  }
}
