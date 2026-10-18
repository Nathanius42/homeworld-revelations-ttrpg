import { useEffect, useRef, useState } from "react";
import type { CampaignSummary } from "@hwr/protocol";
import { displayUrl, useJoinOrigin } from "../join";
import { cx } from "../util";
import { NetworkHelp, type NetworkProfile } from "./NetworkHelp";
import { QrCode } from "./QrCode";

interface HostInfo {
  port: number;
  addresses: { address: string; adapter: string; virtual: boolean; hotspot?: boolean }[];
  profiles: NetworkProfile[];
  devices: { address: string; tableCode: string; name: string; role: string; since: number }[];
  remoteDevices: number;
  uptimeSeconds: number;
  tables: { code: string; name: string; phase: string; missionTitle: string; players: number; updatedAt: number }[];
  campaigns: CampaignSummary[];
  ai: boolean;
  /** Where the Claude key came from, and its last four characters. The key itself never leaves the server. */
  claude: { source?: "env" | "console"; hint: string };
  private: Record<string, boolean>;
}

interface MissionSummary {
  id: string;
  title: string;
  recommendedPlayers: string;
}

/** How long to wait for a first phone before offering network help unasked. */
const HELP_AFTER_MS = 60_000;

const PHASE: Record<string, string> = { lobby: "In the lobby", playing: "Playing", ended: "Finished" };

/**
 * One page on the laptop to run the evening: how friends join, whether their phones have
 * reached the laptop, the tables, the TV, and stopping the server. Only opens on this PC.
 */
