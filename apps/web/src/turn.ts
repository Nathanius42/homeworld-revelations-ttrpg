import type { TableState } from "@hwr/protocol";
import { controllerOf, isStanding, partyOf } from "./util";

/** What the game is waiting for, worked out the same way on the TV and every phone. */
export interface Waiting {
  /** Short line for the banner, such as "Vote: waiting for Sam and Mum". */
  text: string;
  /** True when the player looking at this screen is one of those needed (not for "anyone" moments). */
  mine: boolean;
  /** Characters still to act (highlighted on the crew cards). */
  characterIds: string[];
}

/** "Jaal (Sam)": the character, and who plays them when that's someone else's name. */
function who(state: TableState, characterId: string): string {
  const sheet = state.sheets.find((s) => s.id === characterId);
  const first = sheet?.name.split(" ")[0] ?? "Someone";
  const player = controllerOf(state, characterId);
  return player && player.name !== first ? `${first} (${player.name})` : first;
}

/**
 * Who should take an open test: the standing crew member with the best target number for its
 * first approach, and among equals whoever has rolled least, so everyone gets a turn.
 */
export function suggestedTaker(state: TableState): string | undefined {
  const roll = state.pendingRoll;
  if (!roll || roll.characterId || roll.rolled) return undefined;
  const approach = roll.approaches?.[0] ?? { attribute: roll.attribute, skill: roll.skill };
  const rolled = (name: string) => state.log.filter((l) => l.type === "roll" && l.roll.characterName === name).length;
  const candidates = partyOf(state).filter((s) => isStanding(state, s.id));
  candidates.sort((a, b) => {
    const tn = (s: (typeof candidates)[number]) => s.attributes[approach.attribute] + s.skills[approach.skill];
    return tn(b) - tn(a) || rolled(a.name) - rolled(b.name);
  });
  return candidates[0]?.id;
}

function list(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The game's current call to action. Tests and Next are open to anyone at the table, votes need
 * every seated player, and fights need each standing crew member once a round.
 */
export function waitingOn(state: TableState, myPlayerId?: string): Waiting | undefined {
  if (state.phase !== "playing") return undefined;
  const me = state.players.find((p) => p.id === myPlayerId);
  const myCharacter = me?.characterId;
  const none = { characterIds: [] as string[] };

  if (state.gmThinking) return { text: "The GM is working out what happens…", mine: false, ...none };

  const roll = state.pendingRoll;
  if (roll?.rolled) {
    const c = roll.rolled.characterId;
    return { text: `${who(state, c)}: the dice are in. Accept the roll, or spend Fortune to re-roll`, mine: c === myCharacter, characterIds: [c] };
  }
  if (roll?.characterId) {
    const c = roll.characterId;
    return { text: `${who(state, c)}: roll to ${roll.reason.charAt(0).toLowerCase()}${roll.reason.slice(1)}`, mine: c === myCharacter, characterIds: [c] };
  }
  if (roll) {
    const what = `${roll.reason.charAt(0).toLowerCase()}${roll.reason.slice(1)}`;
    const best = suggestedTaker(state);
    if (!best) return { text: `Anyone: take the test to ${what}. Others can assist`, mine: false, ...none };
    return { text: `${who(state, best)} is best placed, or anyone: take the test to ${what}. Others can assist`, mine: best === myCharacter, characterIds: [best] };
  }

  const choice = state.pendingChoice;
  if (choice) {
    const missing = state.players.filter((p) => p.connected && p.characterId && !choice.votes[p.id]);
    if (missing.length) {
      const names = missing.map((p) => who(state, p.characterId!));
      return { text: `Vote: waiting for ${list(names)}`, mine: missing.some((p) => p.id === myPlayerId), characterIds: missing.map((p) => p.characterId!) };
    }
  }

  const acted = state.scene.mode === "space" ? state.space?.acted : state.scene.mode === "action" ? state.scene.acted : undefined;
  if (acted) {
    const toAct = partyOf(state)
      .map((s) => s.id)
      .filter((id) => isStanding(state, id) && !acted.includes(id));
    const round = state.scene.mode === "space" ? state.space?.round : state.scene.round;
    if (toAct.length) {
      return { text: `Round ${round}: ${list(toAct.map((id) => who(state, id)))} still to act, in any order`, mine: Boolean(myCharacter && toAct.includes(myCharacter)), characterIds: toAct };
    }
  }

  if (state.awaitingContinue) return { text: "Anyone: press Next ▸ to carry on", mine: false, ...none };
  return undefined;
}
