import type { CharacterSheet, PlayerInfo, TableState } from "@hwr/protocol";
import { conditionOf } from "@hwr/rules-engine";

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function bg(url: string | undefined): React.CSSProperties {
  return url ? { backgroundImage: `url("${url}")` } : {};
}

/**
 * Chance of scoring at least `difficulty` successes: each d20 at or under the target
 * number scores 1, and a 1 or a roll at or under the focus threshold scores 2.
 */
export function chanceToPass(dice: number, tn: number, focusThreshold: number | null, difficulty: number, presetCrits = 0): number {
  if (difficulty <= 0) return 1;
  const two = Math.min(20, Math.max(1, focusThreshold ?? 1)) / 20;
  const one = Math.max(0, Math.min(20, tn) - Math.max(1, focusThreshold ?? 1)) / 20;
  const zero = 1 - two - one;
  let dist = [1];
  for (let i = 0; i < dice; i++) {
    const next = new Array<number>(dist.length + 2).fill(0);
    dist.forEach((p, s) => {
      if (i < presetCrits) {
        next[s + 2]! += p;
        return;
      }
      next[s]! += p * zero;
      next[s + 1]! += p * one;
      next[s + 2]! += p * two;
    });
    dist = next;
  }
  return dist.reduce((sum, p, s) => (s >= difficulty ? sum + p : sum), 0);
}

export function partyOf(state: TableState): CharacterSheet[] {
  return state.sheets.filter((s) => state.characters[s.id]?.controllerId);
}

export function controllerOf(state: TableState, characterId: string): PlayerInfo | undefined {
  const id = state.characters[characterId]?.controllerId;
  return state.players.find((p) => p.id === id);
}

export function isStanding(state: TableState, characterId: string): boolean {
  return conditionOf(state.characters[characterId]?.injuries ?? 0) === "active";
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
