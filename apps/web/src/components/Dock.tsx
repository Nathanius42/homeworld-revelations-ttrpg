import { useState } from "react";
import type { TableState } from "@hwr/protocol";
import { useMe, useStore } from "../store";
import { bg, cx, isStanding, partyOf } from "../util";
import { RollPanel } from "./RollPanel";
import { SpacePanel } from "./SpacePanel";

/** Whatever the table needs to do next: roll, vote or fight. Moving the story on lives in the log. */
export function Dock({ state }: { state: TableState }) {
  if (state.phase !== "playing") return null;
  return (
    <div className="dock">
      <div className="dock-inner">
        {state.pendingRoll && <RollPanel state={state} pending={state.pendingRoll} />}
        {state.pendingChoice && <ChoicePanel state={state} />}
        {state.scene.mode === "action" && <CombatPanel state={state} />}
        {state.scene.mode === "space" && state.space && <SpacePanel state={state} />}
      </div>
    </div>
  );
}

function ChoicePanel({ state }: { state: TableState }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const choice = state.pendingChoice!;
  const voters = state.players.filter((p) => p.connected && p.characterId);
  const myVote = me ? choice.votes[me.id] : undefined;
  return (
    <div className="frame">
      <div className="panel-title">
        Crew decision<span className="spacer" />
        <span className="dim mono">
          {Object.keys(choice.votes).length}/{voters.length} voted
        </span>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <div className="choice-options">
          {choice.options.map((o) => {
            const who = Object.entries(choice.votes)
              .filter(([, v]) => v === o.id)
              .map(([pid]) => state.players.find((p) => p.id === pid)?.name ?? "?");
            return (
              <button key={o.id} className={cx("choice-option", myVote === o.id && "voted")} disabled={me?.role === "spectator"} onClick={() => send({ type: "vote", optionId: o.id })}>
                <span className="title">{o.label}</span>
                {o.hint && <span className="hint">{o.hint}</span>}
                {who.length > 0 && (
                  <span className="votes">
                    {who.map((n) => (
                      <span key={n} className="vote-chip">
                        {n}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="dim" style={{ fontSize: 14 }}>
          {me?.role === "gm" ? "As GM, your click decides immediately." : "The crew moves when everyone has voted. Change your vote any time before then."}
        </div>
      </div>
    </div>
  );
}

function CombatPanel({ state }: { state: TableState }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const [target, setTarget] = useState<string>();
  const [weapon, setWeapon] = useState<string>();
  const scene = state.scene;
  const mine = me?.characterId ? state.sheets.find((s) => s.id === me.characterId) : undefined;
  const live = scene.npcs.filter((n) => n.hostile && !n.defeated && !n.surrendered);
  const chosen = live.find((n) => n.id === target) ?? live[0];
  const canAct = Boolean(mine && isStanding(state, mine.id) && !scene.acted.includes(mine.id) && !state.pendingRoll);
  const waitingOn = partyOf(state).filter((s) => isStanding(state, s.id) && !scene.acted.includes(s.id));

  return (
    <div className="frame danger">
      <div className="panel-title" style={{ color: "var(--danger)" }}>
        Action scene · round {scene.round}
        <span className="spacer" />
        <span className="dim">{waitingOn.length ? `Waiting on ${waitingOn.map((s) => s.name.split(" ")[0]).join(", ")}` : ""}</span>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <div className="npc-grid">
          {scene.npcs.map((n) => {
            const down = n.defeated || n.surrendered || !n.hostile;
            return (
              <button key={n.id} className={cx("npc-card", down && "down", chosen?.id === n.id && canAct && "selected")} disabled={down || !canAct} onClick={() => setTarget(n.id)}>
                <div className="face" style={bg(n.portrait)} />
                <div style={{ minWidth: 0 }}>
                  <div className="tier">{n.surrendered ? "surrendered" : n.defeated ? "down" : n.tier}</div>
                  <div className="nm">{n.name}</div>
                  <div className="bar red">
                    <span style={{ width: `${Math.min(100, (n.stress / n.maxStress) * 100)}%` }} />
                  </div>
                  <div className="mono dim" style={{ fontSize: 11 }}>
                    {n.stress}/{n.maxStress} · {n.injuries} inj · armour {n.armour}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {canAct && mine && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={weapon ?? mine.weapons[0]?.name} onChange={(e) => setWeapon(e.target.value)}>
              {mine.weapons.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.name} ({w.stressRating} stress, {w.range})
                </option>
              ))}
            </select>
            <button
              className="btn danger big"
              disabled={!chosen}
              onClick={() => send({ type: "combatAction", action: "attack", characterId: mine.id, targetNpcId: chosen?.id, weaponName: weapon ?? mine.weapons[0]?.name })}
            >
              Attack {chosen ? chosen.name.replace(/ \(.*\)$/, "") : ""}
            </button>
            {!scene.parleyTried && (
              <button className="btn big" onClick={() => send({ type: "combatAction", action: "parley", characterId: mine.id })}>
                Talk them down
              </button>
            )}
          </div>
        )}
        {!canAct && !state.pendingRoll && mine && <div className="dim">{scene.acted.includes(mine.id) ? "You've acted this round." : `${mine.name} is down.`}</div>}
      </div>
    </div>
  );
}
