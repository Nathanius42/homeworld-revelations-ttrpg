import { useEffect, useState } from "react";
import type { CampaignSummary } from "@hwr/protocol";
import { FleetArchive, useLocalShips } from "./FleetArchive";
import { prefs } from "../store";
import { bg } from "../util";

interface TableSummary {
  code: string;
  name: string;
  phase: string;
  missionTitle: string;
  players: number;
  updatedAt: number;
}

export function Title({ go }: { go: (path: string) => void }) {
  const [name, setName] = useState(prefs.name());
  const [shipName, setShipName] = useState("Kharsaan's Promise");
  const [code, setCode] = useState("");
  const [recent, setRecent] = useState<TableSummary[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [ai, setAi] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [archive, setArchive] = useState(false);
  const localShips = useLocalShips();

  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then(setRecent)
      .catch(() => setRecent([]));
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { ai: boolean }) => setAi(h.ai))
      .catch(() => setAi(undefined));
  }, []);

  const remember = () => prefs.setName(name.trim());

  async function create() {
    if (!name.trim()) return setError("Tell the fleet your name first.");
    remember();
    setBusy(true);
    try {
      const res = await fetch("/api/tables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: shipName }) });
      const { code } = (await res.json()) as { code: string };
      go(`/t/${code}`);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  /** Picks a saved campaign back up: its unfinished chapter, or the next one. */
  async function reopen(campaignId: string) {
    if (!name.trim()) return setError("Tell the fleet your name first.");
    remember();
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns/reopen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId }) });
      const body = (await res.json()) as { code?: string; error?: string };
      if (body.code) go(`/t/${body.code}`);
      else setError(body.error ?? "Couldn't reopen that campaign.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function join(target = code, role: "player" | "gm" | "spectator" = "player") {
    if (!name.trim()) return setError("Tell the fleet your name first.");
    const c = target.trim().toUpperCase();
    if (c.length !== 4) return setError("Table codes are four letters.");
    const res = await fetch(`/api/tables/${c}`);
    if (!res.ok) return setError("No table with that code.");
    remember();
    prefs.setRole(c, role);
    go(`/t/${c}`);
  }

  return (
    <div className="title-screen">
      <div className="title-hero" style={bg("/art/scenes/title.webp")}>
        <div className="title-logo">
          <h1>Homeworld</h1>
          <div className="sub">Revelations · Fleet Table</div>
        </div>
      </div>

      <div className="title-panels">
        <div className="frame">
          <div className="panel-title">Identify yourself</div>
          <div className="panel-body">
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" value={name} maxLength={32} placeholder="e.g. Nathan" onChange={(e) => setName(e.target.value)} />
            <div className="dim" style={{ fontSize: 15 }}>
              No GM needed. The {ai ? "Claude GM and the Director run" : "Director runs"} the mission: you and up to five friends play the crew of a Kushan corvette.
            </div>
            {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
            {localShips && (
              <button className="btn small" style={{ justifySelf: "start" }} onClick={() => setArchive(true)}>
                Fleet archive
              </button>
            )}
          </div>
        </div>

        <div className="frame">
          <div className="panel-title">Launch a new table</div>
          <div className="panel-body">
            <label className="label" htmlFor="ship">
              Your ship
            </label>
            <input id="ship" value={shipName} maxLength={48} onChange={(e) => setShipName(e.target.value)} />
            <button className="btn primary big" disabled={busy} onClick={create}>
              Launch
            </button>
            {campaigns.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 6 }}>
                  Or carry on a campaign
                </div>
                {campaigns.slice(0, 4).map((c) => (
                  <button key={c.id} className="recent-table" disabled={busy} onClick={() => void reopen(c.id)}>
                    <span style={{ flex: 1 }}>
                      {c.name}
                      <div className="dim" style={{ fontSize: 13 }}>
                        {c.chapters} chapter{c.chapters === 1 ? "" : "s"} · {c.crew.join(", ")} ·{" "}
                        {c.phase === "ended" ? "next chapter" : `resume ${c.missionTitle}`}
                      </div>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="frame">
          <div className="panel-title">Join a table</div>
          <div className="panel-body">
            <label className="label" htmlFor="code">
              Table code
            </label>
            <input
              id="code"
              value={code}
              maxLength={4}
              placeholder="ABCD"
              style={{ fontFamily: "var(--mono)", fontSize: 24, letterSpacing: "0.3em", textTransform: "uppercase" }}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => join()}>
                Join as crew
              </button>
              <button className="btn small" onClick={() => join(code, "gm")}>
                As GM
              </button>
              <button className="btn small" onClick={() => join(code, "spectator")}>
                Watch
              </button>
            </div>
            {recent.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 6 }}>
                  Recent tables
                </div>
                {recent.slice(0, 4).map((t) => (
                  <button key={t.code} className="recent-table" onClick={() => join(t.code)}>
                    <span className="code">{t.code}</span>
                    <span style={{ flex: 1 }}>
                      {t.name}
                      <div className="dim" style={{ fontSize: 13 }}>
                        {t.missionTitle} · {t.phase === "lobby" ? "in the lobby" : t.phase === "ended" ? "finished" : "in progress"} · {t.players} crew
                      </div>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {archive && <FleetArchive onClose={() => setArchive(false)} />}
      <div className="footer-note">A private fan project for the Homeworld: Revelations tabletop RPG. Not affiliated with Gearbox, Blackbird Interactive or Modiphius.</div>
    </div>
  );
}
