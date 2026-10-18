/**
 * Reads narration aloud. When the game PC has the Kokoro model (reference/tts), lines are
 * spoken by Kokoro voices generated on that PC: the same natural voices on every device, with
 * a voice of its own for each named character. Otherwise, or if Kokoro fails, the browser's
 * built-in speech synthesis takes over (Edge's "Natural" voices are the best on Windows).
 *
 * Each device has its own on/off switch. The TV view speaks by default and phones stay quiet,
 * so a table of six devices doesn't talk over itself. Browsers only allow speech after the
 * page has been clicked or tapped once.
 */
import { useEffect, useRef, useState } from "react";
import type { KokoroChoice, LogEntry, TableState } from "@hwr/protocol";
import { chooseKokoro, chunks, speakableText, speechHash as hash } from "@hwr/protocol";

export { chooseKokoro, chunks, speakableText };
import { duck } from "./audio";

type Narration = Extract<LogEntry, { type: "narration" }>;

const synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined;

export const speechSupported = (): boolean => Boolean(synth) && typeof SpeechSynthesisUtterance !== "undefined";

function storageKey(tv: boolean): string {
  return tv ? "hwr.voice.tv" : "hwr.voice";
}

function readPref(tv: boolean): boolean {
  try {
    const v = localStorage.getItem(storageKey(tv));
    return v === null ? tv : v === "1";
  } catch {
    return tv;
  }
}

const listeners = new Set<() => void>();

export function setVoiceEnabled(tv: boolean, on: boolean): void {
  try {
    localStorage.setItem(storageKey(tv), on ? "1" : "0");
  } catch {
    // Private windows can refuse storage; the switch still works for this visit.
  }
  if (!on) stopSpeaking();
  for (const l of listeners) l();
}

export function useVoiceEnabled(tv: boolean): boolean {
  const [on, set] = useState(() => readPref(tv));
  useEffect(() => {
    const l = () => set(readPref(tv));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [tv]);
  return on;
}

/** English voices, best first: neural ("Natural"/"Online") voices, then Australian and British accents. */
export function rankVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|online|neural/i.test(v.name) ? 0 : 10) + (/^en-AU/i.test(v.lang) ? 0 : /^en-GB/i.test(v.lang) ? 1 : 2) + (v.localService ? 0 : 0.5);
  return voices.filter((v) => /^en/i.test(v.lang)).sort((a, b) => score(a) - score(b));
}

export interface VoiceChoice {
  voice?: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

/**
 * A steady voice for the Narrator, a different one for Fleet Command, and a stable voice and
 * pitch per NPC name so a character sounds the same every time they speak.
 */
export function chooseVoice(entry: Pick<Narration, "speaker" | "tone">, ranked: readonly SpeechSynthesisVoice[]): VoiceChoice {
  const pick = (i: number) => (ranked.length ? ranked[i % ranked.length] : undefined);
  if (entry.tone === "fleet" || /fleet command/i.test(entry.speaker)) return { voice: pick(1), pitch: 1, rate: 1.05 };
  if (entry.speaker === "Narrator" || entry.tone === "gm") return { voice: pick(0), pitch: 0.95, rate: 0.97 };
  if (entry.tone === "danger") return { voice: pick(0), pitch: 0.85, rate: 0.95 };
  const h = hash(entry.speaker);
  const pool = Math.min(ranked.length, 6);
  return { voice: pool ? ranked[h % pool] : undefined, pitch: 0.8 + ((h >>> 8) % 40) / 100, rate: 0.95 + ((h >>> 16) % 12) / 100 };
}

// ---------------------------------------------------------------- Kokoro voices from the game PC

let kokoro: boolean | undefined;
let kokoroCheck: Promise<boolean> | undefined;

function kokoroReady(): Promise<boolean> {
  kokoroCheck ??= fetch("/api/health")
    .then((r) => r.json() as Promise<{ private?: { tts?: boolean }; ttsSlow?: boolean }>)
    .then((h) => (kokoro = Boolean(h.private?.tts) && !h.ttsSlow))
    .catch(() => (kokoro = false));
  return kokoroCheck;
}

interface Line {
  text: string;
  choice: KokoroChoice;
  /** The browser voice to use instead if Kokoro can't speak this line. */
  fallback: Narration;
  audio?: Promise<string | undefined>;
  /** When it was queued: lines left waiting too long are skipped rather than read late. */
  queuedAt: number;
}

/** Narration more than this far behind is skipped; the text is still on screen. */
const STALE_MS = 15_000;

const lines: Line[] = [];
let playing: HTMLAudioElement | undefined;
/** True while the next line is being fetched, so two callers can't start the same line. */
let fetching = false;

function fetchLine(line: Line): Promise<string | undefined> {
  line.audio ??= fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: line.text, voice: line.choice.voice, speed: line.choice.speed }),
  })
    .then(async (r) => {
      if (r.ok) return r.blob();
      // The game PC can't make speech fast enough: use the browser's voices for the rest of the visit.
      if (r.status === 503 && ((await r.json().catch(() => ({}))) as { slow?: boolean }).slow) kokoro = false;
      return undefined;
    })
    .then((b) => (b ? URL.createObjectURL(b) : undefined))
    .catch(() => undefined);
  return line.audio;
}

