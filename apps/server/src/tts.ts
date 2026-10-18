import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { hasPrivate, privateDir } from "./private-assets.js";

/**
 * Narration voices from Kokoro, a small open text-to-speech model (Apache 2.0) that runs on this
 * PC's CPU. The model and voices live in reference/tts/kokoro; loading from the internet is
 * switched off, so it works offline. Without them the client keeps the browser's own voices.
 *
 * Kokoro runs in a worker thread (tts-worker.ts), so the game never waits on speech. Each line
 * is timed against the audio it makes: on a PC too slow to keep up (making speech slower than it
 * plays), new lines are refused as "slow" and the clients switch to the browser's voices, rather
 * than narration falling further and further behind the game.
 */

/** English voices the client may ask for: American (a) and British (b), female (f) and male (m). */
export const VOICES = [
  "af_heart", "af_bella", "af_nicole", "af_sarah", "am_michael", "am_adam", "am_onyx", "am_eric",
  "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable",
] as const;
export type Voice = (typeof VOICES)[number];

export const MAX_TEXT = 600;
const CACHE_ENTRIES = 300;
/** Making speech must take well under its playing time, or narration can't keep up with the table. */
export const SLOW_RATIO = 0.8;

export class TtsSlowError extends Error {
  constructor() {
    super("This PC makes speech too slowly to keep up; the browser's voices take over.");
  }
}

type WorkerMessage =
  | { type: "ready"; threads: number }
  | { type: "failed"; message: string }
  | { type: "done"; id: number; wav: ArrayBuffer; ms: number; seconds: number }
  | { type: "error"; id: number; message: string };

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (wav: Buffer) => void; reject: (err: Error) => void }>();
/** Lines the worker is making right now (at most one: they're queued). */
const inWorker = new Set<number>();
/** Generation time divided by audio time, for the last few lines. */
const ratios: number[] = [];
let slow = false;
let log: (msg: string) => void = () => undefined;

/** The worker's file: beside this module in the repo (.ts under tsx) and in the portable build (.mjs). */
function workerUrl(): URL {
  return new URL(import.meta.url.endsWith(".ts") ? "./tts-worker.ts" : "./tts-worker.mjs", import.meta.url);
}

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(workerUrl(), { workerData: { modelDir: privateDir("tts") + "/" } });
  const started = Date.now();
  w.on("message", (m: WorkerMessage) => {
    if (m.type === "ready") log(`Kokoro voices ready in ${Date.now() - started} ms (${m.threads} threads)`);
    else if (m.type === "failed") log(`Kokoro voices unavailable: ${m.message}`);
    else if (m.type === "done") {
      inWorker.delete(m.id);
      record(m.ms / 1000 / Math.max(m.seconds, 0.1));
      pending.get(m.id)?.resolve(Buffer.from(m.wav));
      pending.delete(m.id);
    } else if (m.type === "error") {
      inWorker.delete(m.id);
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  });
  w.on("error", (err) => {
    log(`Kokoro worker stopped: ${err.message}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    inWorker.clear();
    worker = undefined;
  });
  w.unref();
  worker = w;
  return w;
}

/** Keeps the last three timings; two or more above SLOW_RATIO on average marks this PC as too slow for the session. */
function record(ratio: number): void {
  ratios.push(ratio);
  if (ratios.length > 3) ratios.shift();
  const average = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (!slow && ratios.length >= 2 && average > SLOW_RATIO) {
    slow = true;
    log(`Kokoro is too slow on this PC (${average.toFixed(2)}x real time); narration uses the browser's voices`);
  }
}

/** Set once the server is stopping: no new speech is started. */
let closing = false;

/**
 * Stops Kokoro before the process exits. Exiting while the worker is inside the voice model's
 * native code crashes the process (Windows fail-fast), which the launcher reports as the server
 * stopping, and terminating the worker can't interrupt that code either. So: refuse new lines,
 * fail the ones waiting so their requests end, let the line in progress finish (a second or
 * two; at most one runs at a time), then terminate the idle worker.
 */
export async function stopSpeech(maxWaitMs = 10_000): Promise<void> {
  closing = true;
  const err = new Error("The server is stopping.");
  for (const p of pending.values()) p.reject(err);
  pending.clear();
  const w = worker;
  if (!w) return;
  const until = Date.now() + maxWaitMs;
  while (inWorker.size > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  worker = undefined;
  await w.terminate().catch(() => undefined);
}

export function ttsAvailable(): boolean {
  return hasPrivate("tts");
}

/** Whether this PC has proved too slow for Kokoro this session. */
export function ttsSlow(): boolean {
  return slow;
}

/** Starts the worker and loads the model in the background, so the first line isn't slow. */
export function warmUp(logger: (msg: string) => void): void {
  log = logger;
  if (ttsAvailable()) {
    start();
    speakingAhead = true;
  }
}

/** Only the running server makes speech ahead (it calls warmUp); tests and tools never do. */
let speakingAhead = false;

export function validRequest(body: unknown): { text: string; voice: Voice; speed: number } | string {
  const b = (body ?? {}) as { text?: unknown; voice?: unknown; speed?: unknown };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return "No text to speak.";
  if (text.length > MAX_TEXT) return `Text is longer than ${MAX_TEXT} characters; send it a sentence or two at a time.`;
  if (!VOICES.includes(b.voice as Voice)) return "Unknown voice.";
  const speed = typeof b.speed === "number" && b.speed >= 0.7 && b.speed <= 1.3 ? b.speed : 1;
  return { text, voice: b.voice as Voice, speed };
}

/** Generated lines, most recent last; repeated lines (and other devices asking for the same line) come back at once. */
const cache = new Map<string, Promise<Buffer>>();
/** One line at a time: the worker's model already uses most cores, and two at once only slows both. */
let queue: Promise<unknown> = Promise.resolve();
/** Lines queued or being made right now. */
let waiting = 0;
/** Lines made ahead of time are only queued while the queue is this short, so a slow PC never builds a backlog. */
const PREFETCH_DEPTH = 4;

export function speak(text: string, voice: Voice, speed: number): Promise<Buffer> {
  const key = createHash("sha1").update(`${voice}|${speed}|${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (slow) return Promise.reject(new TtsSlowError());
  if (closing) return Promise.reject(new Error("The server is stopping."));
  waiting++;
  const job = queue.then(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        if (slow) return reject(new TtsSlowError());
        if (closing) return reject(new Error("The server is stopping."));
        const id = nextId++;
        pending.set(id, { resolve, reject });
        inWorker.add(id);
        start().postMessage({ id, text, voice, speed });
      }),
  );
  queue = job.catch(() => undefined);
  void job.then(
    () => waiting--,
    () => waiting--,
  );
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return job;
}

/**
 * Starts making a line before anyone asks for it (the server calls this as narration is logged),
 * so the TV usually finds it ready. Skipped when Kokoro isn't here, is too slow, or is busy.
 */
export function prefetch(text: string, voice: string, speed: number): void {
  if (!speakingAhead || slow || waiting >= PREFETCH_DEPTH) return;
  const ask = validRequest({ text, voice, speed });
  if (typeof ask === "string") return;
  speak(ask.text, ask.voice, ask.speed).catch(() => undefined);
}

