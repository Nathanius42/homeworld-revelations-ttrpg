import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MISSIONS } from "@hwr/content";
import { readPrivateMissions } from "./private-missions.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Mission packs ship with the app rather than living on one PC: packs/<name>/missions/ holds an
 * index.json, the mission files and their art, in the same shape as the private folder's missions.
 * A pack's art is served at /packs/<name>/. The portable build carries them in app/packs, next to
 * the web client; in the repo they sit in packs/ at the root (the public copy has one, this one
 * doesn't).
 */
export const PACKS_DIR =
  process.env.HWR_PACKS_DIR ?? (process.env.HWR_WEB_DIST ? resolve(process.env.HWR_WEB_DIST, "..", "packs") : resolve(here, "../../../packs"));

export interface LoadedPack {
  name: string;
  /** The folder its art is served from. */
  dir: string;
  loaded: string[];
  skipped: string[];
}

/** Adds every pack's missions to MISSIONS. Each is checked like a private mission; a broken one is skipped with a reason. */
export function loadMissionPacks(root = PACKS_DIR): LoadedPack[] {
  if (!existsSync(root)) return [];
  const packs: LoadedPack[] = [];
  for (const name of readdirSync(root).sort()) {
    const packDir = join(root, name);
    if (!statSync(packDir).isDirectory() || !/^[a-z0-9-]+$/.test(name)) continue;
    const { missions, skipped } = readPrivateMissions(packDir);
    for (const m of missions) MISSIONS[m.id] = m;
    packs.push({ name, dir: join(packDir, "missions"), loaded: missions.map((m) => m.id), skipped });
  }
  return packs;
}
