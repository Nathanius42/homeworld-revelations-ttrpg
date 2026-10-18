import type { CharacterSheet, InventoryItem, TableState } from "@hwr/protocol";
import { ATTRIBUTES, ATTRIBUTE_LABELS, SKILLS, SKILL_LABELS, conditionOf } from "@hwr/rules-engine";
import { KiithBadge } from "../badges";
import { useMe } from "../store";
import { bg, controllerOf, cx, partyOf } from "../util";

export function Party({ state, onOpen }: { state: TableState; onOpen: (id: string) => void }) {
  const me = useMe();
  const party = partyOf(state);
  return (
    <div className="frame" style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr)", minHeight: 0 }}>
      <div className="panel-title">
        Crew<span className="spacer" />
        <span className="dim mono">{party.length}</span>
      </div>
      <div className="panel-body party">
        {party.map((sheet) => {
          const c = state.characters[sheet.id]!;
          const player = controllerOf(state, sheet.id);
          const condition = conditionOf(c.injuries);
          return (
            <button
              key={sheet.id}
              className={cx(
                "party-card",
                player?.id === me?.id && "mine",
                condition !== "active" && "down",
                state.scene.mode === "action" && state.scene.acted.includes(sheet.id) && "acted",
              )}
              onClick={() => onOpen(sheet.id)}
            >
              <div className="face" style={bg(sheet.portrait)} />
              <div style={{ minWidth: 0 }}>
                <div className="nm">{sheet.name}</div>
                <div className="sub">
                  <KiithBadge kiith={sheet.kiith} size={16} />
                  {sheet.crewRole}
                </div>
                <div className="plr">
                  <span className={cx("dot", player?.connected && "on")} />
                  {player?.name ?? "—"}
                </div>
                <div className="bar" title={`Stress ${c.stress}/${sheet.maxStress}`}>
                  <span style={{ width: `${(c.stress / sheet.maxStress) * 100}%` }} />
                </div>
                <div className="vitals">
                  <span>
                    {c.stress}/{sheet.maxStress}
                  </span>
                  <span title="Injuries">
                    <i className={cx("injury", c.injuries >= 1 && "on")} /> <i className={cx("injury", c.injuries >= 2 && "on")} />
                  </span>
                  <span className="fortune" title="Fortune">
                    {"◆".repeat(c.fortune)}
                    <span className="dim">{"◇".repeat(Math.max(0, 3 - c.fortune))}</span>
                  </span>
                  {condition !== "active" && <span style={{ color: "var(--danger)" }}>DOWN</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SheetModal({ sheet, state, onClose }: { sheet: CharacterSheet; state: TableState; onClose: () => void }) {
  const c = state.characters[sheet.id]!;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="frame sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Personnel file<span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="panel-body">
          <div className="sheet-head">
            <div className="face" style={bg(sheet.portrait)} />
            <div>
              <div className="label">
                {sheet.rank} · <KiithBadge kiith={sheet.kiith} size={18} />
                Kiith {sheet.kiith}
              </div>
              <h2 style={{ fontSize: 26, margin: "6px 0" }}>{sheet.name}</h2>
              <div style={{ color: "var(--line)", fontWeight: 700 }}>{sheet.crewRole}</div>
              <p style={{ fontSize: 18 }}>{sheet.tagline}</p>
              <div className="dim">{sheet.truths.join(" ")}</div>
              {(state.campaign?.scars?.[sheet.id]?.length ?? 0) > 0 && (
                <div className="dim" style={{ marginTop: 6 }}>
                  <b>Scars:</b> {state.campaign!.scars![sheet.id]!.join("; ")}
                </div>
              )}
              <div className="stat-row" style={{ marginTop: 12 }}>
                <span className="stat-chip">
                  Stress <b>{c.stress}/{sheet.maxStress}</b>
                </span>
                <span className="stat-chip">
                  Injuries <b>{c.injuries}</b>
                </span>
                <span className="stat-chip">
                  Armour <b>{sheet.armour}</b>
                </span>
                <span className="stat-chip">
                  Fortune <b>{c.fortune}</b>
                </span>
              </div>
            </div>
          </div>
          <div className="sheet-cols">
            <div>
              <div className="label">Attributes</div>
              <div className="score-grid" style={{ marginTop: 6 }}>
                {ATTRIBUTES.map((a) => (
                  <Score key={a} label={ATTRIBUTE_LABELS[a]} value={sheet.attributes[a]} />
                ))}
              </div>
            </div>
            <div>
              <div className="label">Skills</div>
              <div className="score-grid" style={{ marginTop: 6 }}>
                {SKILLS.map((k) => (
                  <Score key={k} label={SKILL_LABELS[k]} value={sheet.skills[k]} />
                ))}
              </div>
            </div>
            <div>
              <div className="label">Focuses</div>
              <ul className="list">
                {sheet.focuses.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Talents</div>
              <ul className="list">
                {sheet.talents.map((t) => (
                  <li key={t.name}>
                    <b>{t.name}.</b> <span className="dim">{t.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Aspects</div>
              <ul className="list">
                {sheet.aspects.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label">Weapons</div>
              <ul className="list">
                {sheet.weapons.map((w) => (
                  <li key={w.name}>
                    <b>{w.name}</b>{" "}
                    <span className="dim">
                      {w.stressRating} stress · {w.range}
                      {w.vicious ? ` · Vicious ${w.vicious}` : ""}
                      {w.piercing ? ` · Piercing ${w.piercing}` : ""}
                      {w.notes ? ` · ${w.notes}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="label" style={{ marginTop: 12 }}>
                Inventory
                {c.inventory && (
                  <span className="dim" title="Small 1, medium 2, large 4. Carry up to 10 + half Brawn; stowed gear stays aboard.">
                    {" "}
                    · load {inventoryLoad(c.inventory)} of {10 + Math.floor(sheet.attributes.brawn / 2)}
                  </span>
                )}
              </div>
              {c.inventory ? (
                <ul className="list inventory">
                  {c.inventory.map((item) => (
                    <li key={item.id} className={cx("item", item.status !== "ok" && `item-${item.status.replace(" ", "-")}`)} title={item.history.join(" → ")}>
                      <b>{item.name}</b>
                      <span className="dim"> · {item.size ?? "small"}</span>
                      {item.uses !== undefined && item.status !== "used up" && <span className="dim"> · {item.uses} left</span>}
                      {item.status !== "ok" && <span className="item-status"> · {item.status}</span>}
                      <div className="dim item-origin">
                        {item.origin}
                        {item.history.length > 1 && ` · ${item.history.slice(1).join(" · ")}`}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="list">
                  {sheet.equipment.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small 1, medium 2, large 4; stowed, lost and used-up items don't count (matches the server). */
function inventoryLoad(items: InventoryItem[]): number {
  const bulk = { small: 1, medium: 2, large: 4 } as const;
  return items.filter((i) => i.status !== "lost" && i.status !== "used up" && i.status !== "stowed").reduce((n, i) => n + bulk[i.size ?? "small"], 0);
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span>{label}</span>
      <span className="v">{value}</span>
    </>
  );
}
