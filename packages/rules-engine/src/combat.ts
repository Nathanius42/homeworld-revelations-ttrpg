import { rollChallengeDice, type ChallengeRoll } from "./dice.js";
import type { Rng } from "./rng.js";

export interface WeaponProfile {
  name: string;
  stressRating: number;
  vicious?: number;
  piercing?: number;
}

export interface Vitals {
  stress: number;
  maxStress: number;
  injuries: number;
  armour: number;
}

export type Condition = "active" | "incapacitated" | "critical" | "dead";

export interface StressOutcome {
  vitals: Vitals;
  /** Stress that got through armour. */
  inflicted: number;
  injuriesGained: number;
  condition: Condition;
}

/**
 * Applies stress after armour. An attack causes one injury for each of:
 * 5+ stress in one hit, reaching maximum stress, or taking stress while at maximum.
 */
export function applyStress(vitals: Vitals, rawStress: number, piercing = 0): StressOutcome {
  const armour = Math.max(0, vitals.armour - piercing);
  const inflicted = Math.max(0, rawStress - armour);
  let injuriesGained = 0;
  if (inflicted >= 5) injuriesGained++;
  if (inflicted > 0 && vitals.stress < vitals.maxStress && vitals.stress + inflicted >= vitals.maxStress) injuriesGained++;
  if (inflicted > 0 && vitals.stress >= vitals.maxStress) injuriesGained++;
  const next: Vitals = {
    ...vitals,
    stress: Math.min(vitals.maxStress, vitals.stress + inflicted),
    injuries: vitals.injuries + injuriesGained,
  };
  const wasCritical = vitals.injuries >= 3;
  return {
    vitals: next,
    inflicted,
    injuriesGained,
    condition: wasCritical && inflicted > 0 ? "dead" : conditionOf(next.injuries),
  };
}

export function conditionOf(injuries: number): Condition {
  if (injuries >= 3) return "critical";
  if (injuries >= 2) return "incapacitated";
  return "active";
}

export interface AttackStress {
  roll: ChallengeRoll;
  /** Total stress before armour, including Vicious and Momentum spent. */
  stress: number;
  piercing: number;
}

/** Challenge Dice = weapon stress rating + attacker's Combat skill. */
export function rollAttackStress(
  weapon: WeaponProfile,
  combatSkill: number,
  rng: Rng,
  extraStressFromMomentum = 0,
): AttackStress {
  const roll = rollChallengeDice(weapon.stressRating + combatSkill, rng);
  const vicious = (weapon.vicious ?? 0) * roll.effects;
  return {
    roll,
    stress: roll.total + vicious + Math.min(3, Math.max(0, extraStressFromMomentum)),
    piercing: weapon.piercing ?? 0,
  };
}

/** Ranged attacks are Coordination + Combat at D2, +1 per range band outside the weapon's range. */
export function rangedDifficulty(bandsOutOfRange: number): number {
  return 2 + Math.max(0, bandsOutOfRange);
}

/** Stress clears at the start of a new scene; injuries stay until treated. */
export function recoverBetweenScenes(vitals: Vitals): Vitals {
  return { ...vitals, stress: 0 };
}
