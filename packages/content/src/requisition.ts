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