export function HostConsole() {
  const [info, setInfo] = useState<HostInfo>();
  const [error, setError] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [selected, setSelectedCode] = useState<string>();
  // The TV follows whichever table is picked here.
  const setSelected = (code: string) => {
    setSelectedCode(code);
    void fetch("/api/host/current", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => undefined);
  };
  // Chrome and Edge say whether the desktop spans more than one screen; elsewhere it's unknown.
  const extended = (window.screen as Screen & { isExtended?: boolean }).isExtended;
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [missionId, setMissionId] = useState("");
  const [shipName, setShipName] = useState("Kharsaan's Promise");
  const [stopped, setStopped] = useState(false);
  const [help, setHelp] = useState<"auto" | "open" | "closed">("auto");
  const [waitingSince, setWaitingSince] = useState<number>();
  const everConnected = useRef(false);
  const origin = useJoinOrigin();

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/host")
        .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
        .then((d: HostInfo) => {
          if (!alive) return;
          setInfo(d);
          setError("");
        })
        .catch((e: Error) => alive && setError(e.message || "Can't reach the server."));
    void load();
    const timer = setInterval(load, 2000);
    fetch("/api/missions")
      .then((r) => r.json())
      .then((m: MissionSummary[]) => {
        setMissions(m);
        setMissionId((id) => id || m[0]?.id || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const active = info?.tables.filter((t) => t.phase !== "ended") ?? [];
  const table = info?.tables.find((t) => t.code === selected) ?? active[0];
  const joinUrl = table ? `${origin}/t/${table.code}` : origin;

  // The clock for unasked help starts when there's a table to join, and stops for good once any phone gets through.
  if (info && info.remoteDevices > 0) everConnected.current = true;
  useEffect(() => {
    if (table && waitingSince === undefined) setWaitingSince(Date.now());
  }, [table, waitingSince]);
  const overdue = !everConnected.current && waitingSince !== undefined && Date.now() - waitingSince > HELP_AFTER_MS;
  const showHelp = help === "open" || (help === "auto" && overdue);

  async function newTable() {
    const res = await fetch("/api/tables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: shipName, missionId }) });
    if (res.ok) setSelected(((await res.json()) as { code: string }).code);
  }

  async function reopen(campaignId: string) {
    setCampaignError("");
    const res = await fetch("/api/campaigns/reopen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId }) }).catch(() => undefined);
    const body = (await res?.json().catch(() => ({}))) as { code?: string; error?: string };
    if (res?.ok && body.code) setSelected(body.code);
    else setCampaignError(body.error ?? "Couldn't reach the game server.");
  }

  async function quit() {
    if (!confirm("Stop the game server? Everyone will be disconnected. Saves are kept.")) return;
    await fetch("/api/host/quit", { method: "POST" }).catch(() => undefined);
    setStopped(true);
  }

  if (stopped) {
    return (
      <div className="host-page">
        <div className="frame host-stopped">
          <h2>Server stopped</h2>
          <p className="dim">Saves are kept. Start HWR-App again to carry on.</p>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="host-page">
        <div className="frame host-stopped">
          <h2>Host console</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="host-page">
      <header className="host-head">
        <img src="/kushan.svg" alt="" />
        <h1>Host console</h1>
        <span className="spacer" />
        <span className={cx("host-status", info && info.remoteDevices > 0 ? "ok" : "waiting")}>
          {info ? (info.remoteDevices > 0 ? `${info.remoteDevices} other device${info.remoteDevices === 1 ? "" : "s"} connected` : "No other devices yet") : "Connecting…"}
        </span>
        <button className="btn small" onClick={() => setHelp(showHelp ? "closed" : "open")}>
          Network help
        </button>
        <button className="btn small danger" onClick={() => void quit()}>
          Quit server
        </button>
      </header>

      {showHelp && info && <NetworkHelp port={info.port} addresses={info.addresses} profiles={info.profiles ?? []} code={table?.code} onClose={() => setHelp("closed")} />}

      <div className="host-grid">
        <section className="frame host-join">
          <div className="panel-title">Join on your phone{table ? ` · ${table.name}` : ""}</div>
          <div className="panel-body host-join-body">
            {table ? (
              <>
                <QrCode text={joinUrl} size={280} label="Scan to join this table" />
                <div>
                  <div className="tv-code">{table.code}</div>
                  <div className="mono">{displayUrl(joinUrl)}</div>
                  <div className="dim" style={{ marginTop: 8 }}>
                    {table.missionTitle} · {PHASE[table.phase] ?? table.phase}
                  </div>
                  <div className="host-actions">
                    <button className="btn primary" onClick={() => window.open("/tv", "hwr-tv")}>
                      Open TV view
                    </button>
                    <a className="btn" href={`/t/${table.code}`} target="_blank" rel="noreferrer">
                      Join as a player
                    </a>
                  </div>
                  <div className="dim" style={{ fontSize: 14, marginTop: 8 }}>
                    The TV view shows whichever table is selected here. With the TV plugged in, HWR-App opens it there full screen by itself; otherwise drag the TV window onto the TV
                    and press F11.
                  </div>
                  {extended === false && (
                    <div className="host-help-alert" style={{ fontSize: 14, marginTop: 6 }}>
                      Only one screen is in use. If the TV is plugged in and showing a copy of this screen, press Windows+P and choose Extend so the TV can show the story
                      instead.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="dim">Start a table to get a code and QR for everyone to join.</p>
            )}
          </div>
        </section>

        <section className="frame">
          <div className="panel-title">New table</div>
          <div className="panel-body host-new">
            <label className="label" htmlFor="hn">
              Ship name
            </label>
            <input id="hn" value={shipName} maxLength={40} onChange={(e) => setShipName(e.target.value)} />
            <label className="label" htmlFor="hm">
              Mission
            </label>
            <select id="hm" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
              {missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m.recommendedPlayers})
                </option>
              ))}
            </select>
            <button className="btn primary" disabled={!shipName.trim()} onClick={() => void newTable()}>
              Start a table
            </button>
          </div>
        </section>

        {info?.campaigns.length ? (
          <section className="frame" aria-label="Campaigns">
            <div className="panel-title">Campaigns</div>
            <div className="panel-body">
              <ul className="list host-tables">
                {info.campaigns.map((c) => (
                  <li key={c.id} className="host-campaign">
                    <div>
                      <b>{c.name}</b>{" "}
                      <span className="dim">
                        · {c.chapters} chapter{c.chapters === 1 ? "" : "s"}
                        {c.lastMission ? `, last ${c.lastMission}` : ""} · {c.crew.join(", ")}
                      </span>
                    </div>
                    <button className="btn small" onClick={() => void reopen(c.id)}>
                      {c.phase === "ended" ? "Start the next chapter" : `Resume ${c.missionTitle}`}
                    </button>
                  </li>
                ))}
              </ul>
              {campaignError && <p className="host-help-alert">{campaignError}</p>}
            </div>
          </section>
        ) : null}

        <section className="frame">
          <div className="panel-title">Tables</div>
          <div className="panel-body">
            {info?.tables.length ? (
              <ul className="list host-tables">
                {info.tables.map((t) => (
                  <li key={t.code}>
                    <button className={cx("host-table", t.code === table?.code && "selected")} onClick={() => setSelected(t.code)}>
                      <b>{t.code}</b> {t.name} <span className="dim">· {t.missionTitle} · {PHASE[t.phase] ?? t.phase} · {t.players} crew</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">No tables yet.</p>
            )}
          </div>
        </section>

        <section className="frame">
          <div className="panel-title">Connected</div>
          <div className="panel-body">
            {info?.devices.length ? (
              <ul className="list">
                {info.devices.map((d, i) => (
                  <li key={i}>
                    <b>{d.name}</b> <span className="dim">· {d.role} at {d.tableCode} · {d.address.replace(/^::ffff:/, "")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">Nobody yet. When a phone scans the QR code it appears here, which means the network is working.</p>
            )}
          </div>
        </section>

        <ClaudeKey info={info} onChange={() => void fetch("/api/host").then((r) => r.json()).then(setInfo)} />

        <section className="frame">
          <div className="panel-title">This laptop</div>
          <div className="panel-body">
            <div className="label">Addresses</div>
            <ul className="list">
              {info?.addresses.map((a) => (
                <li key={a.address} className={cx(a.virtual && "dim")}>
                  <span className="mono">
                    {a.address}:{info.port}
                  </span>{" "}
                  · {a.adapter}
                  {a.virtual ? " (virtual: phones usually can't reach this)" : ""}
                </li>
              ))}
            </ul>
            <div className="label" style={{ marginTop: 10 }}>
              Extras on this PC
            </div>
            <div className="dim">
              Claude GM {info?.ai ? "available" : "off (no API key)"} · ship models {info?.private.ships ? "yes" : "no"} · family portraits {info?.private.portraits ? "yes" : "no"} · music{" "}
              {info?.private.music ? "yes" : "no"} · game sounds {info?.private.sfx ? "yes" : "no"} · private missions{" "}
              {info?.private.missions ? "yes" : "no"}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The Claude GM's key, pasted here instead of edited into a file. The server checks it with
 * Anthropic before saving it beside the saves, and live tables can use it at once.
 */
function ClaudeKey({ info, onChange }: { info?: HostInfo; onChange: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const claude = info?.claude;

  async function save() {
    setBusy(true);
    setMessage(undefined);
    const res = await fetch("/api/host/claude-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key.trim() }) }).catch(() => undefined);
    const body = (await res?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res?.ok) {
      setKey("");
      setMessage({ ok: true, text: "Key checked and saved. New and open tables can use the Claude GM now." });
      onChange();
    } else {
      setMessage({ ok: false, text: body.error ?? "Couldn't reach the game server." });
    }
  }

  async function remove() {
    if (!confirm("Remove the Claude key from this PC? Tables carry on with the Director.")) return;
    await fetch("/api/host/claude-key", { method: "DELETE" }).catch(() => undefined);
    setMessage({ ok: true, text: "Key removed. The Director runs every table." });
    onChange();
  }

  return (
    <section className="frame host-claude" aria-label="Claude GM">
      <div className="panel-title">Claude GM</div>
      <div className="panel-body">
        {claude?.source === "env" ? (
          <p>
            On, with the key from this PC's <span className="mono">.env</span> file (<span className="mono">{claude.hint}</span>). Change it there and restart to use a different one.
          </p>
        ) : claude?.source === "console" ? (
          <>
            <p>
              On, with key <span className="mono">{claude.hint}</span> saved on this PC.
            </p>
            <button className="btn small" onClick={() => void remove()}>
              Remove key
            </button>
          </>
        ) : (
          <>
            <p className="dim">
              Off: the Director runs the game, which is free. For the Claude GM, paste an API key from the Claude Console (console.anthropic.com, API keys). It uses Claude Haiku, about
              a few cents a session, paid from that account's API credit.
            </p>
            <label className="label" htmlFor="ck">
              Claude API key
            </label>
            <input id="ck" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn primary" disabled={busy || !key.trim()} onClick={() => void save()}>
              {busy ? "Checking…" : "Check and save"}
            </button>
          </>
        )}
        {message && <p className={message.ok ? "host-claude-ok" : "host-help-alert"}>{message.text}</p>}
      </div>
    </section>
  );
}

