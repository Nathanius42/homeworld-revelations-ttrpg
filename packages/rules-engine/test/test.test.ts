import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  evaluateAssistedTest,
  evaluateTest,
  extraDiceCost,
  poolSize,
  rerollDice,
  resolveOpposed,
  rollTest,
  scoreD20,
  scriptedRng,
  seededRng,
  type TestSpec,
} from "../src/index.js";

const spec = (overrides: Partial<TestSpec> = {}): TestSpec => ({
  attribute: 10,
  skill: 4,
  focus: false,
  difficulty: 2,
  dice: 2,
  ...overrides,
});

describe("scoring a d20", () => {
  it("counts a success at or under the target number", () => {
    expect(scoreD20(14, 14, null).successes).toBe(1);
    expect(scoreD20(15, 14, null).successes).toBe(0);
  });

  it("counts a 1 as two successes", () => {
    expect(scoreD20(1, 8, null).successes).toBe(2);
  });

  it("doubles successes at or under the skill when a focus applies", () => {
    expect(scoreD20(3, 14, 4).successes).toBe(2);
    expect(scoreD20(4, 14, 4).successes).toBe(2);
    expect(scoreD20(5, 14, 4).successes).toBe(1);
  });

  it("marks complications by range", () => {
    expect(scoreD20(20, 14, null).complication).toBe(true);
    expect(scoreD20(19, 14, null).complication).toBe(false);
    expect(scoreD20(19, 14, null, 2).complication).toBe(true);
    expect(scoreD20(16, 14, null, 5).complication).toBe(true);
    expect(scoreD20(15, 14, null, 5).complication).toBe(false);
  });
});

describe("evaluating a test", () => {
  it("matches the keypad repair example: TN 14 with a focus, rolls 8 and 3, difficulty 3", () => {
    const result = evaluateTest(spec({ attribute: 10, skill: 4, focus: true, difficulty: 3 }), [8, 3]);
    expect(result.targetNumber).toBe(14);
    expect(result.successes).toBe(3);
    expect(result.passed).toBe(true);
    expect(result.momentum).toBe(0);
  });

  it("generates Momentum from successes beyond the difficulty", () => {
    const result = evaluateTest(spec({ difficulty: 1, dice: 3 }), [1, 5, 9]);
    expect(result.successes).toBe(4);
    expect(result.momentum).toBe(3);
  });

  it("generates no Momentum on a failure", () => {
    const result = evaluateTest(spec({ difficulty: 3 }), [5, 18]);
    expect(result.passed).toBe(false);
    expect(result.momentum).toBe(0);
  });

  it("passes difficulty 0 automatically, and a measured roll still yields Momentum", () => {
    const result = evaluateTest(spec({ difficulty: 0 }), [19, 20]);
    expect(result.passed).toBe(true);
    expect(result.complications).toBe(1);
    expect(evaluateTest(spec({ difficulty: 0 }), [2, 3]).momentum).toBe(2);
  });

  it("presets Fortune critical successes as 1s", () => {
    const result = rollTest(spec({ dice: 3, presetCrits: 1 }), scriptedRng([15, 16]));
    expect(result.dice[0]).toMatchObject({ face: 1, preset: true, successes: 2 });
  });

  it("re-rolls chosen dice but keeps preset criticals", () => {
    const first = evaluateTest(spec({ dice: 3, presetCrits: 1 }), [1, 18, 19]);
    const again = rerollDice(first, [0, 1, 2], scriptedRng([2, 3]));
    expect(again.dice.map((d) => d.face)).toEqual([1, 2, 3]);
  });

  it("rejects a pool above five dice", () => {
    expect(() => evaluateTest(spec({ dice: 6 }), [1, 1, 1, 1, 1, 1])).toThrow();
  });

  it("keeps the invariants for any roll", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 12 }),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 2, maxLength: 5 }),
        (attribute, skill, focus, difficulty, faces) => {
          const result = evaluateTest(spec({ attribute, skill, focus, difficulty, dice: faces.length }), faces);
          expect(result.successes).toBeLessThanOrEqual(2 * faces.length);
          expect(result.successes).toBeGreaterThanOrEqual(0);
          expect(result.passed).toBe(difficulty === 0 || result.successes >= difficulty);
          expect(result.momentum).toBe(result.passed ? Math.max(0, result.successes - difficulty) : 0);
          expect(result.complications).toBe(faces.filter((f) => f === 20).length);
        },
      ),
    );
  });
});

describe("buying dice", () => {
  it("costs 1, then 2, then 3", () => {
    expect(extraDiceCost(0)).toBe(0);
    expect(extraDiceCost(1)).toBe(1);
    expect(extraDiceCost(2)).toBe(3);
    expect(extraDiceCost(3)).toBe(6);
  });

  it("treats talent dice as the first purchases", () => {
    expect(extraDiceCost(1, 1)).toBe(2);
    expect(extraDiceCost(2, 1)).toBe(5);
    expect(() => extraDiceCost(3, 1)).toThrow();
  });

  it("caps the pool at five", () => {
    expect(poolSize(3)).toBe(5);
    expect(poolSize(2, 1)).toBe(5);
  });
});

describe("assistance", () => {
  it("adds assistant successes when the leader succeeds (the ancient-tech example)", () => {
    const result = evaluateAssistedTest(spec({ attribute: 10, skill: 3, difficulty: 4 }), [5, 9], [
      { attribute: 9, skill: 2, focus: false, face: 6 },
      { attribute: 9, skill: 3, focus: false, face: 10 },
    ]);
    expect(result.successes).toBe(4);
    expect(result.passed).toBe(true);
  });

  it("ignores assistant successes when the leader scores none", () => {
    const result = evaluateAssistedTest(spec({ difficulty: 1 }), [18, 19], [{ attribute: 10, skill: 4, focus: false, face: 1 }]);
    expect(result.successes).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("still counts assistant complications", () => {
    const result = evaluateAssistedTest(spec({ difficulty: 1 }), [2, 3], [{ attribute: 10, skill: 4, focus: false, face: 20 }]);
    expect(result.complications).toBe(1);
  });
});

describe("opposed tests", () => {
  it("gives the win to more Momentum when both pass", () => {
    const active = evaluateTest(spec({ difficulty: 1, dice: 3 }), [2, 3, 4]);
    const reactive = evaluateTest(spec({ difficulty: 1 }), [2, 18]);
    expect(resolveOpposed(active, reactive)).toBe("active");
  });

  it("breaks a tie in favour of the active side", () => {
    const a = evaluateTest(spec({ difficulty: 1 }), [2, 3]);
    const b = evaluateTest(spec({ difficulty: 1 }), [4, 5]);
    expect(resolveOpposed(a, b)).toBe("active");
  });

  it("gives nobody the win when both fail", () => {
    const a = evaluateTest(spec({ difficulty: 1 }), [18, 19]);
    expect(resolveOpposed(a, a)).toBe("none");
  });
});

describe("dice fairness", () => {
  it("rolls every d20 face at roughly equal rates", () => {
    const rng = seededRng(42);
    const counts = new Array(21).fill(0);
    const rolls = 200_000;
    for (let i = 0; i < rolls; i++) counts[rng.die(20)]++;
    const expected = rolls / 20;
    const chiSquared = counts.slice(1).reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    // 19 degrees of freedom: p = 0.001 critical value is about 43.8.
    expect(chiSquared).toBeLessThan(43.8);
  });
});
