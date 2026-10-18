import type { CampaignState, TableState } from "@hwr/protocol";
import { MISSIONS } from "@hwr/content";

/**
 * A campaign carries a crew from one game night to the next. Each finished mission becomes a
 * chapter (how it ended, the Requisition earned, who was there) and gives every crew member an
 * advance to spend; "Continue the campaign" starts the next table with the same crew, their
 * kit, the banked RU and the story so far.
 */

/** The first sentence or two of a mission's ending, for the recap. */
export function firstSentences(text: string, count = 2): string {
  const sentences = text.match(/[^.!?]+[.!?]+["'”’)]*/g) ?? [text];
  return sentences.slice(0, count).join("").replace(/\s+/g, " ").trim();
}

/** Lasting marks of being taken down. Each is a story hook for the GM, not a penalty. */
export const SCARS = [
  "a burn scar along the jaw",
  "a reconstructed hand that aches in the cold",
  "a limp that worsens before a fight",
  "shrapnel too close to the spine to remove",
  "a ringing in one ear since the blast",
  "a long scar across the ribs",
  "nightmares of the moment it went dark",
  "a cybernetic eye from the fleet surgeons",
] as const;

/** A scar this character doesn't already have, picked by name and chapter so the same game always gives the same scar. */
export function pickScar(characterId: string, chapter: number, has: string[] = []): string {
  const free = SCARS.filter((s) => !has.includes(s));
  const pool = free.length ? free : SCARS;
  let hash = chapter;
  for (const ch of characterId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length]!;
}

/**
 * Records the mission that just ended as a chapter: banks its RU, gives the crew an advance
 * each, and gives a scar to everyone who was taken down.
 */
export function recordChapter(state: TableState, missionTitle: string, endingText: string): CampaignState {
  const campaign = (state.campaign ??= { id: state.id, name: state.name, chapters: [], ru: 0, advances: {} });
  const party = state.sheets.filter((s) => state.characters[s.id]?.controllerId);
  const ru = state.awards?.ru ?? 0;
  const scars: string[] = [];
  for (const s of party) {
    if (!state.characters[s.id]!.downed) continue;
    const has = ((campaign.scars ??= {})[s.id] ??= []);
    const scar = pickScar(s.id, campaign.chapters.length, has);
    has.push(scar);
    scars.push(`${s.name}: ${scar}`);
  }
  campaign.chapters.push({
    missionId: state.missionId,
    missionTitle,
    ending: firstSentences(endingText),
    ru,
    crew: party.map((s) => s.name),
    ...(scars.length ? { scars } : {}),
    at: Date.now(),
  });
  campaign.ru += ru;
  for (const s of party) campaign.advances[s.id] = (campaign.advances[s.id] ?? 0) + 1;
  return campaign;
}

/** The mission a campaign plays next: the last one's sequel, else the first not yet played, else the same again. */
export function nextMissionId(prev: TableState): string {
  const sequel = MISSIONS[prev.missionId]?.sequel;
  if (sequel && MISSIONS[sequel]) return sequel;
  const played = new Set(prev.campaign?.chapters.map((c) => c.missionId) ?? []);
  return Object.keys(MISSIONS).find((id) => !played.has(id)) ?? prev.missionId;
}

/**
 * Moves the crew into the next table: the same sheets, seats and kit (minus anything lost or
 * broken), stress cleared and Fortune restored, and the campaign so far. Anyone injured on the
 * last mission starts this one with a lasting wound (one injury) until the infirmary treats it.
 * Spectators (TV screens) join afresh.
 */
export function carryOver(prev: TableState, next: TableState): TableState {
  next.name = prev.name;
  next.gmMode = prev.gmMode === "claude" && !next.aiAvailable ? "director" : prev.gmMode;
  next.sheets = structuredClone(prev.sheets);
  const fortune = Object.values(next.characters)[0]?.fortune ?? 1;
  next.characters = Object.fromEntries(
    Object.entries(prev.characters).map(([id, c]) => [
      id,
      {
        sheetId: c.sheetId,
        stress: 0,
        injuries: c.hurt ? 1 : 0,
        fortune,
        controllerId: c.controllerId,
        inventory: (c.inventory ?? []).filter((item) => item.status !== "lost" && item.status !== "broken").map((item) => ({ ...item, usedInScene: undefined })),
      },
    ]),
  );
  next.players = prev.players.filter((p) => p.role !== "spectator").map((p) => ({ ...p, connected: false }));
  next.campaign = structuredClone(prev.campaign);
  return next;
}

/** The Narrator's opening line for the next mission. */
export function recap(campaign: CampaignState): string | undefined {
  const last = campaign.chapters.at(-1);
  if (!last) return undefined;
  const before = campaign.chapters.length > 1 ? ` It's chapter ${campaign.chapters.length + 1} of their story.` : "";
  const scarred = (last.scars ?? []).map((s) => s.split(":")[0]!);
  const marks = scarred.length ? ` ${listNames(scarred)} still ${scarred.length > 1 ? "carry" : "carries"} the marks of it.` : "";
  return `Previously, aboard ${campaign.name}: ${last.missionTitle}. ${last.ending}${marks}${before}`;
}

function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
}
