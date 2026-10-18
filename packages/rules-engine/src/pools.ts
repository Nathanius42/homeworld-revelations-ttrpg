/** Group Momentum, the GM's Threat, and each character's Fortune (Corebook ch. 1). */
export const MOMENTUM_CAP = 6;
export const FORTUNE_START = 1;
export const FORTUNE_CAP = 3;
export const THREAT_PER_PLAYER = 2;

export interface Pools {
  momentum: number;
  threat: number;
}

export function sessionStartPools(players: number): Pools {
  return { momentum: 0, threat: THREAT_PER_PLAYER * Math.max(0, players) };
}

/** Banks Momentum up to the cap; anything over the cap is lost. */
export function bankMomentum(pools: Pools, amount: number): { pools: Pools; banked: number; lost: number } {
  const room = MOMENTUM_CAP - pools.momentum;
  const banked = Math.max(0, Math.min(room, amount));
  return { pools: { ...pools, momentum: pools.momentum + banked }, banked, lost: Math.max(0, amount - banked) };
}

export interface Payment {
  /** Momentum taken from the group pool. */
  momentum: number;
  /** Threat handed to the GM instead of spending Momentum. */
  threat: number;
}

/** Pays a Momentum cost from the pool, adding Threat for whatever the pool can't or won't cover. */
export function payCost(pools: Pools, cost: number, preferThreat = false): { pools: Pools; payment: Payment } {
  if (cost < 0) throw new Error("cost cannot be negative");
  const fromMomentum = preferThreat ? 0 : Math.min(pools.momentum, cost);
  const payment = { momentum: fromMomentum, threat: cost - fromMomentum };
  return {
    pools: { momentum: pools.momentum - payment.momentum, threat: pools.threat + payment.threat },
    payment,
  };
}

/** The GM spends Threat. Fails rather than going negative. */
export function spendThreat(pools: Pools, amount: number): Pools {
  if (amount < 0) throw new Error("amount cannot be negative");
  if (amount > pools.threat) throw new Error(`not enough Threat: need ${amount}, have ${pools.threat}`);
  return { ...pools, threat: pools.threat - amount };
}

export function addThreat(pools: Pools, amount: number): Pools {
  if (amount < 0) throw new Error("amount cannot be negative");
  return { ...pools, threat: pools.threat + amount };
}

/** One point of Momentum is lost from the pool at the end of each scene. */
export function endScene(pools: Pools): Pools {
  return { ...pools, momentum: Math.max(0, pools.momentum - 1) };
}

export function gainFortune(fortune: number, amount = 1): number {
  return Math.min(FORTUNE_CAP, fortune + amount);
}

export function spendFortune(fortune: number): number {
  if (fortune < 1) throw new Error("no Fortune to spend");
  return fortune - 1;
}

/** Common Momentum spends and their costs. */
export const MOMENTUM_SPENDS = {
  createTruth: 2,
  askQuestion: 1,
  extraMinorAction: 1,
  extraSkillTest: 3,
  keepInitiative: 2,
  disarm: 2,
  avoidInjury: 2,
} as const;

/** Threat costs for common GM moves. */
export const THREAT_COSTS = {
  complication: 2,
  minorReinforcement: 1,
  notableReinforcement: 2,
  npcActsFirst: 1,
} as const;

export function reversalCost(pcsPresent: number): number {
  return 2 * pcsPresent;
}
