import type { LogEntry } from "./index.js";

type Narration = Extract<LogEntry, { type: "narration" }>;

/**
 * Speech choices shared by the game server and every client, so the server can make a line's
 * audio before the TV asks (same sentences, same voice) and the TV finds it ready.
 */

/** Markdown and stage symbols read badly aloud. */
export function speakableText(text: string): string {
  return text
    .replace(/[*_`#>]+/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence-sized pieces: some engines stop part-way through long utterances, and short lines start sooner. */
export function chunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      out.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** A small stable hash, so a speaker keeps the same voice every time. */
export function speechHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface KokoroChoice {
  voice: string;
  speed: number;
}

/** Voices for speakers the mission doesn't name: a mix of accents and sexes, picked by name so each keeps theirs. */
const NPC_VOICES = ["bm_lewis", "bf_isabella", "am_michael", "bf_lily", "bm_daniel", "af_bella", "am_adam", "bf_alice", "bm_fable", "af_nicole", "am_eric", "af_sarah"];

/**
 * The Narrator is George, Fleet Command is Emma; named characters get the mission's choice
 * ("voice" or "voice@speed") or a stable pick.
 */
export function chooseKokoro(entry: Pick<Narration, "speaker" | "tone">, missionVoices: Record<string, string> = {}): KokoroChoice {
  const named = missionVoices[entry.speaker];
  if (named) {
    // "bm_fable@0.82": a voice and a speed, for a speaker who should sound slower or quicker than people do.
    const [voice, at] = named.split("@");
    const speed = Number(at);
    return { voice: voice!, speed: at && speed >= 0.7 && speed <= 1.3 ? speed : 1 };
  }
  if (entry.tone === "fleet" || /fleet command/i.test(entry.speaker)) return { voice: "bf_emma", speed: 1.05 };
  if (entry.speaker === "Narrator" || entry.tone === "gm") return { voice: "bm_george", speed: 0.97 };
  if (entry.tone === "danger") return { voice: "bm_george", speed: 1.05 };
  const h = speechHash(entry.speaker);
  return { voice: NPC_VOICES[h % NPC_VOICES.length]!, speed: 0.95 + ((h >>> 8) % 10) / 100 };
}
