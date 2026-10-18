export type TruthKind = "advantage" | "complication" | "threat";
export type TruthScope = "situation" | "location" | "character";

export interface Truth {
  id: string;
  label: string;
  kind: TruthKind;
  /** "Hazardous Atmosphere 2" counts as two identical truths. */
  strength: number;
  scope: TruthScope;
  /** Hidden truths are known to the GM until revealed. */
  hidden?: boolean;
}

/** Applies relevant truths to a base difficulty. Advantages lower it, complications raise it. */
export function adjustDifficulty(base: number, relevant: readonly Truth[]): number {
  let difficulty = base;
  for (const truth of relevant) {
    if (truth.kind === "advantage") difficulty -= truth.strength;
    if (truth.kind === "complication") difficulty += truth.strength;
  }
  return Math.max(0, difficulty);
}

/** Threat added when a threatening circumstance enters play. */
export function threatFromTruths(truths: readonly Truth[]): number {
  return truths.filter((t) => t.kind === "threat").reduce((sum, t) => sum + t.strength, 0);
}
