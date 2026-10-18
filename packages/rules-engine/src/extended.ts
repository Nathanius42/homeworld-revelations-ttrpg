export interface ExtendedTest {
  id: string;
  label: string;
  work: number;
  workRemaining: number;
  resistance: number;
  magnitude: number;
  breakthroughs: number;
}

export function createExtendedTest(id: string, label: string, work: number, magnitude = 1, resistance = 0): ExtendedTest {
  return { id, label, work, workRemaining: work, resistance, magnitude, breakthroughs: 0 };
}

export interface WorkOutcome {
  test: ExtendedTest;
  effectiveWork: number;
  breakthroughsGained: number;
  complete: boolean;
}

/** Challenge Dice rolled for Work on a successful contributing test. */
export const WORK_DICE = 4;

/**
 * Applies Work from a successful contributing test. Breakthroughs come from
 * emptying the track, any Work after it is empty, and 5+ Work in one attempt
 * (Corebook ch. 9).
 */
export function applyWork(test: ExtendedTest, rolledWork: number): WorkOutcome {
  const effectiveWork = Math.max(0, rolledWork - test.resistance);
  let gained = 0;
  if (effectiveWork >= 5) gained++;
  if (effectiveWork > 0 && test.workRemaining > 0 && test.workRemaining - effectiveWork <= 0) gained++;
  if (effectiveWork > 0 && test.workRemaining <= 0) gained++;
  const breakthroughs = Math.min(test.magnitude, test.breakthroughs + gained);
  const next: ExtendedTest = {
    ...test,
    workRemaining: Math.max(0, test.workRemaining - effectiveWork),
    breakthroughs,
  };
  return {
    test: next,
    effectiveWork,
    breakthroughsGained: breakthroughs - test.breakthroughs,
    complete: breakthroughs >= test.magnitude,
  };
}
