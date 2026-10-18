import { randomUUID } from "node:crypto";
import type { InventoryItem, ItemSize, ItemStatus } from "@hwr/protocol";

const uid = () => randomUUID().slice(0, 8);

/**
 * No hammerspace: everything carried has a size, and a character's load can't exceed what they
 * can physically haul. Stowed gear (aboard the ship) and lost or used-up items don't count.
 */
export const BULK: Record<ItemSize, number> = { small: 1, medium: 2, large: 4 };

export function capacity(brawn: number): number {
  return 10 + Math.floor(brawn / 2);
}

/** On the character's person: everything but lost, used-up and stowed items. */
export function carried(item: InventoryItem): boolean {
  return item.status !== "lost" && item.status !== "used up" && item.status !== "stowed";
}

export function load(items: readonly InventoryItem[]): number {
  return items.filter(carried).reduce((sum, i) => sum + BULK[i.size ?? "small"], 0);
}

/** A best guess at size from the name, for starting kit and finds without one. */
export function guessSize(name: string): ItemSize {
  if (/crate|engine|generator|reactor|container|chest|turret|stretcher|barrel/i.test(name)) return "large";
  if (/toolkit|torch|rifle|carbine|launcher|armour|armor|harness|swords?|axe|spear|shield|pack|case|kit\b/i.test(name)) return "medium";
  return "small";
}

/** "Researcher's toolkit (3 uses)" becomes a consumable with three charges. */
export function itemFromEquipment(entry: string, origin = "Starting kit"): InventoryItem {
  const m = /^(.*?)\s*\((\d+) uses?\)\s*$/i.exec(entry);
  const name = (m ? m[1]! : entry).trim();
  return { id: uid(), name, origin, status: "ok", size: guessSize(name), ...(m ? { uses: Number(m[2]) } : {}), history: [origin] };
}

export function startingInventory(equipment: readonly string[]): InventoryItem[] {
  return equipment.map((e) => itemFromEquipment(e));
}

export function newItem(name: string, origin: string, uses?: number, size?: ItemSize): InventoryItem {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  const from = origin.trim().slice(0, 120) || "Picked up";
  return { id: uid(), name: clean, origin: from, status: "ok", size: size ?? guessSize(clean), ...(uses && uses > 0 ? { uses: Math.floor(uses) } : {}), history: [from] };
}

/** Items that can still help: carried, not broken, with charges left. */
export function usable(item: InventoryItem): boolean {
  return (item.status === "ok" || item.status === "damaged") && (item.uses === undefined || item.uses > 0);
}

/** Finds an item by id, or by name (case-insensitive) for the GM's tools. */
export function findItem(items: readonly InventoryItem[], ref: string): InventoryItem | undefined {
  const r = ref.trim().toLowerCase();
  return items.find((i) => i.id === ref) ?? items.find((i) => i.name.toLowerCase() === r && i.status !== "lost") ?? items.find((i) => i.name.toLowerCase().includes(r) && i.status !== "lost");
}

/**
 * Records an item helping a test. Consumables spend a charge; a complication rolled while using
 * it damages it, and a second one breaks it. Returns what happened, for the log.
 */
export function useItem(item: InventoryItem, sceneId: string, purpose: string, complication: boolean): string[] {
  const notes: string[] = [];
  item.usedInScene = sceneId;
  item.history.push(`Used: ${purpose}`);
  if (item.uses !== undefined) {
    item.uses -= 1;
    if (item.uses <= 0) {
      item.status = "used up";
      item.history.push("Used up");
      notes.push(`${item.name} is used up.`);
    }
  }
  if (complication && item.status !== "used up") {
    const next: ItemStatus = item.status === "damaged" ? "broken" : "damaged";
    setStatus(item, next, "strained by a complication");
    notes.push(next === "broken" ? `${item.name} breaks.` : `${item.name} is damaged; another complication will break it.`);
  }
  return notes;
}

export function setStatus(item: InventoryItem, status: ItemStatus, reason: string): void {
  item.status = status;
  const verb = { ok: "Back in hand", damaged: "Damaged", broken: "Broken", lost: "Lost", "used up": "Used up", stowed: "Stowed aboard" }[status];
  item.history.push(reason ? `${verb}: ${reason}` : verb);
}
