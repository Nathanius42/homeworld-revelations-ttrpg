import { useEffect, useRef, useState } from "react";
import type { LogEntry, RollRecord, TableState } from "@hwr/protocol";
import type { ChallengeDie, D20Die } from "@hwr/rules-engine";
import { EMBLEM_PATHS, EMBLEM_RING } from "../emblem";
import { useMe, useStore } from "../store";
import { cx } from "../util";

export function Emblem({ size = 16, colour = "currentColor" }: { size?: number; colour?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label="Kushan emblem">
      <g fill={colour} stroke={colour}>
        {EMBLEM_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
        <circle cx={EMBLEM_RING.cx} cy={EMBLEM_RING.cy} r={EMBLEM_RING.r} fill="none" strokeWidth={EMBLEM_RING.width} />
      </g>
    </svg>
  );
}

function Reticle({ double }: { double?: boolean }) {
  const one = (x: number, y: number, r: number) => (
    <g key={`${x}${y}`} stroke="currentColor" fill="currentColor" strokeWidth={9}>
      <circle cx={x} cy={y} r={r} fill="none" />
      <circle cx={x} cy={y} r={r * 0.3} stroke="none" />
    </g>
  );
  return <svg viewBox="0 0 100 100">{double ? [one(32, 32, 20), one(68, 68, 20)] : one(50, 50, 30)}</svg>;
}

export function MiniD20({ die }: { die: D20Die }) {
  return (
    <span className={cx("mini-die", die.successes === 2 && "crit", die.successes === 1 && "success", die.complication && "comp")} title={`${die.face}`}>
      {die.face === 1 ? <Emblem size={16} /> : die.face}
    </span>
  );
}

export function MiniCd({ die }: { die: ChallengeDie }) {
  return (
    <span className="mini-die cd" style={{ color: "#7ff0ff" }} title={die.symbol}>
      {die.symbol === "reticle" && <Reticle />}
      {die.symbol === "double-reticle" && <Reticle double />}
      {die.symbol === "kushan" && <Emblem size={18} />}
    </span>
  );
}

function RollEntry({ roll }: { roll: RollRecord }) {
  const r = roll.result;
  return (
    <div className={cx("entry roll", roll.npc && "npc")}>
      <div>
        <div className="label" style={{ color: roll.npc ? "var(--amber)" : undefined }}>
          {roll.characterName}
        </div>
        <div style={{ fontWeight: 700 }}>
          {roll.label}
          {roll.physical && <span className="dim" style={{ fontWeight: 400 }}> · real dice</span>}
        </div>
      </div>
      <div className="mini-dice">
        {r.dice.map((d, i) => (
          <MiniD20 key={i} die={d} />
        ))}
        {roll.assists?.map((a) => (
          <span key={a.characterId} title={`Assist from ${a.characterName}`} style={{ display: "contents" }}>
            <span className="dim">+</span>
            <MiniD20 die={a.die} />
          </span>
        ))}
        {roll.stress && (
          <>
            <span className="dim" style={{ margin: "0 4px" }}>
              ▸
            </span>
            {roll.stress.dice.map((d, i) => (
              <MiniCd key={i} die={d} />
            ))}
          </>
        )}
        {roll.work && (
          <>
            <span className="dim" style={{ margin: "0 4px" }}>
              ▸
            </span>
            {roll.work.dice.map((d, i) => (
              <MiniCd key={i} die={d} />
            ))}
          </>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className={cx("verdict", r.passed ? "pass" : "fail")}>{r.passed ? "Success" : "Failure"}</div>
        <div className="mono dim" style={{ fontSize: 12 }}>
          {r.successes}/{r.difficulty} · TN {r.targetNumber}
          {r.momentum > 0 && ` · +${r.momentum} M`}
          {roll.stress && ` · ${roll.stress.inflicted} stress`}
          {roll.work && ` · ${roll.work.effective} work`}
        </div>
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "narration": {
      const tone = entry.tone ?? "gm";
      return (
        <div className={cx("entry narration", tone, entry.speaker === "Game Master" && "gm-human")}>
          <div className="speaker">{entry.speaker}</div>
          <div className="text">{entry.text}</div>
        </div>
      );
    }
    case "action":
      return (
        <div className="entry action">
          <div className="who">
            {entry.characterName ?? entry.playerName}
            {entry.characterName && <span className="dim"> · {entry.playerName}</span>}
          </div>
          <div>{entry.text}</div>
        </div>
      );
    case "roll":
      return <RollEntry roll={entry.roll} />;
    case "system":
      return <div className={cx("entry system", /^Threat|complication/i.test(entry.text) && "threat")}>{entry.text}</div>;
  }
}

export function Log({ state }: { state: TableState }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const last = state.log.at(-1)?.id;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last, state.awaitingContinue]);

  const placeholder =
    me?.role === "spectator"
      ? "Spectators watch quietly."
      : state.gmMode === "claude"
        ? "Tell the GM what you do or say…"
        : state.gmMode === "human"
          ? "Tell the GM what you do…"
          : "Table talk: say something in character…";

  return (
    <div className="frame log">
      <div className="panel-title">
        Mission log<span className="spacer" />
        {state.gmThinking && <span className="gm-badge thinking">GM is thinking</span>}
      </div>
      <div className="log-scroll" ref={scroller}>
        {state.log.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}
        {/* The story pauses so everyone can read; anyone at the table can move it on. */}
        {state.awaitingContinue && state.phase === "playing" && me?.role !== "spectator" && (
          <div className="log-next">
            <button className="btn primary" onClick={() => send({ type: "advance" })}>
              Next ▸
            </button>
          </div>
        )}
      </div>
      {state.phase === "playing" && me?.role !== "spectator" && (
        <form
          className="log-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send({ type: "playerAction", text });
            setText("");
          }}
        >
          <input value={text} maxLength={600} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit" disabled={!text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
