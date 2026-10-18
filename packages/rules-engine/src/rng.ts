/** A source of fair die rolls. `die(sides)` returns an integer in [1, sides]. */
export interface Rng {
  die(sides: number): number;
}

interface CryptoLike {
  getRandomValues(array: Uint32Array): Uint32Array;
}

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Cryptographically secure dice. Rejection sampling removes the modulo bias
 * that a plain `% sides` would introduce.
 */
export function cryptoRng(): Rng {
  const crypto = (globalThis as unknown as { crypto?: CryptoLike }).crypto;
  if (!crypto) throw new Error("Web Crypto is not available in this runtime");
  const buffer = new Uint32Array(1);
  return {
    die(sides) {
      assertSides(sides);
      const limit = UINT32_RANGE - (UINT32_RANGE % sides);
      for (;;) {
        crypto.getRandomValues(buffer);
        const value = buffer[0]!;
        if (value < limit) return (value % sides) + 1;
      }
    },
  };
}

/** Deterministic dice for tests and replays (mulberry32). */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    die(sides) {
      assertSides(sides);
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const unit = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
      return Math.floor(unit * sides) + 1;
    },
  };
}

/** Returns the given faces in order; throws when they run out. */
export function scriptedRng(faces: readonly number[]): Rng {
  let index = 0;
  return {
    die(sides) {
      assertSides(sides);
      const face = faces[index++];
      if (face === undefined) throw new Error("scriptedRng ran out of faces");
      if (face < 1 || face > sides) throw new Error(`face ${face} is not valid for a d${sides}`);
      return face;
    },
  };
}

function assertSides(sides: number): void {
  if (!Number.isInteger(sides) || sides < 2) throw new Error(`invalid die size: ${sides}`);
}
