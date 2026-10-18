import type { TableState } from "@hwr/protocol";
import { useEffect, useState } from "react";
import { HostConsole } from "./components/HostConsole";
import { Lobby } from "./components/Lobby";
import { TableView } from "./components/TableView";
import { TvView } from "./components/TvView";
import { Title } from "./components/Title";
import { useMusicAvailable, useMusicEnabled, useTableMusic } from "./music";
import { moveSeat, prefs, useStore } from "./store";

function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return [
    path,
    (p: string) => {
      history.pushState(null, "", p);
      setPath(p);
    },
  ];
}

function TableRoute({ code, go, tv, follow = false }: { code: string; go: (p: string) => void; tv: boolean; follow?: boolean }) {
  const { status, state } = useStore();
  const [name, setName] = useState(tv ? "Table screen" : prefs.name());
  const [ready, setReady] = useState(tv || Boolean(prefs.name()));

  useEffect(() => {
    if (!ready) return;
    // The TV view always watches; it never takes a seat.
    useStore.getState().connect(code, name, tv ? "spectator" : prefs.role(code));
    return () => useStore.getState().disconnect();
  }, [code, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => {
    useStore.getState().disconnect();
    go("/");
  };

  // The campaign moved on to its next table: follow it, keeping this device's seat.
  const nextTable = state?.nextTable;
  useEffect(() => {
    // The TV at /tv follows the host's table by itself.
    if (!nextTable || nextTable === code || follow) return;
    moveSeat(code, nextTable);
    useStore.getState().disconnect();
    go(tv ? `/t/${nextTable}/tv` : `/t/${nextTable}`);
  }, [nextTable]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
        <div className="frame" style={{ width: "min(420px, 100%)" }}>
          <div className="panel-title">Joining table {code}</div>
          <form
            className="panel-body"
            style={{ display: "grid", gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              prefs.setName(name.trim());
              setReady(true);
            }}
          >
            <label className="label" htmlFor="jn">
              Your name
            </label>
            <input id="jn" autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!name.trim()}>
              Come aboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div className="waiting">
          <div className="scanner" /> {status === "closed" ? "Can't reach that table." : "Establishing link…"}
          {status === "closed" && (
            <button className="btn small" onClick={leave}>
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {status !== "open" && <div className="connection">Link lost · reconnecting</div>}
      <TableMusic state={state} tv={tv} />
      {tv ? <TvView state={state} /> : state.phase === "lobby" ? <Lobby state={state} /> : <TableView state={state} onLeave={leave} />}
    </>
  );
}

/** Mood music for the whole visit (lobby, table and TV), when this device has it switched on. */
function TableMusic({ state, tv }: { state: TableState; tv: boolean }) {
  const on = useMusicEnabled(tv);
  const available = useMusicAvailable();
  useTableMusic(state, on && available);
  return null;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [path, go] = usePath();
  const match = /^\/t\/([A-Za-z]{4})(\/tv)?\/?$/.exec(path);
  return (
    <>
      {match ? <TableRoute code={match[1]!.toUpperCase()} go={go} tv={Boolean(match[2])} /> : path.replace(/\/$/, "") === "/host" ? <HostConsole /> : /^\/tv(\/waiting)?\/?$/.test(path) ? <TvFollow go={go} /> : <Title go={go} />}
      <Toasts />
    </>
  );
}

/**
 * The TV screen the launcher and host console open: shows the table selected on the host
 * console and switches when the host picks or starts another, so the TV never needs re-aiming.
 * Before there's a table it says so in TV-sized type. Only answered on the game PC.
 */
function TvFollow({ go }: { go: (p: string) => void }) {
  const [code, setCode] = useState<string | null>();
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const check = () =>
      fetch("/api/host/current")
        .then((r) => {
          if (r.status === 403) setRefused(true);
          return r.ok ? (r.json() as Promise<{ code: string | null }>) : undefined;
        })
        .then((j) => j && setCode(j.code))
        .catch(() => undefined);
    void check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, []);
  if (code) return <TableRoute key={code} code={code} go={go} tv follow />;
  return (
    <div className="tv tv-lobby" style={{ display: "grid", placeItems: "center" }}>
      <div className="tv-lobby-card frame" style={{ textAlign: "center" }}>
        <img src="/icon-256.png" alt="" style={{ width: 120, margin: "0 auto 12px" }} />
        <h1>{refused ? "Open the TV view from the host" : "Waiting for a table"}</h1>
        <p>{refused ? "This screen follows the host console, so it only opens on the PC running the game. Scan the QR code to join instead." : code === undefined ? "Connecting to the game…" : "Start a table on the host console. The story appears here by itself."}</p>
      </div>
    </div>
  );
}
