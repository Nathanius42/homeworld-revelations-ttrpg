import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MISSIONS, validateMission, type Mission } from "@hwr/content";
import { PRIVATE_DIR } from "./private-assets.js";

const BUILT_IN = new Set(Object.keys(MISSIONS));

/**
 * Missions adapted from licensed books (the corebook's quickstart, for one) can't be committed, so
 * they live as JSON in reference/missions, listed in its index.json: { "missions": ["file.json"] }.
 * Their art sits beside them and is served at /local/missions/. Each one must pass the same graph
 * check as the built-in missions and may not reuse a built-in id; anything else is skipped with a
 * reason, so a broken file never stops the server.
 */
export function readPrivateMissions(root = PRIVATE_DIR): { missions: Mission[]; skipped: string[] } {
  const dir = resolve(root, "missions");
  const index = resolve(dir, "index.json");
  const missions: Mission[] = [];
  const skipped: string[] = [];
  if (!existsSync(index)) return { missions, skipped };
  let files: string[];
  try {
    files = (JSON.parse(readFileSync(index, "utf8")) as { missions?: string[] }).missions ?? [];
  } catch (err) {
    return { missions, skipped: [`missions/index.json: ${(err as Error).message}`] };
  }
  for (const file of files) {
    try {
      const mission = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Mission;
      const problems = validateMission(mission);
      if (problems.length) skipped.push(`${file}: ${problems.join("; ")}`);
      else if (BUILT_IN.has(mission.id)) skipped.push(`${file}: id ${mission.id} is already a built-in mission`);
      else if (missions.some((m) => m.id === mission.id)) skipped.push(`${file}: id ${mission.id} is used twice`);
      else missions.push(mission);
    } catch (err) {
      skipped.push(`${file}: ${(err as Error).message}`);
    }
  }
  return { missions, skipped };
}

/** Adds this PC's private missions to MISSIONS, so tables, saves and the lobby treat them like any other. */
export function loadPrivateMissions(root = PRIVATE_DIR): { loaded: string[]; skipped: string[] } {
  const { missions, skipped } = readPrivateMissions(root);
  for (const m of missions) MISSIONS[m.id] = m;
  return { loaded: missions.map((m) => m.id), skipped };
}
