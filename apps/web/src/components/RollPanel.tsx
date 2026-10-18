import { useEffect, useMemo, useState } from "react";
import type { Approach, RollRequest, TableState } from "@hwr/protocol";
import { ATTRIBUTE_LABELS, SKILL_LABELS, extraDiceCost } from "@hwr/rules-engine";
import { sfx } from "../audio";
import { DiceTray, type TrayDie } from "../dice/DiceTray";
import { useMe, useStore } from "../store";
import { chanceToPass, controllerOf, cx, isStanding, pct } from "../util";

function Difficulty({ n }: { n: number }) {
  if (n <= 0) return <span className="dim">no roll needed</span>;
  return (
    <span className="difficulty" title={`Difficulty ${n}`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** Lets another crew member lend a die to a waiting test. */
function AssistBar({ state, pending }: { state: TableState; pending: RollRequest }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const mine = me?.characterId;
  const assists = pending.assists ?? [];
  const helping = assists.some((a) => a.characterId === mine);
  const canHelp = Boolean(mine && pending.kind !== "attack" && pending.characterId !== mine && isStanding(state, mine));
  if (!canHelp && assists.length === 0) return null;
  return (
    <div className="assist-bar">
      {assists.length > 0 && (
        <span className="dim">
          Assisting: {assists.map((a) => a.characterName.split(" ")[0]).join(", ")} <span className="mono">(+{assists.length}d20)</span>
        </span>
      )}
      {canHelp && (
        <button className={cx("btn small", helping && "selected")} onClick={() => send({ type: "assist", characterId: mine! })}>
          {helping ? "Withdraw help" : "Assist (+1d20)"}
        </button>
      )}
    </div>
  );
}

/** Whether this device rolls real dice at the table (remembered per device). */
function readRealDice(): boolean {
  try {
    return localStorage.getItem("hwr.realdice") === "1";
  } catch {
    return false;
  }
}

/** A box per d20 for the faces rolled at the table, then Enter. */
function RealDiceEntry({ count, onEnter }: { count: number; onEnter: (faces: number[]) => void }) {
  const [values, setValues] = useState<string[]>([]);
  const faces = Array.from({ length: count }, (_, i) => Number(values[i]));
  const ready = faces.every((f) => Number.isInteger(f) && f >= 1 && f <= 20);
  return (
    <div className="real-dice">
      <div className="dim" style={{ fontSize: 14 }}>
        Roll {count}d20 at the table and type in what they show:
      </div>
      <div className="real-dice-row">
        {faces.map((_, i) => (
          <input
            key={i}
            inputMode="numeric"
            aria-label={`Die ${i + 1}`}
            maxLength={2}
            value={values[i] ?? ""}
            onChange={(e) => setValues((v) => Object.assign([...v], { [i]: e.target.value.replace(/\D/g, "") }))}
          />
        ))}
      </div>
      <button className="btn primary big" disabled={!ready} onClick={() => onEnter(faces)}>
        Enter dice
      </button>
    </div>
  );
}

export function RollPanel({ state, pending }: { state: TableState; pending: RollRequest }) {
  return pending.rolled ? <RolledView state={state} pending={pending} /> : <BuildView state={state} pending={pending} />;
}

function BuildView({ state, pending }: { state: TableState; pending: RollRequest }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const approaches = pending.approaches ?? [{ label: pending.reason, attribute: pending.attribute, skill: pending.skill, difficulty: pending.difficulty }];
  const [approachIndex, setApproach] = useState(0);
  const [bought, setBought] = useState(0);
  const [realDice, setRealDiceState] = useState(readRealDice);
  const setRealDice = (on: boolean) => {
    setRealDiceState(on);
    try {
      localStorage.setItem("hwr.realdice", on ? "1" : "0");
    } catch {
      // Private windows can refuse storage; the switch still works for this visit.
    }
  };
  const [useFocus, setUseFocus] = useState(false);
  const [payWithThreat, setPayWithThreat] = useState(false);
  const [fortuneCritical, setFortuneCritical] = useState(false);
  const [itemId, setItemId] = useState("");

  useEffect(() => {
    setItemId("");
    setApproach(0);
    setBought(0);
    setUseFocus(false);
    setPayWithThreat(false);
    setFortuneCritical(false);
  }, [pending.id]);

  const rollerId = pending.characterId ?? me?.characterId;
  const sheet = state.sheets.find((s) => s.id === rollerId);
  const character = rollerId ? state.characters[rollerId] : undefined;
  const mine = Boolean(sheet && (character?.controllerId === me?.id || me?.role === "gm") && isStanding(state, sheet.id));
  const approach = approaches[approachIndex] ?? approaches[0]!;
  const cost = extraDiceCost(bought);
  const fromMomentum = payWithThreat ? 0 : Math.min(state.pools.momentum, cost);
  /** Ship actions roll the ship's system rating in place of the character's attribute. */
  const base = (a: Approach) => (a.system && state.space ? state.space.ship.systems[a.system] : sheet ? sheet.attributes[a.attribute] : 0);
  const baseLabel = (a: Approach) => (a.system ? `${a.system.charAt(0).toUpperCase()}${a.system.slice(1)} (ship)` : ATTRIBUTE_LABELS[a.attribute]);
  const tn = sheet ? base(approach) + sheet.skills[approach.skill] : 0;
  const skill = sheet ? sheet.skills[approach.skill] : 0;
  // An item can help once per scene, while it works and has charges left.
  const items = (character?.inventory ?? []).filter(
    (i) => (i.status === "ok" || i.status === "damaged") && (i.uses === undefined || i.uses > 0) && i.usedInScene !== state.scene.id,
  );
  const item = items.find((i) => i.id === itemId);
  const difficulty = item ? Math.max(0, approach.difficulty - 1) : approach.difficulty;
  const odds = sheet ? chanceToPass(2 + bought, tn, useFocus ? skill : null, difficulty, fortuneCritical ? 1 : 0) : 0;
  const assigned = pending.characterId ? state.sheets.find((s) => s.id === pending.characterId) : undefined;
  const assignedPlayer = assigned ? controllerOf(state, assigned.id) : undefined;

  return (
    <div className="frame amber">
      <div className="panel-title amber">
        {pending.kind === "attack" ? "Attack" : pending.kind === "work" ? "Extended test" : "Test required"}
        <span className="spacer" />
        {pending.askedBy && <span className="dim">asked by {pending.askedBy}</span>}
      </div>
      <div className="panel-body roll-panel">
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <div className="prompt-text">
            <b>{pending.reason}</b>
          </div>
          {assigned ? (
            <div className="dim">
              For {assigned.name}
              {assignedPlayer && ` (${assignedPlayer.name})`}
            </div>
          ) : (
            <div className="dim">Anyone can take this one. Choose your approach and roll.</div>
          )}
          <div className="approaches">
            {approaches.map((a, i) => {
              const t = sheet ? base(a) + sheet.skills[a.skill] : undefined;
              return (
                <button key={i} className={cx("approach", i === approachIndex && "selected")} onClick={() => setApproach(i)}>
                  <span className="what">{a.label}</span>
                  <span className="tn">
                    {t !== undefined && (
                      <>
                        <span className="dim" style={{ fontSize: 11 }}>
                          TN{" "}
                        </span>
                        <span className="big">{t}</span>
                        <br />
                      </>
                    )}
                    <Difficulty n={a.difficulty} />
                  </span>
                  <span className="how">
                    {baseLabel(a)} + {SKILL_LABELS[a.skill]}
                    {sheet && ` (${base(a)} + ${sheet.skills[a.skill]})`} · Difficulty {a.difficulty}
                  </span>
                </button>
              );
            })}
          </div>
          {pending.focusHint && <div className="dim">Helpful focuses: {pending.focusHint}</div>}
          <AssistBar state={state} pending={pending} />
        </div>

        <div className="roll-controls">
          {!sheet ? (
            <div className="waiting">{me?.role === "player" ? "Choose a crew member in the lobby to roll." : <><div className="scanner" /> Waiting for the crew to roll…</>}</div>
          ) : !mine ? (
            <div className="waiting">
              <div className="scanner" /> Waiting for {assignedPlayer?.name ?? "someone"} to roll…
            </div>
          ) : (
            <>
              <div className="row">
                <span className="label">Rolling as {sheet.name}</span>
              </div>
              <div className="row">
                <span>Extra dice</span>
                <div className="stepper">
                  <button disabled={bought <= 0} onClick={() => setBought(bought - 1)}>
                    −
                  </button>
                  <span className="value">{2 + bought}d20</span>
                  <button disabled={bought >= 3} onClick={() => setBought(bought + 1)}>
                    +
                  </button>
                </div>
              </div>
              {bought > 0 && (
                <div className="row dim" style={{ fontSize: 15 }}>
                  Costs {cost}: {fromMomentum > 0 && `${fromMomentum} Momentum`}
                  {fromMomentum > 0 && cost - fromMomentum > 0 && " + "}
                  {cost - fromMomentum > 0 && <span style={{ color: "var(--amber)" }}>{cost - fromMomentum} Threat to the GM</span>}
                </div>
              )}
              {bought > 0 && state.pools.momentum > 0 && (
                <label className="toggle amber">
                  <input type="checkbox" checked={payWithThreat} onChange={(e) => setPayWithThreat(e.target.checked)} /> Save Momentum: give the GM Threat instead
                </label>
              )}
              <label className="toggle">
                <input type="checkbox" checked={useFocus} onChange={(e) => setUseFocus(e.target.checked)} /> A focus applies (rolls of {skill} or under count double)
              </label>
              {useFocus && <div className="dim" style={{ fontSize: 14, marginTop: -6 }}>Your focuses: {sheet.focuses.join(", ")}</div>}
              {items.length > 0 && (
                <label className="item-pick">
                  <span>Use an item</span>
                  <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                    <option value="">None</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                        {i.uses !== undefined ? ` (${i.uses} left)` : ""}
                        {i.status === "damaged" ? " (damaged)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {item && (
                <div className="dim" style={{ fontSize: 14, marginTop: -6 }}>
                  One step easier. {item.status === "damaged" ? "It's damaged: a complication will break it." : "A complication will damage it."}
                </div>
              )}
              <label className="toggle amber" title="Spend 1 Fortune: one die counts as a 1 before you roll">
                <input type="checkbox" disabled={(character?.fortune ?? 0) < 1} checked={fortuneCritical} onChange={(e) => setFortuneCritical(e.target.checked)} /> Spend Fortune for a guaranteed critical ({character?.fortune ?? 0} left)
              </label>
              <div className="row">
                <span className="odds">
                  Chance to succeed <b>{pct(odds)}</b>
                  {(pending.assists ?? []).some((a) => a.characterId !== sheet.id) && " before assists"} · TN {tn} · Difficulty {difficulty}
                </span>
              </div>
              <label className="toggle" title="Roll real d20s at the table and type in what they show">
                <input type="checkbox" checked={realDice} onChange={(e) => setRealDice(e.target.checked)} /> I'm rolling real dice
              </label>
              {realDice ? (
                <RealDiceEntry
                  count={2 + bought - (fortuneCritical ? 1 : 0)}
                  onEnter={(faces) =>
                    send({ type: "roll", approachIndex, boughtDice: bought, useFocus, payWithThreat, fortuneCritical, faces, ...(item ? { itemId: item.id } : {}) })
                  }
                />
              ) : (
                <button
                  className="btn primary big"
                  onClick={() => send({ type: "roll", approachIndex, boughtDice: bought, useFocus, payWithThreat, fortuneCritical, ...(item ? { itemId: item.id } : {}) })}
                >
                  Roll {2 + bought}d20
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RolledView({ state, pending }: { state: TableState; pending: RollRequest }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const record = pending.rolled!;
  const r = record.result;
  const rollKey = record.requestId;
  const [settledKey, setSettledKey] = useState("");
  const [rerollPick, setRerollPick] = useState<number[]>([]);
  const [bonus, setBonus] = useState(0);
  const settled = settledKey === `${rollKey}:${record.rerolled ? 1 : 0}`;
  const character = state.characters[record.characterId];
  const mine = character?.controllerId === me?.id || me?.role === "gm";
  const firing = pending.origin === "attack" || pending.station?.action === "fire";
  const boostable = r.passed && (firing || pending.origin === "work");
  const maxBonus = boostable ? Math.min(3, r.momentum) : 0;

  useEffect(() => {
    setRerollPick([]);
    setBonus(0);
    sfx.dice(r.dice.length + (record.assists?.length ?? 0));
  }, [rollKey, record.rerolled]); // eslint-disable-line react-hooks/exhaustive-deps

  const dice: TrayDie[] = useMemo(() => {
    const glow = (d: { successes: number; complication: boolean }): TrayDie["glow"] =>
      d.complication ? "complication" : d.successes === 2 ? "crit" : d.successes === 1 ? "success" : undefined;
    return [
      ...r.dice.map((d) => ({ kind: "d20" as const, face: d.face, glow: glow(d) })),
      ...(record.assists ?? []).map((a) => ({ kind: "d20" as const, face: a.die.face, glow: glow(a.die) })),
    ];
  }, [r, record.assists]);

  return (
    <div className={cx("frame", settled && (r.passed ? "" : "danger"))}>
      <div className="panel-title">
        {record.characterName} · {record.label}
        <span className="spacer" />
        <span className="dim mono">
          TN {r.targetNumber}
          {r.focusThreshold ? ` · focus ≤${r.focusThreshold}` : ""} · D{r.difficulty}
        </span>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <div className="dice-stage">
          <DiceTray
            dice={dice}
            rollKey={`${rollKey}`}
            onSettled={() => {
              setSettledKey(`${rollKey}:${record.rerolled ? 1 : 0}`);
              if (r.passed) sfx.success();
              else sfx.failure();
            }}
          />
        </div>
        <div className="dice-result" style={{ visibility: settled ? "visible" : "hidden" }}>
          <div>
            <div className={cx("big-verdict", r.passed ? "verdict pass" : "verdict fail")}>{r.passed ? "Success" : "Failure"}</div>
            <div className="mono dim">
              {r.successes} success{r.successes === 1 ? "" : "es"} of {r.difficulty} needed
              {r.momentum > 0 && <span style={{ color: "var(--line)" }}> · +{r.momentum} Momentum</span>}
              {r.complications > 0 && <span style={{ color: "var(--danger)" }}> · {r.complications} complication{r.complications > 1 ? "s" : ""}</span>}
            </div>
            {record.assists && record.assists.length > 0 && (
              <div className="dim" style={{ fontSize: 14 }}>
                {r.dice.length} dice from {record.characterName.split(" ")[0]}, then help from{" "}
                {record.assists.map((a) => `${a.characterName.split(" ")[0]} (${a.die.face})`).join(", ")}
                {r.dice.every((d) => d.successes === 0) && "; it only counts if the leader scores"}
              </div>
            )}
          </div>
          {mine ? (
            <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
              {!record.rerolled && (character?.fortune ?? 0) > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span className="dim" style={{ fontSize: 14 }}>
                    Fortune re-roll:
                  </span>
                  <div className="die-select">
                    {r.dice.map((d, i) => (
                      <button
                        key={i}
                        disabled={d.preset}
                        className={cx(rerollPick.includes(i) && "on")}
                        onClick={() => setRerollPick(rerollPick.includes(i) ? rerollPick.filter((x) => x !== i) : [...rerollPick, i])}
                      >
                        {d.face}
                      </button>
                    ))}
                  </div>
                  <button className="btn amber small" disabled={rerollPick.length === 0} onClick={() => send({ type: "fortuneReroll", indices: rerollPick })}>
                    Re-roll ({character?.fortune} Fortune)
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {maxBonus > 0 && (
                  <>
                    <span className="dim" style={{ fontSize: 14 }}>
                      Spend Momentum for +{firing ? "damage" : "Challenge Dice"}
                    </span>
                    <div className="stepper">
                      <button disabled={bonus <= 0} onClick={() => setBonus(bonus - 1)}>
                        −
                      </button>
                      <span className="value">{bonus}</span>
                      <button disabled={bonus >= maxBonus} onClick={() => setBonus(bonus + 1)}>
                        +
                      </button>
                    </div>
                  </>
                )}
                <button className="btn primary" onClick={() => send({ type: "acceptRoll", bonus })}>
                  {firing && r.passed ? "Roll damage" : pending.origin === "work" && r.passed ? "Roll Work" : "Continue"}
                </button>
              </div>
            </div>
          ) : (
            <div className="waiting">
              <div className="scanner" /> {controllerOf(state, record.characterId)?.name ?? "The roller"} is deciding…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
