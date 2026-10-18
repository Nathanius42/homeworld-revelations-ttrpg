import { useEffect, useRef, useState } from "react";
import { TurnBanner } from "./TurnBanner";
import { setVoiceEnabled, speechSupported, useNarrationSpeech, useVoiceEnabled } from "../speech";
import { nowPlaying, setMusicEnabled, useMusicAvailable, useMusicEnabled } from "../music";
import type { StoryClock, TableState } from "@hwr/protocol";
import { ATTRIBUTES, ATTRIBUTE_LABELS, MOMENTUM_CAP, SKILLS, SKILL_LABELS } from "@hwr/rules-engine";
import { isMuted, loadGameSounds, onMuteChange, setMuted, sfx, startDrone } from "../audio";
import { useMe, useStore } from "../store";
import { bg, cx, partyOf } from "../util";
import { Dock } from "./Dock";
import { FleetArchive, useLocalShips } from "./FleetArchive";
import { HowToPlay } from "./HowToPlay";
import { Log } from "./Log";
import { Party, SheetModal } from "./Party";

export function Pools({ state }: { state: TableState }) {
  const threat = state.pools.threat;
  const clock = state.story?.clock;
  const last = useRef(threat);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (threat !== last.current) setBump((b) => b + 1);
    if (threat > last.current) sfx.threat();
    last.current = threat;
  }, [threat]);
  return (
    <div className="pools">
      <div className="pool" title="Group Momentum: spend it to buy dice or boost a success">
        <span className="label">Momentum</span>
        <span className="pips">
          {Array.from({ length: MOMENTUM_CAP }, (_, i) => (
            <i key={i} className={cx("pip-diamond", i < state.pools.momentum && "on")} />
          ))}
        </span>
      </div>
      <div className="pool" title="The GM's Threat pool: it buys trouble">
        <span className="label" style={{ color: "var(--amber)" }}>
          Threat
        </span>
        <span key={bump} className={cx("threat-value", bump > 0 && "bump")}>
          {threat}
        </span>
      </div>
      {clock && <Countdown clock={clock} />}
    </div>
  );
}

/** The campaign countdown, such as "Dreadnought awakening": one pip per step, filled as it runs on. */
export function Countdown({ clock }: { clock: StoryClock }) {
  return (
    <div className="pool countdown" title={`${clock.label}: ${clock.value} of ${clock.max}. Missions run it on; when it fills, the story turns.`}>
      <span className="label" style={{ color: "var(--danger)" }}>
        {clock.label}
      </span>
      <span className="pips" aria-label={`${clock.value} of ${clock.max}`}>
        {Array.from({ length: clock.max }, (_, i) => (
          <i key={i} className={cx("pip-diamond", "danger", i < clock.value && "on")} />
        ))}
      </span>
    </div>
  );
}

