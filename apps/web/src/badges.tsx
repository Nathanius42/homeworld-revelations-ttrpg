import { useEffect, useState } from "react";
import { cx } from "./util";

/**
 * The game's kiith badges, when this PC has them (tools/branding/badges.py). They're licensed, so
 * they live in the private folder; without them the server answers with no badges and the app
 * shows the kiith name alone.
 */
type Badges = Record<string, string>;

let badges: Badges | undefined;
let loading: Promise<Badges> | undefined;

function loadBadges(): Promise<Badges> {
  loading ??= fetch("/api/badges")
    .then((r) => (r.ok ? (r.json() as Promise<{ kiith: Badges }>) : { kiith: {} }))
    .then((d) => (badges = d.kiith))
    .catch(() => (badges = {}));
  return loading;
}

export function useBadges(): Badges {
  const [state, setState] = useState<Badges>(badges ?? {});
  useEffect(() => {
    if (badges) return;
    let live = true;
    void loadBadges().then((b) => live && setState(b));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** A kiith's badge, or nothing when there's no art for it on this PC. */
export function KiithBadge({ kiith, size = 18, className }: { kiith: string; size?: number; className?: string }) {
  const url = useBadges()[kiith];
  if (!url) return null;
  return <img className={cx("kiith-badge", className)} src={url} alt="" title={`Kiith ${kiith}`} width={size} height={size} />;
}
