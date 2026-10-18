import type { Rng } from "./rng.js";

export type ChallengeFace = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Challenge Die faces as printed on the Homeworld set: single reticle (1),
 * double reticle (2), two blanks (0), and two Kushan symbols (1 + Effect).
 */
export type ChallengeSymbol = "reticle" | "double-reticle" | "blank" | "kushan";

export interface ChallengeDie {
  face: ChallengeFace;
  symbol: ChallengeSymbol;
  value: 0 | 1 | 2;
  effect: boolean;
}

export interface ChallengeRoll {
  dice: ChallengeDie[];
  total: number;
  effects: number;
}

export function challengeDie(face: ChallengeFace): ChallengeDie {
  switch (face) {
    case 1:
      return { face, symbol: "reticle", value: 1, effect: false };
    case 2:
      return { face, symbol: "double-reticle", value: 2, effect: false };
    case 3:
    case 4:
      return { face, symbol: "blank", value: 0, effect: false };
    case 5:
    case 6:
      return { face, symbol: "kushan", value: 1, effect: true };
  }
}

export function summariseChallenge(faces: readonly ChallengeFace[]): ChallengeRoll {
  const dice = faces.map(challengeDie);
  return {
    dice,
    total: dice.reduce((sum, d) => sum + d.value, 0),
    effects: dice.filter((d) => d.effect).length,
  };
}

export function rollChallengeDice(count: number, rng: Rng): ChallengeRoll {
  if (!Number.isInteger(count) || count < 0) throw new Error(`invalid Challenge Dice count: ${count}`);
  const faces: ChallengeFace[] = [];
  for (let i = 0; i < count; i++) faces.push(rng.die(6) as ChallengeFace);
  return summariseChallenge(faces);
}