/** Plays queued lines in order, fetching the next while the current one plays. */
async function pump(): Promise<void> {
  if (playing || fetching || !lines.length) return;
  const line = lines[0]!;
  fetching = true;
  const url = await fetchLine(line);
  fetching = false;
  if (lines[0] !== line) return void pump(); // Stopped or skipped while it was being made.
  if (lines[1]) void fetchLine(lines[1]);
  if (!url) {
    lines.shift();
    speakWithBrowser({ ...line.fallback, text: line.text });
    return void pump();
  }
  const el = new Audio(url);
  playing = el;
  duck(true);
  const next = () => {
    if (playing !== el) return;
    URL.revokeObjectURL(url);
    playing = undefined;
    lines.shift();
    if (!lines.length && !queued) duck(false);
    void pump();
  };
  el.onended = next;
  el.onerror = next;
  el.play().catch(() => {
    // Blocked until the page is clicked once: try again then.
    playing = undefined;
    window.addEventListener("pointerdown", () => void pump(), { once: true });
  });
}

function speakWithKokoro(entry: Narration, text: string, missionVoices?: Record<string, string>): void {
  const choice = chooseKokoro(entry, missionVoices);
  // Skip ahead: lines still waiting long after they were written would only make narration later.
  const now = Date.now();
  for (let i = lines.length - 1; i >= (playing ? 1 : 0); i--) if (now - lines[i]!.queuedAt > STALE_MS) lines.splice(i, 1);
  for (const piece of chunks(text)) lines.push({ text: piece, choice, fallback: entry, queuedAt: now });
  void fetchLine(lines[0]!);
  void pump();
}

// ---------------------------------------------------------------- the browser's own voices

let queued = 0;

function stopSpeaking(): void {
  queued = 0;
  lines.length = 0;
  if (playing) {
    playing.pause();
    playing = undefined;
  }
  synth?.cancel();
  duck(false);
}

function speakWithBrowser(entry: Narration): boolean {
  if (!speechSupported() || !synth) return false;
  const text = speakableText(entry.text);
  if (!text) return true;
  const { voice, pitch, rate } = chooseVoice(entry, rankVoices(synth.getVoices()));
  for (const piece of chunks(text)) {
    const u = new SpeechSynthesisUtterance(piece);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-AU";
    }
    u.pitch = pitch;
    u.rate = rate;
    queued++;
    duck(true);
    const done = () => {
      queued = Math.max(0, queued - 1);
      if (!queued) duck(false);
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }
  return true;
}

/** Queues one narration entry, with Kokoro when the game PC has it. Returns false if no speech is available. */
export function speakNarration(entry: Narration, missionVoices?: Record<string, string>): boolean {
  const text = speakableText(entry.text);
  if (!text) return true;
  if (kokoro) {
    speakWithKokoro(entry, text, missionVoices);
    return true;
  }
  return speakWithBrowser(entry);
}

/**
 * Speaks narration as it arrives. The backlog already on screen when the page opens is not
 * read out, and if speech falls more than a few entries behind it skips to the latest.
 */
export function useNarrationSpeech(state: TableState, enabled: boolean): void {
  const lastId = useRef<string | undefined>(state.log.at(-1)?.id);
  useEffect(() => {
    const log = state.log;
    const from = lastId.current ? log.findIndex((e) => e.id === lastId.current) + 1 : log.length;
    lastId.current = log.at(-1)?.id;
    if (!enabled) return;
    let fresh = log.slice(from).filter((e): e is Narration => e.type === "narration");
    if (!fresh.length) return;
    if (queued > 12 || lines.length > 12) stopSpeaking();
    if (fresh.length > 3) fresh = fresh.slice(-3);
    const voices = state.missionVoices;
    void kokoroReady().then(() => {
      for (const e of fresh) speakNarration(e, voices);
    });
  }, [state.log, enabled]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (!enabled) stopSpeaking();
  }, [enabled]);
}

/** Voices load asynchronously in Chrome; nudge the list so the first line gets a good voice. */
if (synth) {
  synth.getVoices();
  synth.addEventListener?.("voiceschanged", () => synth.getVoices());
}
