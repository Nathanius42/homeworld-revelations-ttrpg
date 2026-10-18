import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SHIP_SYSTEMS, type EnemyShipState, type ShipState, type ShipSystem, type StationAction, type TableState } from "@hwr/protocol";
import { SKILL_LABELS, type Skill } from "@hwr/rules-engine";
import { loadShip, type LoadedShip } from "@hwr/ship-loader";
import { useMe, useStore } from "../store";
import { cx, isStanding, partyOf } from "../util";
import { useLocalShips } from "./FleetArchive";

interface ActionInfo {
  action: StationAction;
  station: string;
  label: string;
  system?: ShipSystem;
  skill: Skill;
  hint: string;
  needsTarget?: boolean;
}

const ACTIONS: ActionInfo[] = [
  { action: "fire", station: "Tactical", label: "Fire", system: "weapons", skill: "combat", hint: "Weapons + Combat. Smaller targets are harder to hit.", needsTarget: true },
  { action: "scan", station: "Sensors", label: "Scan for weakness", system: "sensors", skill: "combat", hint: "The next hit on the target pierces 2 armour.", needsTarget: true },
  { action: "evasive", station: "Helm", label: "Evasive action", system: "engines", skill: "flight", hint: "Enemies +1 to hit you this round, but so are you." },
  { action: "pattern", station: "Helm", label: "Attack pattern", system: "weapons", skill: "flight", hint: "Your attacks −1 difficulty this round, theirs −1 too." },
  { action: "jam", station: "Comms", label: "Jam targeting", system: "communications", skill: "combat", hint: "Enemy attacks +1 difficulty this round." },
  { action: "repair", station: "Engineering", label: "Damage control", skill: "engineering", hint: "Clear a breach (Coordination + Engineering)." },
  { action: "rally", station: "Command", label: "Rally the crew", skill: "command", hint: "Will + Command: every success is Momentum." },
  { action: "breakaway", station: "Helm", label: "Break away", system: "engines", skill: "flight", hint: "Escape the fight. Harder with fighters on your tail." },
  { action: "intercept", station: "Helm", label: "Intercept", system: "engines", skill: "flight", hint: "Put the ship in the missile's path: it bursts on your hull instead of its target.", needsTarget: true },
];

/** Engineering's way back into a station the ship has locked the crew out of. */
const OVERRIDE: ActionInfo = { action: "override", station: "Engineering", label: "Override", system: "computers", skill: "engineering", hint: "Reason + Engineering: take back a locked station." };

const SYSTEM_SHORT: Record<ShipSystem, string> = {
  communications: "Comms",
  computers: "Comp",
  engines: "Eng",
  sensors: "Sens",
  structure: "Struct",
  weapons: "Weap",
};

function Spin({ ship }: { ship: LoadedShip }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  return (
    <group ref={g} rotation={[0.25, 0.6, 0]}>
      <primitive object={ship.object} />
    </group>
  );
}

