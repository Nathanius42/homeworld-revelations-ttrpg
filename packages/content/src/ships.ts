import type { SpaceNode } from "./mission.js";

type PlayerShip = SpaceNode["ship"];
type EnemyShip = SpaceNode["enemies"][number];

/** The crew's heavy corvette. Hull = Structure + Scale. */
export const KHARSAANS_PROMISE: PlayerShip = {
  id: "kharsaans-promise",
  name: "Kharsaan's Promise",
  className: "Kushan heavy corvette",
  scale: 2,
  systems: { communications: 8, computers: 9, engines: 10, sensors: 9, structure: 9, weapons: 10 },
  maxHull: 11,
  armour: 1,
  weapons: [
    { name: "Twin heavy projectile cannons", cd: 4, range: "Close" },
    { name: "Guided missile pod", cd: 3, range: "Medium", vicious: 1 },
  ],
  model: "kus_heavycorvette",
};

/** Crew quality ratings for NPC ships (attribute, skill). */
export const CREW_QUALITY = {
  basic: { attribute: 8, skill: 1 },
  proficient: { attribute: 9, skill: 2 },
  talented: { attribute: 10, skill: 3 },
  exceptional: { attribute: 11, skill: 4 },
} as const;

export function taiidanInterceptor(id: string, name: string): EnemyShip {
  return {
    id,
    name,
    className: "Taiidan interceptor",
    scale: 1,
    systems: { communications: 6, computers: 7, engines: 11, sensors: 7, structure: 6, weapons: 8 },
    maxHull: 7,
    armour: 0,
    weapons: [{ name: "Light projectile cannon", cd: 2, range: "Close" }],
    crew: CREW_QUALITY.proficient,
    range: "Close",
    model: "tai_interceptor",
  };
}

export function taiidanDestroyer(id: string, name: string): EnemyShip {
  return {
    id,
    name,
    className: "Taiidan destroyer",
    scale: 4,
    systems: { communications: 9, computers: 10, engines: 7, sensors: 10, structure: 12, weapons: 11 },
    maxHull: 16,
    armour: 3,
    weapons: [{ name: "Large ion cannon", cd: 5, range: "Long", piercing: 2 }],
    crew: CREW_QUALITY.talented,
    range: "Long",
    chargeEvery: 2,
    optional: true,
    model: "tai_destroyer",
  };
}
