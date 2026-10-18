/**
 * Synthesised sound: a quiet ambient drone and a few UI cues, made live with the Web Audio API
 * so there are no audio files to license or ship. Browsers only allow audio after a user
 * gesture, so the context starts on the first click.
 */
import { prefs } from "./store";

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let droneStarted = false;
let muted = prefs.muted();
const listeners = new Set<(m: boolean) => void>();

function context(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  prefs.setMuted(m);
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.2);
  for (const l of listeners) l(m);
}

let ducked = false;
const duckListeners = new Set<(on: boolean) => void>();

/** Lowers the drone (and tells the music) while a voice is speaking so the words stay clear. */
export function duck(on: boolean): void {
  if (ducked === on) return;
  ducked = on;
  if (ctx && master && !muted) master.gain.setTargetAtTime(on ? 0.2 : 0.6, ctx.currentTime, 0.3);
  for (const l of duckListeners) l(on);
}

export function onDuck(l: (on: boolean) => void): () => void {
  duckListeners.add(l);
  return () => duckListeners.delete(l);
}

let droneOut: GainNode | undefined;
let droneWanted = true;

/** The drone steps aside while soundtrack music is playing. */
export function setDroneEnabled(on: boolean): void {
  droneWanted = on;
  if (ctx && droneOut) droneOut.gain.setTargetAtTime(on ? 0.08 : 0, ctx.currentTime, 0.8);
}

export function onMuteChange(l: (m: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** A slow, dark pad: two detuned low oscillators through a breathing low-pass filter. */
export function startDrone(): void {
  const ac = context();
  if (!ac || !master || droneStarted) return;
  droneStarted = true;
  const out = ac.createGain();
  droneOut = out;
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(droneWanted ? 0.08 : 0, ac.currentTime + 6);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 3;
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  for (const [freq, type] of [
    [55, "sawtooth"],
    [55.4, "sawtooth"],
    [82.4, "triangle"],
    [110.2, "sine"],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = type === "sawtooth" ? 0.35 : 0.5;
    osc.connect(g).connect(filter);
    osc.start();
  }
  filter.connect(out).connect(master);
}

function tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = "sine"): void {
  const ac = context();
  if (!ac || !master) return;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  const t = ac.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noise(start: number, duration: number, gain: number, freq: number): void {
  const ac = context();
  if (!ac || !master) return;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 2;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(ac.currentTime + start);
}

/**
 * Homeworld's own sound effects, when this PC has them (tools/sfx/build.py). Each event can have
 * a few variants; one is picked at random. Without them every cue falls back to a synthesised one.
 */
export type GameSound = "comms" | "objective" | "combat" | "success" | "threat" | "jumpOut" | "jumpIn" | "explosion" | "hullHit" | "weapon" | "click";

const samples = new Map<GameSound, AudioBuffer[]>();
let samplesLoading: Promise<void> | undefined;

/** Fetches and decodes the game sounds once; safe to call often. */
export function loadGameSounds(): Promise<void> {
  samplesLoading ??= (async () => {
    const res = await fetch("/api/sfx").catch(() => undefined);
    if (!res?.ok) return;
    const { events } = (await res.json()) as { events: Partial<Record<GameSound, string[]>> };
    const ac = context();
    if (!ac) return;
    await Promise.all(
      Object.entries(events).map(async ([event, urls]) => {
        const buffers = await Promise.all(
          (urls ?? []).map((u) =>
            fetch(u)
              .then((r) => r.arrayBuffer())
              .then((b) => ac.decodeAudioData(b))
              .catch(() => undefined),
          ),
        );
        const ok = buffers.filter((b): b is AudioBuffer => Boolean(b));
        if (ok.length) samples.set(event as GameSound, ok);
      }),
    );
  })();
  return samplesLoading;
}

/** Plays a game sound if loaded; returns false so the caller can synthesise instead. */
function sample(event: GameSound, gain = 0.8): boolean {
  const list = samples.get(event);
  const ac = context();
  if (!list?.length || !ac || !master) return false;
  const src = ac.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)]!;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return true;
}

export const sfx = {
  /** Dice tumbling across the tray. */
  dice(count = 2): void {
    for (let i = 0; i < 6 + count * 2; i++) noise(i * 0.07 + Math.random() * 0.04, 0.05, 0.25, 1800 + Math.random() * 2400);
  },
  success(): void {
    if (sample("success")) return;
    tone(659.3, 0, 0.5, 0.12);
    tone(880, 0.09, 0.6, 0.1);
    tone(1318.5, 0.18, 0.9, 0.07);
  },
  failure(): void {
    if (sample("threat", 0.6)) return;
    tone(98, 0, 0.8, 0.22, "triangle");
    tone(73.4, 0.12, 1, 0.18, "triangle");
  },
  /** Fleet Command speaking: a short comms chirp. */
  comms(): void {
    if (sample("comms")) return;
    tone(1760, 0, 0.06, 0.05, "square");
    tone(2349, 0.07, 0.08, 0.04, "square");
  },
  threat(): void {
    if (sample("threat")) return;
    tone(65.4, 0, 1.2, 0.25, "sawtooth");
  },
  click(): void {
    if (sample("click", 0.5)) return;
    tone(1200, 0, 0.04, 0.04, "square");
  },
  /** A new objective or truth: Fleet Intelligence's objective ping. */
  objective(): void {
    if (sample("objective")) return;
    tone(1046.5, 0, 0.12, 0.06);
    tone(1568, 0.1, 0.2, 0.05);
  },
  /** A fight or ship battle breaks out. */
  combat(): void {
    if (sample("combat")) return;
    tone(220, 0, 0.15, 0.12, "square");
    tone(220, 0.22, 0.15, 0.12, "square");
  },
  /** The fleet jumping: out at the start of a mission, in at the end. */
  jump(out: boolean): void {
    if (sample(out ? "jumpOut" : "jumpIn")) return;
    tone(out ? 220 : 880, 0, 0.6, 0.08, "sine");
    tone(out ? 880 : 220, 0.3, 0.6, 0.06, "sine");
  },
  explosion(): void {
    if (sample("explosion")) return;
    noise(0, 0.6, 0.35, 300);
  },
  hullHit(): void {
    if (sample("hullHit")) return;
    noise(0, 0.25, 0.3, 900);
  },
  weapon(): void {
    if (sample("weapon", 0.6)) return;
    tone(440, 0, 0.12, 0.06, "sawtooth");
  },
};