/** A small turntable of the real model when this PC has it; otherwise a simple silhouette. */
function ShipThumb({ model, local, hostile }: { model?: string; local: boolean; hostile: boolean }) {
  const [ship, setShip] = useState<LoadedShip>();
  useEffect(() => {
    if (!local || !model) return;
    let cancelled = false;
    loadShip(`/local/ships/${model}`, { team: hostile ? "9a2222" : undefined })
      .then((s) => !cancelled && setShip(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [model, local, hostile]);
  if (!ship) {
    return (
      <svg className="ship-thumb" viewBox="0 0 100 60" aria-hidden>
        {/* CSS variables only work in style, not in SVG presentation attributes. */}
        <path d="M8 30 L40 18 L88 26 L94 30 L88 34 L40 42 Z" style={{ fill: "none", stroke: hostile ? "var(--danger)" : "var(--line)", strokeWidth: 2 }} />
      </svg>
    );
  }
  const distance = ship.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95;
  return (
    <div className="ship-thumb">
      <Canvas camera={{ fov: 30, position: [0, ship.radius * 0.2, distance], near: distance / 100, far: distance * 10 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} color="#334455" />
        <directionalLight position={[-1, 0.8, 0.9]} intensity={3} color="#fff0dc" />
        <directionalLight position={[1.2, -0.3, -1]} intensity={2} color="#7fd8ff" />
        <Spin ship={ship} />
      </Canvas>
    </div>
  );
}

function ShipCard({ ship, local, enemy, selected, onSelect }: { ship: ShipState; local: boolean; enemy?: EnemyShipState; selected?: boolean; onSelect?: () => void }) {
  const destroyed = enemy?.destroyed;
  return (
    <button className={cx("ship-card", enemy ? "hostile" : "ours", selected && "selected", destroyed && "down")} disabled={!onSelect || destroyed} onClick={onSelect}>
      <ShipThumb model={ship.model} local={local} hostile={Boolean(enemy)} />
      <div className="ship-info">
        <div className="tier">
          {ship.className}
          {enemy && ` · ${enemy.range}`}
          {enemy?.chargeEvery ? " · charging gun" : ""}
        </div>
        <div className="nm">{enemy?.impacted ? `${ship.name} (struck home)` : destroyed ? `${ship.name} (destroyed)` : ship.name}</div>
        <div className={cx("bar", enemy && "red")} title={`Hull ${ship.maxHull - ship.hull}/${ship.maxHull}`}>
          <span style={{ width: `${Math.max(0, ((ship.maxHull - ship.hull) / ship.maxHull) * 100)}%` }} />
        </div>
        {enemy?.impact && !destroyed && <div className="strikes">Strikes at the end of round {enemy.impactRound}</div>}
        {!enemy?.impact && (
          <div className="systems">
            {SHIP_SYSTEMS.map((k) => (
              <span
                key={k}
                className={cx("sys", ship.breaches[k] >= ship.scale ? "offline" : ship.breaches[k] >= Math.ceil(ship.scale / 2) && ship.breaches[k] > 0 ? "damaged" : "")}
                title={`${k}: ${ship.systems[k]}, ${ship.breaches[k]} breach${ship.breaches[k] === 1 ? "" : "es"}`}
              >
                {SYSTEM_SHORT[k]} {ship.systems[k]}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

/** The tactical display and bridge stations for a ship battle. */
export function SpacePanel({ state }: { state: TableState }) {
  const send = useStore((s) => s.send);
  const me = useMe();
  const local = useLocalShips();
  const sp = state.space!;
  const [targetId, setTarget] = useState<string>();
  const live = sp.enemies.filter((e) => !e.destroyed);
  const target = live.find((e) => e.id === targetId) ?? live.find((e) => !e.optional) ?? live[0];
  const mine = me?.characterId ? state.sheets.find((s) => s.id === me.characterId) : undefined;
  const canAct = Boolean(mine && isStanding(state, mine.id) && !sp.acted.includes(mine.id) && !state.pendingRoll);
  const waitingOn = partyOf(state).filter((s) => isStanding(state, s.id) && !sp.acted.includes(s.id));
  const missiles = live.filter((e) => e.impact).sort((a, b) => (a.impactRound ?? 0) - (b.impactRound ?? 0));
  // Intercept needs a missile: the chosen target if it is one, else the one closest to striking.
  const missile = target?.impact ? target : missiles[0];
  const locked = sp.locked ?? [];
  const effects = [sp.rogue && "The ship has a will of its own", sp.evasive && "Evasive action", sp.pattern && "Attack pattern", sp.jammed && "Their targeting jammed", sp.weakness && `Weakness found: ${sp.enemies.find((e) => e.id === sp.weakness)?.name}`].filter(Boolean);

  return (
    <div className="frame danger space-panel">
      <div className="panel-title" style={{ color: "var(--danger)" }}>
        Ship action · round {sp.round}
        <span className="spacer" />
        <span className="dim">{waitingOn.length ? `Stations to report: ${waitingOn.map((s) => s.name.split(" ")[0]).join(", ")}` : ""}</span>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <div className="tactical">
          <ShipCard ship={sp.ship} local={local} />
          <div className="vs">◆</div>
          <div className="enemies">
            {sp.enemies.map((e) => (
              <ShipCard key={e.id} ship={e} enemy={e} local={local} selected={target?.id === e.id && canAct} onSelect={canAct ? () => setTarget(e.id) : undefined} />
            ))}
          </div>
        </div>
        {effects.length > 0 && (
          <div className="truths" style={{ marginLeft: 0 }}>
            {effects.map((e) => (
              <span key={e as string} className="truth">
                {e}
              </span>
            ))}
          </div>
        )}
        {canAct && mine && (
          <div className="stations">
            {[
              ...ACTIONS.filter((a) => (a.action !== "intercept" || missiles.length > 0) && (a.action !== "breakaway" || sp.canBreakaway)).map((a) => ({
                a,
                station: undefined as StationAction | undefined,
              })),
              ...locked.map((station) => ({ a: OVERRIDE, station })),
            ].map(({ a, station }) => {
              const offline = a.system ? sp.ship.breaches[a.system] >= sp.ship.scale : false;
              const isLocked = locked.includes(a.action);
              const used = sp.uses[a.action] ?? 0;
              const aim = a.action === "intercept" ? missile : target;
              return (
                <button
                  key={station ? `override-${station}` : a.action}
                  className="station"
                  disabled={offline || isLocked || (a.needsTarget && !aim)}
                  title={a.hint}
                  onClick={() => send({ type: "stationAction", action: a.action, characterId: mine.id, targetId: a.needsTarget ? aim?.id : undefined, station })}
                >
                  <span className="st">{a.station}</span>
                  <span className="lbl">
                    {a.label}
                    {a.needsTarget && aim ? `: ${aim.name}` : ""}
                    {station ? `: ${ACTIONS.find((x) => x.action === station)?.label ?? station}` : ""}
                  </span>
                  <span className="how">
                    {a.system ? `${a.system.charAt(0).toUpperCase()}${a.system.slice(1)} ${sp.ship.systems[a.system]}` : a.action === "rally" ? `Will ${mine.attributes.will}` : `Coordination ${mine.attributes.coordination}`} + {SKILL_LABELS[a.skill]}{" "}
                    {mine.skills[a.skill]}
                    {used > 0 && <span className="budget-off"> · +{used} (repeated)</span>}
                    {offline && <span className="budget-off"> · offline</span>}
                    {isLocked && <span className="budget-off"> · locked</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!canAct && !state.pendingRoll && mine && sp.acted.includes(mine.id) && <div className="dim">You've reported your station. Waiting for the rest of the bridge.</div>}
      </div>
    </div>
  );
}
