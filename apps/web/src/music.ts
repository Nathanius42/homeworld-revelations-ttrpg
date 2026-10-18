/**
 * Mood music from the soundtracks on this PC (tools/music/build.py). The mission says what each
 * scene should feel like; battles and endings pick their own. Tracks crossfade when the mood
 * changes, play on within a mood, and dip while a voice is reading.
 *
 * A mission can name its own set (the desert missions use "kharak"); its tracks come first for
 * each mood, and the general moods fill any gap.
 *
 * Each device has its own switch: the TV plays by default and phones stay quiet. Without the
 * private music folder there's no playlist, and the synthesised drone plays as before.
 */
import { useEffect, useState } from "react";
import type { Mood, TableState } from "@hwr/protocol";
import { isMuted, onDuck, onMuteChange, setDroneEnabled } from "./audio";

interface Track {
  url: string;
  title: string;
  album: string;
}

type Moods = Partial<Record<Mood, Track[]>>;
interface Playlist {
  moods: Moods;
  sets?: Record<string, Moods>;
}

const VOLUME = 0.45;
const DUCKED = 0.12;
const FADE_MS = 3000;
/** If a mood has no tracks, the nearest that does. */
const FALLBACK: Record<Mood, Mood[]> = {
  lobby: ["briefing", "exploring"],
  briefing: ["lobby", "exploring"],
  exploring: ["mystery", "briefing"],
  mystery: ["exploring", "tension"],
  tension: ["mystery", "combat", "exploring"],
  combat: ["tension"],
  victory: ["exploring", "briefing"],
  loss: ["mystery", "exploring"],
};

export function moodFor(s: TableState): Mood {
  if (s.phase === "lobby") return "lobby";
  if (s.phase === "ended") return s.scene.mood === "loss" ? "loss" : "victory";
  if (s.scene.mode === "action" || s.scene.mode === "space") return "combat";
  if (s.scene.mood) return s.scene.mood;
  return s.pools.threat >= 10 ? "tension" : "exploring";
}

let playlist: Playlist | null | undefined;
let loading: Promise<Playlist | null> | undefined;

function loadPlaylist(): Promise<Playlist | null> {
  loading ??= fetch("/api/music")
    .then((r) => (r.ok ? (r.json() as Promise<Playlist>) : null))
    .then((d) => (playlist = d ?? null))
    .catch(() => (playlist = null));
  return loading;
}

/** What's asked for: a mood, and the mission's music set if it has one. */
interface Want {
  mood: Mood;
  set?: string;
}

let current: { el: HTMLAudioElement; key: string; track: Track } | undefined;
let wanted: Want | undefined;
let ducked = false;
let enabled = false;
const recent: string[] = [];

function level(): number {
  return isMuted() || !enabled ? 0 : ducked ? DUCKED : VOLUME;
}

function fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void): void {
  const from = el.volume;
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

const keyOf = (w: Want) => `${w.set ?? ""}:${w.mood}`;

function tracksFor(w: Want): Track[] {
  const chain = [w.mood, ...FALLBACK[w.mood]];
  for (const moods of [w.set ? playlist?.sets?.[w.set] : undefined, playlist?.moods]) {
    for (const m of chain) {
      const list = moods?.[m];
      if (list?.length) return list;
    }
  }
  return [];
}

function pick(w: Want): Track | undefined {
  const list = tracksFor(w);
  const fresh = list.filter((t) => !recent.includes(t.url));
  const pool = fresh.length ? fresh : list;
  const track = pool[Math.floor(Math.random() * pool.length)];
  if (track) {
    recent.push(track.url);
    if (recent.length > 6) recent.shift();
  }
  return track;
}

function play(w: Want): void {
  const track = pick(w);
  if (!track) return;
  const el = new Audio(track.url);
  el.volume = 0;
  el.preload = "auto";
  // Within a mood, move on to another track when this one ends.
  el.addEventListener("ended", () => {
    if (current?.el === el && wanted) play(wanted);
  });
  const old = current;
  current = { el, key: keyOf(w), track };
  el.play().then(
    () => fade(el, level(), FADE_MS),
    () => {
      // Blocked until the page is clicked once; try again then.
      if (current?.el === el) current = old;
      window.addEventListener("pointerdown", () => wanted && enabled && play(wanted), { once: true });
    },
  );
  if (old) fade(old.el, 0, FADE_MS, () => old.el.pause());
  setDroneEnabled(false);
}

function stop(): void {
  const old = current;
  current = undefined;
  if (old) fade(old.el, 0, 800, () => old.el.pause());
  setDroneEnabled(true);
}

function apply(w: Want): void {
  wanted = w;
  if (!enabled || !playlist) return;
  if (current && (current.key === keyOf(w) || tracksFor(w)[0] === undefined)) return;
  play(w);
}

onDuck((on) => {
  ducked = on;
  if (current) fade(current.el, level(), 600);
});
onMuteChange(() => {
  if (current) fade(current.el, level(), 400);
});

// Per-device switch, like the voice switch: on for the TV, off for phones.
const key = (tv: boolean) => (tv ? "hwr.music.tv" : "hwr.music");
const listeners = new Set<() => void>();

function readPref(tv: boolean): boolean {
  try {
    const v = localStorage.getItem(key(tv));
    return v === null ? tv : v === "1";
  } catch {
    return tv;
  }
}

export function setMusicEnabled(tv: boolean, on: boolean): void {
  try {
    localStorage.setItem(key(tv), on ? "1" : "0");
  } catch {
    // Storage can be refused in private windows; the switch still works for this visit.
  }
  for (const l of listeners) l();
}

export function useMusicEnabled(tv: boolean): boolean {
  const [on, set] = useState(() => readPref(tv));
  useEffect(() => {
    const l = () => set(readPref(tv));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [tv]);
  return on;
}

/** True once the playlist has loaded and has tracks: only then is there anything to switch. */
export function useMusicAvailable(): boolean {
  const [ok, setOk] = useState(Boolean(playlist));
  useEffect(() => {
    void loadPlaylist().then((p) => setOk(Boolean(p && Object.keys(p.moods).length)));
  }, []);
  return ok;
}

/** Plays the table's mood while this device has music switched on. */
export function useTableMusic(state: TableState, on: boolean): Mood {
  const mood = moodFor(state);
  const set = state.missionMusic;
  useEffect(() => {
    enabled = on;
    void loadPlaylist().then(() => {
      if (!on) return stop();
      apply({ mood, set });
    });
  }, [mood, set, on]);
  useEffect(() => () => stop(), []);
  return mood;
}

/** What's playing, for the HUD's tooltip. */
export function nowPlaying(): string {
  return current ? `${current.track.title} · ${current.track.album}` : "";
}
