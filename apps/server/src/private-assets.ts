import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * reference/ is the one place for things this PC may use but must never share: ship models, the
 * soundtracks, family photos and portraits, the corebook. It's git-ignored, a test fails if
 * anything in it is ever committed, and the server only offers each kind when it's present, so
 * a clean copy of the repo runs with stock art and synthesised sound.
 */
export const PRIVATE_DIR = process.env.HWR_PRIVATE_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../reference");

/** Each kind the app can use, and the file that says it's ready. */
export const PRIVATE_KINDS = {
  ships: "ships/index.json",
  portraits: "portraits/index.json",
  music: "music/playlist.json",
  sfx: "sfx/sfx.json",
  missions: "missions/index.json",
  tts: "tts/kokoro/config.json",
  badges: "badges/index.json",
} as const;

export type PrivateKind = keyof typeof PRIVATE_KINDS;

export function privateDir(kind: PrivateKind): string {
  return resolve(PRIVATE_DIR, kind);
}

export function hasPrivate(kind: PrivateKind, root = PRIVATE_DIR): boolean {
  return existsSync(resolve(root, PRIVATE_KINDS[kind]));
}

/** Which private kinds this PC has, for /api/health and the host. */
export function privateStatus(root = PRIVATE_DIR): Record<PrivateKind, boolean> {
  return Object.fromEntries(Object.keys(PRIVATE_KINDS).map((k) => [k, hasPrivate(k as PrivateKind, root)])) as Record<PrivateKind, boolean>;
}
