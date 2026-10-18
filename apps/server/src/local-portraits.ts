import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GALLERY_SEX } from "@hwr/content";
import { privateDir } from "./private-assets.js";

/**
 * Portraits of friends and family, made by tools/likeness and kept in git-ignored
 * reference/portraits. They exist only on a PC that has them and are never committed.
 */
export const LOCAL_PORTRAITS_DIR = privateDir("portraits");

export interface LocalPortrait {
  url: string;
  label: string;
  /** "man", "woman" or "" when unknown; decides which gallery slot it can take over. */
  sex: string;
  file: string;
}

let cache: LocalPortrait[] | undefined;

export function localPortraits(): LocalPortrait[] {
  if (cache) return cache;
  const index = resolve(LOCAL_PORTRAITS_DIR, "index.json");
  try {
    const entries = existsSync(index) ? (JSON.parse(readFileSync(index, "utf8")) as { file: string; label: string; sex?: string }[]) : [];
    cache = entries
      .filter((e) => /^[\w.-]+\.webp$/.test(e.file) && existsSync(resolve(LOCAL_PORTRAITS_DIR, e.file)))
      .map((e) => ({ url: `/local/portraits/${e.file}`, label: String(e.label ?? "").slice(0, 40), sex: e.sex === "man" || e.sex === "woman" ? e.sex : "", file: e.file }));
  } catch {
    cache = [];
  }
  return cache;
}

/**
 * A saved character keeps its family portrait only where that portrait exists. On another PC, or
 * after a portrait is deleted, it gets a stable gallery portrait instead of a blank frame.
 */
export function portraitOrFallback(url: string, characterId: string, available: readonly string[] = localPortraits().map((p) => p.url)): string {
  if (!url.startsWith("/local/portraits/") || available.includes(url)) return url;
  let h = 0;
  for (const c of characterId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/art/portraits/gallery-${(h % 8) + 1}.webp`;
}

/**
 * Family portraits take over the stock gallery slots of the same sex, in seed order, so every
 * place that shows a gallery portrait shows a family face instead. Slot index i is
 * /art/portraits/gallery-(i+1).webp. Without the private folder nothing is assigned and the stock
 * art is served as before.
 */
export function assignGallerySlots(family: readonly LocalPortrait[], slots: readonly ("man" | "woman" | "any")[] = GALLERY_SEX): Map<number, LocalPortrait> {
  const taken = new Set<string>();
  const out = new Map<number, LocalPortrait>();
  const pick = (want: (p: LocalPortrait) => boolean) => family.find((p) => !taken.has(p.url) && want(p));
  // Fixed-sex slots first, so an "any" slot can't use up the last portrait a fixed slot needed.
  const order = slots.map((s, i) => [s, i] as const).sort((a, b) => Number(a[0] === "any") - Number(b[0] === "any"));
  for (const [sex, i] of order) {
    const p = sex === "any" ? pick(() => true) : pick((x) => x.sex === sex);
    if (p) {
      taken.add(p.url);
      out.set(i, p);
    }
  }
  return out;
}

let slots: Map<number, LocalPortrait> | undefined;

export function gallerySlots(): Map<number, LocalPortrait> {
  return (slots ??= assignGallerySlots(localPortraits()));
}

/** Family portraits that didn't take over a gallery slot, for the designer's own row. */
export function extraFamilyPortraits(): { url: string; label: string }[] {
  const used = new Set([...gallerySlots().values()].map((p) => p.url));
  return localPortraits()
    .filter((p) => !used.has(p.url))
    .map(({ url, label }) => ({ url, label }));
}
