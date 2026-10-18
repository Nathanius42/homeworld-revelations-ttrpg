import { describe, expect, it } from "vitest";
import {
  adjustDifficulty,
  applyStress,
  applyWork,
  bankMomentum,
  challengeDie,
  createExtendedTest,
  cryptoRng,
  endScene,
  extraDiceCost,
  gainFortune,
  maxStress,
  payCost,
  rollAttackStress,
  rollChallengeDice,
  scriptedRng,
  sessionStartPools,
  spendThreat,
  summariseChallenge,
  validateFinishedCharacter,
} from "../src/index.js";

describe("Challenge Dice", () => {
  it("maps the faces of the Homeworld set", () => {
    expect(challengeDie(1)).toMatchObject({ symbol: "reticle", value: 1, effect: false });
    expect(challengeDie(2)).toMatchObject({ symbol: "double-reticle", value: 2, effect: false });
    expect(challengeDie(3)).toMatchObject({ symbol: "blank", value: 0 });
    expect(challengeDie(4)).toMatchObject({ symbol: "blank", value: 0 });
    expect(challengeDie(5)).toMatchObject({ symbol: "kushan", value: 1, effect: true });
    expect(challengeDie(6)).toMatchObject({ symbol: "kushan", value: 1, effect: true });
  });

  it("totals a roll and counts Effects", () => {
    expect(summariseChallenge([1, 2, 3, 5, 6])).toMatchObject({ total: 5, effects: 2 });
  });

  it("rolls with the secure generator", () => {
    const roll = rollChallengeDice(50, cryptoRng());
    expect(roll.dice).toHaveLength(50);
    expect(roll.dice.every((d) => d.face >= 1 && d.face <= 6)).toBe(true);
  });
});

describe("pools", () => {
  it("starts each session with 2 Threat per player", () => {
    expect(sessionStartPools(6)).toEqual({ momentum: 0, threat: 12 });
  });

  it("caps banked Momentum at six", () => {
    const { pools, banked, lost } = bankMomentum({ momentum: 5, threat: 0 }, 3);
    expect(pools.momentum).toBe(6);
    expect(banked).toBe(1);
    expect(lost).toBe(2);
  });

  it("pays from Momentum and adds Threat for the shortfall", () => {
    const { pools, payment } = payCost({ momentum: 1, threat: 4 }, extraDiceCost(2));
    expect(payment).toEqual({ momentum: 1, threat: 2 });
    expect(pools).toEqual({ momentum: 0, threat: 6 });
  });

  it("can pay entirely in Threat", () => {
    expect(payCost({ momentum: 6, threat: 0 }, 2, true).pools).toEqual({ momentum: 6, threat: 2 });
  });

  it("refuses to overspend Threat", () => {
    expect(() => spendThreat({ momentum: 0, threat: 1 }, 2)).toThrow();
  });

  it("loses one Momentum at scene end", () => {
    expect(endScene({ momentum: 3, threat: 2 }).momentum).toBe(2);
    expect(endScene({ momentum: 0, threat: 2 }).momentum).toBe(0);
  });

  it("caps Fortune at three", () => {
    expect(gainFortune(3)).toBe(3);
  });
});

describe("truths", () => {
  it("lowers difficulty for advantages and raises it for complications", () => {
    const d = adjustDifficulty(1, [
      { id: "dark", label: "Darkness", kind: "complication", strength: 1, scope: "location" },
      { id: "light", label: "Wrist light", kind: "advantage", strength: 1, scope: "situation" },
      { id: "gas", label: "Hazardous Atmosphere", kind: "complication", strength: 2, scope: "location" },
    ]);
    expect(d).toBe(3);
  });
});

describe("stress and injuries", () => {
  const unarmoured = { stress: 0, maxStress: 10, injuries: 0, armour: 0 };

  it("injures on 5 stress in one hit (the blade example)", () => {
    const outcome = applyStress(unarmoured, 5);
    expect(outcome.injuriesGained).toBe(1);
    expect(outcome.vitals.stress).toBe(5);
  });

  it("subtracts armour, reduced by piercing", () => {
    expect(applyStress({ ...unarmoured, armour: 2 }, 4).inflicted).toBe(2);
    expect(applyStress({ ...unarmoured, armour: 2 }, 4, 1).inflicted).toBe(3);
  });

  it("injures on reaching maximum stress", () => {
    expect(applyStress({ ...unarmoured, stress: 8 }, 2).injuriesGained).toBe(1);
  });

  it("stacks injuries when several conditions hit at once", () => {
    expect(applyStress({ ...unarmoured, stress: 6 }, 5).injuriesGained).toBe(2);
  });

  it("injures on any stress while at maximum, and tracks conditions", () => {
    const outcome = applyStress({ ...unarmoured, stress: 10, injuries: 1 }, 1);
    expect(outcome.injuriesGained).toBe(1);
    expect(outcome.condition).toBe("incapacitated");
  });

  it("kills a critical character who takes more stress", () => {
    expect(applyStress({ ...unarmoured, injuries: 3 }, 1).condition).toBe("dead");
  });

  it("rolls weapon CD plus Combat and applies Vicious per Effect", () => {
    const stress = rollAttackStress({ name: "Blade", stressRating: 2, vicious: 1 }, 3, scriptedRng([1, 2, 5, 6, 3]));
    expect(stress.roll.total).toBe(5);
    expect(stress.stress).toBe(7);
  });
});

describe("extended tests", () => {
  it("scores a breakthrough when the Work track empties", () => {
    const test = createExtendedTest("core", "Recover the data core", 6, 2);
    const first = applyWork(test, 4);
    expect(first.breakthroughsGained).toBe(0);
    const second = applyWork(first.test, 3);
    expect(second.breakthroughsGained).toBe(1);
    expect(second.complete).toBe(false);
    const third = applyWork(second.test, 1);
    expect(third.complete).toBe(true);
  });

  it("scores a breakthrough for 5+ Work in one attempt and subtracts resistance", () => {
    const test = createExtendedTest("x", "Hack", 12, 3, 1);
    const outcome = applyWork(test, 6);
    expect(outcome.effectiveWork).toBe(5);
    expect(outcome.breakthroughsGained).toBe(1);
  });
});

describe("characters", () => {
  const attrs = { agility: 10, brawn: 8, coordination: 11, insight: 7, reason: 9, will: 9 };
  const skills = { combat: 2, command: 2, engineering: 2, exploration: 3, flight: 4, medical: 1 };

  it("accepts the worked lifepath example", () => {
    expect(validateFinishedCharacter(attrs, skills)).toEqual([]);
    expect(maxStress(attrs, skills)).toBe(10);
  });

  it("flags totals and caps", () => {
    const issues = validateFinishedCharacter({ ...attrs, agility: 12, coordination: 12 }, { ...skills, flight: 5, combat: 5 });
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(["attributes", "skills"]));
  });
});
