import { useEffect, useRef, useState } from "react";
import type { TableState } from "@hwr/protocol";
import { useStore } from "../store";
import { waitingOn } from "../turn";
import { cx } from "../util";

/**
 * One line saying what the game is waiting for, on the TV and every phone. A phone that's needed
 * says "Your move" and buzzes once. While a tap is on its way it says "Sending…", and if the game
 * is slow to answer it says so, so a tap is never met with silence.
 */
/** How long the table can sit on the same call to action before the banner nudges. */
const STALE_MS = 45_000;

export function TurnBanner({ state, tv = false }: { state: TableState; tv?: boolean }) {
  const playerId = useStore((s) => s.playerId);
  const sentAt = useStore((s) => s.sentAt);
  const status = useStore((s) => s.status);
  const waiting = waitingOn(state, tv ? undefined : playerId);
  const mine = !tv && Boolean(waiting?.mine);

  // Re-render while a send is outstanding, so "Sending…" can turn into "Still waiting…".
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sentAt) return;
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [sentAt]);

  // A short buzz when this phone becomes needed (browsers that allow it).
  const wasMine = useRef(false);
  useEffect(() => {
    if (mine && !wasMine.current) navigator.vibrate?.(120);
    wasMine.current = mine;
  }, [mine]);

  // A quiet table: the same call to action for 45 seconds gets a gentle nudge (and one more buzz).
  const text = waiting?.text;
  const since = useRef({ text, at: Date.now() });
  if (since.current.text !== text) since.current = { text, at: Date.now() };
  const [, beat] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => beat((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const stale = Boolean(text) && Date.now() - since.current.at > STALE_MS;
  const nudged = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (stale && mine && nudged.current !== text) {
      navigator.vibrate?.([80, 80, 80]);
      nudged.current = text;
    }
  }, [stale, mine, text]);

  const waited = sentAt ? Date.now() - sentAt : 0;
  if (!tv && status !== "open") return <div className="turn-banner slow">Reconnecting to the game…</div>;
  if (!tv && sentAt && waited > 250)
    return <div className={cx("turn-banner", "sending", waited > 3000 && "slow")}>{waited > 3000 ? "Still waiting for the game to answer…" : "Sending…"}</div>;
  if (!waiting) return null;
  return (
    <div className={cx("turn-banner", mine && "mine", tv && "tv", stale && "stale")} role="status" aria-live="polite">
      {mine && <b>Your move · </b>}
      {stale && !mine && <b>Still waiting · </b>}
      {waiting.text}
    </div>
  );
}
