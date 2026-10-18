import type { Mission } from "./mission.js";
import { COLD_HARBOUR } from "./missions/cold-harbour.js";
import { SILENT_BEACON } from "./missions/silent-beacon.js";

export * from "./mission.js";
export { CREW, WEAPONS } from "./crew.js";
export * from "./designer.js";
export * from "./ships.js";
export * from "./requisition.js";

/** Missions in the in-house content pack. */
export const MISSIONS: Record<string, Mission> = {
  [SILENT_BEACON.id]: SILENT_BEACON,
  [COLD_HARBOUR.id]: COLD_HARBOUR,
};

export const DEFAULT_MISSION_ID = SILENT_BEACON.id;

/** Identifying details handed out to crowds of minor NPCs, so a table can say "shoot the one with...". */
export const IDENTIFYING_DETAILS = [
  "red-painted visor",
  "missing left glove",
  "Taiidan officer's coat",
  "rifle wrapped in tape",
  "burn scar across the jaw",
  "chain of ship tags",
  "dented helmet",
  "mismatched boots",
];
