import type { Rng } from "./rng.js";

/** Rule constants (Corebook ch. 1). Kept together so house rules can override them. */
export const BASE_DICE = 2;
export const MAX_POOL = 5;
export const MAX_EXTRA_DICE = 3;
export const MAX_COMPLICATION_RANGE = 5;

export interface TestSpec {
  attribute: number;
  skill: number;
  /** An applicable focus doubles successes on dice at or under the skill. */
  focus: boolean;
  difficulty: number;
  /** 1 = complications on 20 only; each step widens it by one face. */
  complicationRange?: number;
  /** Total d20s rolled, including base dice. */
  dice: number;
  /** Dice pre-set to 1 by the Fortune "Critical Success" spend. */
  presetCrits?: number;
}

export interface D20Die {
  face: number;
  successes: 0 | 1 | 2;
  complication: boolean;
  preset: boolean;
}

export interface TestResult {
  targetNumber: number;
  focusThreshold: number | null;
  difficulty: number;
  complicationRange: number;
  dice: D20Die[];
  successes: number;
  complications: number;
  passed: boolean;
  /** Successes beyond the difficulty. Zero on a failed test. */
  momentum: number;
}

export function targetNumber(attribute: number, skill: number): number {
  return attribute + skill;
}

export function complicationThreshold(range: number): number {
  return 21 - clampRange(range);
}

export function scoreD20(face: number, tn: number, focusThreshold: number | null, range = 1): D20Die {
  if (!Number.isInteger(face) || face < 1 || face > 20) throw new Error(`invalid d20 face: ${face}`);
  let successes: 0 | 1 | 2 = 0;
  if (face === 1 || (focusThreshold !== null && face <= focusThreshold)) successes = 2;
  else if (face <= tn) successes = 1;
  return { face, successes, complication: face >= complicationThreshold(range), preset: false };
}

/** Scores a test from known faces. Preset critical dice come first in `faces`. */
export function evaluateTest(spec: TestSpec, faces: readonly number[]): TestResult {
  validateSpec(spec);
  if (faces.length !== spec.dice) throw new Error(`expected ${spec.dice} faces, got ${faces.length}`);
  const tn = targetNumber(spec.attribute, spec.skill);
  const focusThreshold = spec.focus ? spec.skill : null;
  const range = clampRange(spec.complicationRange ?? 1);
  const presets = spec.presetCrits ?? 0;
  const dice = faces.map((face, i) => ({ ...scoreD20(face, tn, focusThreshold, range), preset: i < presets }));
  return summarise(tn, focusThreshold, spec.difficulty, range, dice);
}

export function rollTest(spec: TestSpec, rng: Rng): TestResult {
  validateSpec(spec);
  const presets = spec.presetCrits ?? 0;
  const faces: number[] = [];
  for (let i = 0; i < spec.dice; i++) faces.push(i < presets ? 1 : rng.die(20));
  return evaluateTest(spec, faces);
}

/** Re-rolls the chosen dice (Fortune re-roll, Aim, talents). Preset dice keep their 1. */
export function rerollDice(result: TestResult, indices: readonly number[], rng: Rng): TestResult {
  const dice = result.dice.map((die, i) => {
    if (!indices.includes(i) || die.preset) return die;
    return scoreD20(rng.die(20), result.targetNumber, result.focusThreshold, result.complicationRange);
  });
  return summarise(result.targetNumber, result.focusThreshold, result.difficulty, result.complicationRange, dice);
}

/**
 * Cost of buying `bought` extra d20s when `bonusDice` free dice (from talents)
 * already occupy the first purchase slots. Costs are 1, 2 and 3.
 */
export function extraDiceCost(bought: number, bonusDice = 0): number {
  if (bought < 0 || bonusDice < 0) throw new Error("dice counts cannot be negative");
  if (bought + bonusDice > MAX_EXTRA_DICE) throw new Error(`at most ${MAX_EXTRA_DICE} extra dice per test`);
  let cost = 0;
  for (let slot = bonusDice + 1; slot <= bonusDice + bought; slot++) cost += slot;
  return cost;
}

export function poolSize(bought: number, bonusDice = 0): number {
  return Math.min(MAX_POOL, BASE_DICE + bought + bonusDice);
}

export interface AssistDie {
  attribute: number;
  skill: number;
  focus: boolean;
  face: number;
}

export interface AssistedResult extends TestResult {
  assists: D20Die[];
}

/** Assistants roll one d20 each; their successes count only if the leader scores one. */
export function evaluateAssistedTest(
  spec: TestSpec,
  leaderFaces: readonly number[],
  assists: readonly AssistDie[],
): AssistedResult {
  const leader = evaluateTest(spec, leaderFaces);
  const range = leader.complicationRange;
  const assistDice = assists.map((a) =>
    scoreD20(a.face, targetNumber(a.attribute, a.skill), a.focus ? a.skill : null, range),
  );
  const assistSuccesses = leader.successes > 0 ? assistDice.reduce((s, d) => s + d.successes, 0) : 0;
  const successes = leader.successes + assistSuccesses;
  const complications = leader.complications + assistDice.filter((d) => d.complication).length;
  const passed = isPassed(successes, leader.difficulty);
  return {
    ...leader,
    assists: assistDice,
    successes,
    complications,
    passed,
    momentum: passed ? Math.max(0, successes - leader.difficulty) : 0,
  };
}

export type OpposedWinner = "active" | "reactive" | "none";

/** Both pass: more Momentum wins, ties to the active side. Both fail: nobody. */
export function resolveOpposed(active: TestResult, reactive: TestResult): OpposedWinner {
  if (active.passed && reactive.passed) return active.momentum >= reactive.momentum ? "active" : "reactive";
  if (active.passed) return "active";
  if (reactive.passed) return "reactive";
  return "none";
}

function summarise(
  tn: number,
  focusThreshold: number | null,
  difficulty: number,
  range: number,
  dice: D20Die[],
): TestResult {
  const successes = dice.reduce((s, d) => s + d.successes, 0);
  const complications = dice.filter((d) => d.complication).length;
  const passed = isPassed(successes, difficulty);
  return {
    targetNumber: tn,
    focusThreshold,
    difficulty,
    complicationRange: range,
    dice,
    successes,
    complications,
    passed,
    momentum: passed ? Math.max(0, successes - difficulty) : 0,
  };
}

function isPassed(successes: number, difficulty: number): boolean {
  return difficulty <= 0 || successes >= difficulty;
}

function clampRange(range: number): number {
  return Math.max(1, Math.min(MAX_COMPLICATION_RANGE, Math.trunc(range)));
}

function validateSpec(spec: TestSpec): void {
  if (!Number.isInteger(spec.dice) || spec.dice < 1 || spec.dice > MAX_POOL) {
    throw new Error(`a test rolls 1 to ${MAX_POOL} d20s, not ${spec.dice}`);
  }
  if (spec.difficulty < 0) throw new Error("difficulty cannot be negative");
  if ((spec.presetCrits ?? 0) > spec.dice) throw new Error("more preset criticals than dice");
}