export function Panorama({ state }: { state: TableState }) {
  const scene = state.scene;
  const [layers, setLayers] = useState<string[]>([scene.art]);
  useEffect(() => {
    setLayers((l) => (l.at(-1) === scene.art ? l : [...l.slice(-1), scene.art]));
  }, [scene.art]);
  return (
    <div className="frame panorama">
      {layers.map((art, i) => (
        <div key={art} className="layer" style={{ ...bg(art), animation: i === layers.length - 1 && layers.length > 1 ? "fade-in 1.4s ease, drift 40s ease-in-out infinite alternate" : undefined }} />
      ))}
      {scene.mode === "action" && <div className="combat-banner">◆ Combat ◆</div>}
      {scene.mode === "space" && <div className="combat-banner">◆ Ship action ◆</div>}
      <div className="caption">
        <div>
          <div className="loc">{scene.location}</div>
          <h2>{scene.title}</h2>
        </div>
        <div className="truths">
          {scene.truths
            .filter((t) => !t.hidden)
            .map((t) => (
              <span key={t.id} className={cx("truth", t.kind)} title={t.kind}>
                {t.label}
              </span>
            ))}
          {state.extended && (
            <span className="truth" title="Extended test">
              {state.extended.label}: {state.extended.work - state.extended.workRemaining}/{state.extended.work} work · {state.extended.attemptsLeft} tries left
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GmConsole({ state }: { state: TableState }) {
  const send = useStore((s) => s.send);
  const [text, setText] = useState("");
  const [cause, setCause] = useState("");
  const [test, setTest] = useState({ characterId: "", attribute: "insight", skill: "exploration", difficulty: 1, reason: "" });
  const party = partyOf(state);
  return (
    <div className="frame">
      <div className="panel-title">GM console</div>
      <div className="panel-body gm-console">
        <textarea value={text} placeholder="Narrate to the table…" onChange={(e) => setText(e.target.value)} />
        <button
          className="btn"
          disabled={!text.trim()}
          onClick={() => {
            send({ type: "gmNarrate", text });
            setText("");
          }}
        >
          Narrate
        </button>
        <div className="row">
          <input style={{ flex: 1 }} value={cause} placeholder="Why does Threat change?" onChange={(e) => setCause(e.target.value)} />
          <button className="btn small amber" onClick={() => send({ type: "gmThreat", delta: 1, cause: cause || "the GM's doing" })}>
            +1
          </button>
          <button className="btn small amber" disabled={state.pools.threat < 1} onClick={() => send({ type: "gmThreat", delta: -1, cause: cause || "the GM spends Threat" })}>
            −1
          </button>
          <button className="btn small amber" disabled={state.pools.threat < 2} onClick={() => send({ type: "gmThreat", delta: -2, cause: cause || "a complication" })}>
            −2
          </button>
        </div>
        <div className="label">Call for a test</div>
        <div className="row">
          <select value={test.characterId} onChange={(e) => setTest({ ...test, characterId: e.target.value })}>
            <option value="">Anyone</option>
            {party.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={test.attribute} onChange={(e) => setTest({ ...test, attribute: e.target.value })}>
            {ATTRIBUTES.map((a) => (
              <option key={a} value={a}>
                {ATTRIBUTE_LABELS[a]}
              </option>
            ))}
          </select>
          <select value={test.skill} onChange={(e) => setTest({ ...test, skill: e.target.value })}>
            {SKILLS.map((k) => (
              <option key={k} value={k}>
                {SKILL_LABELS[k]}
              </option>
            ))}
          </select>
          <select value={test.difficulty} onChange={(e) => setTest({ ...test, difficulty: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                D{d}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <input style={{ flex: 1 }} value={test.reason} placeholder="What's at stake?" onChange={(e) => setTest({ ...test, reason: e.target.value })} />
          <button
            className="btn small"
            disabled={!test.reason.trim() || Boolean(state.pendingRoll)}
            onClick={() =>
              send({
                type: "gmCallTest",
                request: {
                  characterId: test.characterId || undefined,
                  attribute: test.attribute as (typeof ATTRIBUTES)[number],
                  skill: test.skill as (typeof SKILLS)[number],
                  difficulty: test.difficulty,
                  reason: test.reason,
                },
              })
            }
          >
            Call test
          </button>
        </div>
      </div>
    </div>
  );
}

interface Citation {
  title: string;
  who: string;
  portrait: string;
  detail: string;
}

/** Light-hearted awards for the debrief, from the server's running tallies. */
function citations(state: TableState): Citation[] {
  const stats = state.stats ?? {};
  const crew = partyOf(state).filter((s) => stats[s.id]);
  const out: Citation[] = [];
  const award = (title: string, score: (id: string) => number, detail: (n: number) => string, min = 1) => {
    const best = [...crew].sort((a, b) => score(b.id) - score(a.id))[0];
    if (!best || score(best.id) < min) return;
    out.push({ title, who: best.name, portrait: best.portrait, detail: detail(score(best.id)) });
  };
  award("Kiith's Favour", (id) => stats[id]!.crits, (n) => `${n} Kushan emblem${n === 1 ? "" : "s"} rolled`);
  award("Steady Hand", (id) => stats[id]!.passes, (n) => `${n} test${n === 1 ? "" : "s"} passed`);
  award("Shoulder to Lean On", (id) => stats[id]!.helped, (n) => `assisted ${n} time${n === 1 ? "" : "s"}`);
  award("Point of the Spear", (id) => stats[id]!.dealt, (n) => `${n} stress dealt`);
  award("Took the Hits", (id) => stats[id]!.taken, (n) => `${n} stress taken and still standing`);
  award("Tempted Fate", (id) => stats[id]!.complications, (n) => `${n} complication${n === 1 ? "" : "s"}`);
  return out;
}

/** Starts the next chapter with the same crew; every device at the table follows to it. */
async function continueCampaign(code: string): Promise<void> {
  const res = await fetch("/api/tables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ continueFrom: code }) }).catch(() => undefined);
  if (!res?.ok) useStore.getState().toast(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? "Couldn't start the next mission.");
}

function EndCard({ state, onLeave }: { state: TableState; onLeave: () => void }) {
  const awards = citations(state);
  return (
    <div className="frame">
      <div className="panel-title">Mission debrief</div>
      <div className="panel-body end-card">
        <div className="label">Requisition earned</div>
        <div className="ru">{state.awards?.ru ?? 0} RU</div>
        <ul className="list" style={{ textAlign: "left" }}>
          {state.awards?.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {awards.length > 0 && (
          <>
            <div className="label" style={{ marginTop: 8 }}>
              Crew citations
            </div>
            <div className="citations">
              {awards.map((c) => (
                <div key={c.title} className="citation">
                  <div className="face" style={bg(c.portrait)} />
                  <div>
                    <div className="ctitle">{c.title}</div>
                    <div style={{ fontWeight: 700 }}>{c.who}</div>
                    <div className="dim" style={{ fontSize: 13 }}>
                      {c.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {state.campaign && (
          <div className="dim" style={{ fontSize: 14 }}>
            Chapter {state.campaign.chapters.length} of {state.name}'s story · {state.campaign.ru} RU banked · each crew member has an advance to spend
          </div>
        )}
        <div className="host-actions" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => void continueCampaign(state.code)}>
            Continue the campaign
          </button>
          <button className="btn" onClick={onLeave}>
            Return to the fleet
          </button>
        </div>
      </div>
    </div>
  );
}

export function VoiceButton({ tv = false }: { tv?: boolean }) {
  const on = useVoiceEnabled(tv);
  if (!speechSupported()) return null;
  return (
    <button className={cx("btn small", on && "on")} title={on ? "The story is read aloud on this device" : "Read the story aloud on this device"} onClick={() => setVoiceEnabled(tv, !on)}>
      {on ? "Voice on" : "Voice off"}
    </button>
  );
}

export function MusicButton({ tv = false }: { tv?: boolean }) {
  const on = useMusicEnabled(tv);
  const available = useMusicAvailable();
  if (!available) return null;
  return (
    <button className={cx("btn small", on && "on")} title={on ? `Soundtrack on this device${nowPlaying() ? `: ${nowPlaying()}` : ""}` : "Play the soundtrack on this device"} onClick={() => setMusicEnabled(tv, !on)}>
      {on ? "Music on" : "Music off"}
    </button>
  );
}

function MuteButton() {
  const [muted, set] = useState(isMuted());
  useEffect(() => onMuteChange(set), []);
  return (
    <button className="btn small" title={muted ? "Sound off" : "Sound on"} onClick={() => setMuted(!muted)}>
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}

/**
 * Sound for the story's moments: Fleet Command's comms ping, new objectives, a fight breaking out,
 * the fleet jumping at the start and end, enemies destroyed and hits on our hull. Uses the game's
 * own sounds when this PC has them, synthesised cues otherwise.
 */
export function useGameSounds(state: TableState): void {
  const last = useRef(state.log.at(-1)?.id);
  const prev = useRef({ phase: state.phase, mode: state.scene.mode, destroyed: destroyedCount(state), hull: state.space?.ship.hull ?? 0 });
  useEffect(() => {
    void loadGameSounds();
  }, []);
  useEffect(() => {
    const from = state.log.findIndex((e) => e.id === last.current) + 1;
    for (const entry of state.log.slice(from)) {
      if (entry.type === "narration" && entry.tone === "fleet") sfx.comms();
      if (entry.type === "system" && /^New (advantage|complication|threat):/.test(entry.text)) sfx.objective();
    }
    last.current = state.log.at(-1)?.id;

    const p = prev.current;
    const now = { phase: state.phase, mode: state.scene.mode, destroyed: destroyedCount(state), hull: state.space?.ship.hull ?? 0 };
    if (p.phase === "lobby" && now.phase === "playing") sfx.jump(true);
    if (p.phase === "playing" && now.phase === "ended") sfx.jump(false);
    if (p.mode === "scene" && now.mode !== "scene") sfx.combat();
    if (now.destroyed > p.destroyed) sfx.explosion();
    if (now.hull > p.hull) sfx.hullHit();
    prev.current = now;
  }, [state]);
}

function destroyedCount(state: TableState): number {
  return state.space?.enemies.filter((e) => e.destroyed).length ?? 0;
}

export function TableView({ state, onLeave }: { state: TableState; onLeave: () => void }) {
  useGameSounds(state);
  useNarrationSpeech(state, useVoiceEnabled(false));
  useEffect(() => {
    // Audio may only start after a user gesture.
    const start = () => startDrone();
    addEventListener("pointerdown", start, { once: true });
    return () => removeEventListener("pointerdown", start);
  }, []);
  const me = useMe();
  const [open, setOpen] = useState<string>();
  const [archive, setArchive] = useState(false);
  const [manual, setManual] = useState(false);
  const localShips = useLocalShips();
  const sheet = state.sheets.find((s) => s.id === open);
  const gmLabel = state.gmMode === "claude" ? "Claude GM" : state.gmMode === "human" ? "Human GM" : "Director";

  return (
    <div className="table-view">
      <div className="table-top">
      <div className="hud-bar">
        <div className="brand">
          <img src="/kushan.svg" alt="" />
          {state.name}
        </div>
        <span className="tcode">{state.code}</span>
        <span className={cx("gm-badge", state.gmThinking && "thinking", state.gmNotice && "paused")} title={state.gmNotice}>
          {gmLabel}
          {state.gmNotice ? " · paused" : ""}
        </span>
        <div className="spacer" />
        <Pools state={state} />
        <button className="btn small" onClick={() => setManual(true)}>
          How to play
        </button>
        <MuteButton />
        <VoiceButton />
        <MusicButton />
        {localShips && (
          <button className="btn small" onClick={() => setArchive(true)}>
            Fleet
          </button>
        )}
        <button className="btn small" onClick={onLeave}>
          Leave
        </button>
      </div>
      <TurnBanner state={state} />
      </div>
      <div className="table-grid">
        <div className="stage">
          <Panorama state={state} />
          <Log state={state} />
          {state.phase === "ended" ? <EndCard state={state} onLeave={onLeave} /> : <Dock state={state} />}
        </div>
        <div className="side">
          {me?.role === "gm" ? <GmConsole state={state} /> : <div />}
          <Party state={state} onOpen={setOpen} />
        </div>
      </div>
      {archive && <FleetArchive onClose={() => setArchive(false)} />}
      {manual && <HowToPlay onClose={() => setManual(false)} />}
      {sheet && <SheetModal sheet={sheet} state={state} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
