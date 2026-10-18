import type { ShipState, ShipSystem } from "@hwr/protocol";

/** Kit the fleet issues between missions in exchange for banked Requisition (RU). */
export interface RequisitionItem {
  id: string;
  name: string;
  cost: number;
  size: "small" | "medium" | "large";
  uses?: number;
  /** What it's good for, shown on the requisition list. */
  detail: string;
}

/** Each item makes a fitting test one step easier when used, like any other kit. */
export const REQUISITION: RequisitionItem[] = [
  { id: "medkit", name: "Field medkit", cost: 2, size: "small", uses: 3, detail: "Patching up wounds and steadying the shaken." },
  { id: "breaching-charges", name: "Breaching charges", cost: 2, size: "small", uses: 2, detail: "Sealed doors and stubborn bulkheads." },
  { id: "repair-kit", name: "Engineer's repair kit", cost: 2, size: "medium", uses: 3, detail: "Jury-rigging systems and fixing damage." },
  { id: "scanner", name: "Handheld scanner", cost: 2, size: "small", detail: "Finding what's hidden: life signs, power, traps." },
  { id: "climbing-rig", name: "Climbing rig", cost: 1, size: "medium", detail: "Ropes, clamps and a harness for the long way up." },
  { id: "composite-rifle", name: "Composite rifle", cost: 3, size: "large", detail: "A soldier's rifle with range to spare." },
];

/** Work done on the crew's ship between missions: bought once with banked RU, kept for the campaign. */
export interface ShipRefit {
  id: string;
  name: string;
  cost: number;
  detail: string;
  change: { armour?: number; maxHull?: number; systems?: Partial<Record<ShipSystem, number>>; weaponCd?: number };
}

/** The most a refit can raise a ship system to. */
export const SYSTEM_CAP = 12;

export const SHIP_REFITS: ShipRefit[] = [
  { id: "bulkheads", name: "Reinforced bulkheads", cost: 3, detail: "+2 hull: two more hits before she comes apart.", change: { maxHull: 2 } },
  { id: "armour", name: "Ablative armour plating", cost: 4, detail: "+1 armour against every hit.", change: { armour: 1 } },
  { id: "fire-control", name: "Fire-control computer", cost: 3, detail: "+1 Weapons: Tactical's shots and Helm's attack patterns.", change: { systems: { weapons: 1 } } },
  { id: "engines", name: "Engine overhaul", cost: 3, detail: "+1 Engines: sharper evasive action and breakaways.", change: { systems: { engines: 1 } } },
  { id: "sensors", name: "Long-range sensor array", cost: 3, detail: "+1 Sensors: better scans for weakness.", change: { systems: { sensors: 1 } } },
  { id: "comms", name: "Encrypted comms suite", cost: 2, detail: "+1 Communications: jamming enemy targeting.", change: { systems: { communications: 1 } } },
  { id: "main-guns", name: "Upgraded main guns", cost: 5, detail: "+1 Challenge Die on every weapon.", change: { weaponCd: 1 } },
];

/** The crew's ship with the campaign's refits fitted. Unknown ids are ignored, so old saves still load. */
export function applyRefits<T extends Pick<ShipState, "armour" | "maxHull" | "systems" | "weapons">>(ship: T, refitIds: readonly string[]): T {
  const out = structuredClone(ship);
  for (const refit of SHIP_REFITS.filter((r) => refitIds.includes(r.id))) {
    const c = refit.change;
    out.armour += c.armour ?? 0;
    out.maxHull += c.maxHull ?? 0;
    for (const [system, by] of Object.entries(c.systems ?? {}) as [ShipSystem, number][]) out.systems[system] = Math.min(SYSTEM_CAP, out.systems[system] + by);
    if (c.weaponCd) out.weapons = out.weapons.map((w) => ({ ...w, cd: w.cd + c.weaponCd! }));
  }
  return out;
}
