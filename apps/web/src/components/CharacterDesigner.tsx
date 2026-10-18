import { useEffect, useMemo, useState } from "react";
import type { CustomCharacterInput, DesignerOptions } from "@hwr/protocol";
import {
  ATTRIBUTES,
  ATTRIBUTE_LABELS,
  CHARACTER_LIMITS,
  SKILLS,
  SKILL_LABELS,
  maxStress,
  validateFinishedCharacter,
  type Attribute,
  type Skill,
} from "@hwr/rules-engine";
import { useStore } from "../store";
import { KiithBadge } from "../badges";
import { bg, cx } from "../util";

const ATTRIBUTE_HINTS: Record<Attribute, string> = {
  agility: "Speed, reflexes, moving in zero-g",
  brawn: "Strength and toughness; adds to stress",
  coordination: "Steady hands: shooting, piloting",
  insight: "Perception and intuition",
  reason: "Logic, science, engineering",
  will: "Resolve, leadership, composure",
};

const SKILL_HINTS: Record<Skill, string> = {
  combat: "Fighting of every kind; adds to stress",
  command: "Leading, persuading, negotiating",
  engineering: "Fixing, building, hacking",
  exploration: "Sensors, survival, investigation",
  flight: "Flying anything",
  medical: "First aid, surgery, psychology",
};

function useDesignerOptions(): DesignerOptions | undefined {
  const [opts, setOpts] = useState<DesignerOptions>();
  useEffect(() => {
    fetch("/api/designer")
      .then((r) => r.json())
      .then(setOpts)
      .catch(() => setOpts(undefined));
  }, []);
  return opts;
}

function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="stepper">
      <button disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Lower">
        −
      </button>
      <span className="value">{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Raise">
        +
      </button>
    </div>
  );
}

export function CharacterDesigner({ onClose }: { onClose: () => void }) {
  const send = useStore((s) => s.send);
  const opts = useDesignerOptions();
  const [draft, setDraft] = useState<CustomCharacterInput>();
  const [focusText, setFocusText] = useState("");

  useEffect(() => {
    if (!opts || draft) return;
    setDraft({
      name: "",
      kiith: opts.kiithid[0]!.name,
      crewRole: opts.roles[1]?.crewRole ?? opts.roles[0]!.crewRole,
      tagline: "",
      portrait: opts.portraits[0]!,
      attributes: { ...opts.attributes },
      skills: { ...opts.skills },
      focuses: [],
      aspects: [""],
    });
  }, [opts, draft]);

  const issues = useMemo(() => (draft ? validateFinishedCharacter(draft.attributes, draft.skills).map((i) => i.message) : []), [draft]);
  if (!opts || !draft) {
    return (
      <div className="overlay">
        <div className="waiting">
          <div className="scanner" /> Opening the personnel office…
        </div>
      </div>
    );
  }

  const role = opts.roles.find((r) => r.crewRole === draft.crewRole)!;
  const kiith = opts.kiithid.find((k) => k.name === draft.kiith)!;
  const attrTotal = ATTRIBUTES.reduce((s, a) => s + draft.attributes[a], 0);
  const skillTotal = SKILLS.reduce((s, k) => s + draft.skills[k], 0);
  const stress = maxStress(draft.attributes, draft.skills, role.talents.some((t) => t.name === "Survivor") ? 3 : 0);
  const set = (patch: Partial<CustomCharacterInput>) => setDraft({ ...draft, ...patch });
  const toggleFocus = (f: string) =>
    set({ focuses: draft.focuses.includes(f) ? draft.focuses.filter((x) => x !== f) : draft.focuses.length < 6 ? [...draft.focuses, f] : draft.focuses });
  const ready = issues.length === 0 && draft.name.trim().length >= 2 && draft.focuses.length >= 3;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="frame designer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Personnel office · new crew member<span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="designer-body">
          <section className="designer-col">
            {opts.familyPortraits && opts.familyPortraits.length > 0 && (
              <>
                <div className="label">Family and friends</div>
                <div className="portrait-grid">
                  {opts.familyPortraits.map((p) => (
                    <button key={p.url} className={cx("portrait-pick", p.url === draft.portrait && "selected")} style={bg(p.url)} title={p.label} onClick={() => set({ portrait: p.url })} aria-label={`Choose portrait: ${p.label}`} />
                  ))}
                </div>
              </>
            )}
            <div className="label">Portrait</div>
            <div className="portrait-grid">
              {opts.portraits.map((p) => (
                <button key={p} className={cx("portrait-pick", p === draft.portrait && "selected")} style={bg(p)} onClick={() => set({ portrait: p })} aria-label="Choose portrait" />
              ))}
            </div>
            <label className="label" htmlFor="dn">
              Name
            </label>
            <input id="dn" value={draft.name} maxLength={40} placeholder="e.g. Arin Kaalel" onChange={(e) => set({ name: e.target.value })} />
            <label className="label" htmlFor="dk">
              Kiith
            </label>
            <div className="kiith-pick">
              <select id="dk" value={draft.kiith} onChange={(e) => set({ kiith: e.target.value })}>
                {opts.kiithid.map((k) => (
                  <option key={k.name} value={k.name}>
                    Kiith {k.name}
                  </option>
                ))}
              </select>
              <KiithBadge kiith={draft.kiith} size={36} />
            </div>
            <div className="dim" style={{ fontSize: 14 }}>
              {kiith.blurb}
            </div>
            <label className="label" htmlFor="dr">
              Crew role
            </label>
            <select id="dr" value={draft.crewRole} onChange={(e) => set({ crewRole: e.target.value, focuses: [] })}>
              {opts.roles.map((r) => (
                <option key={r.crewRole} value={r.crewRole}>
                  {r.crewRole}
                </option>
              ))}
            </select>
            <ul className="list" style={{ fontSize: 14 }}>
              {role.talents.map((t) => (
                <li key={t.name}>
                  <b>{t.name}.</b> <span className="dim">{t.summary}</span>
                </li>
              ))}
            </ul>
            <div className="dim" style={{ fontSize: 14 }}>
              Gear: {role.weapons.map((w) => w.name).join(", ")}
              {role.armour ? ` · armour ${role.armour}` : ""}
            </div>
          </section>

          <section className="designer-col">
            <div className="row-between">
              <div className="label">Attributes</div>
              <span className={cx("mono", attrTotal === CHARACTER_LIMITS.attributeTotal ? "dim" : "budget-off")}>
                {attrTotal} / {CHARACTER_LIMITS.attributeTotal}
              </span>
            </div>
            {ATTRIBUTES.map((a) => (
              <div key={a} className="score-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{ATTRIBUTE_LABELS[a]}</div>
                  <div className="dim" style={{ fontSize: 13 }}>
                    {ATTRIBUTE_HINTS[a]}
                  </div>
                </div>
                <Stepper value={draft.attributes[a]} min={7} max={CHARACTER_LIMITS.attributeMax} onChange={(v) => set({ attributes: { ...draft.attributes, [a]: v } })} />
              </div>
            ))}
            <div className="row-between" style={{ marginTop: 10 }}>
              <div className="label">Skills</div>
              <span className={cx("mono", skillTotal === CHARACTER_LIMITS.skillTotal ? "dim" : "budget-off")}>
                {skillTotal} / {CHARACTER_LIMITS.skillTotal}
              </span>
            </div>
            {SKILLS.map((k) => (
              <div key={k} className="score-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{SKILL_LABELS[k]}</div>
                  <div className="dim" style={{ fontSize: 13 }}>
                    {SKILL_HINTS[k]}
                  </div>
                </div>
                <Stepper value={draft.skills[k]} min={1} max={CHARACTER_LIMITS.skillMax} onChange={(v) => set({ skills: { ...draft.skills, [k]: v } })} />
              </div>
            ))}
            <div className="dim mono" style={{ fontSize: 13, marginTop: 6 }}>
              Max stress {stress} · Attributes 7–12 (one 12) · Skills 1–5 (one 5)
            </div>
          </section>

          <section className="designer-col">
            <div className="row-between">
              <div className="label">Focuses</div>
              <span className="dim mono">{draft.focuses.length} / 6</span>
            </div>
            <div className="dim" style={{ fontSize: 14 }}>
              Specialities: rolls at or under your skill count double when one applies. Pick three to six.
            </div>
            <div className="chip-grid">
              {[...new Set([...role.focusSuggestions, ...draft.focuses])].map((f) => (
                <button key={f} className={cx("chip", draft.focuses.includes(f) && "on")} onClick={() => toggleFocus(f)}>
                  {f}
                </button>
              ))}
            </div>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                const f = focusText.trim();
                if (f && !draft.focuses.includes(f) && draft.focuses.length < 6) set({ focuses: [...draft.focuses, f] });
                setFocusText("");
              }}
            >
              <input style={{ flex: 1 }} value={focusText} maxLength={32} placeholder="Your own focus…" onChange={(e) => setFocusText(e.target.value)} />
              <button className="btn small" type="submit">
                Add
              </button>
            </form>
            <label className="label" htmlFor="dt">
              One line about them
            </label>
            <input id="dt" value={draft.tagline} maxLength={120} placeholder="Optional" onChange={(e) => set({ tagline: e.target.value })} />
            <label className="label" htmlFor="da">
              An aspect (a belief or a flaw)
            </label>
            <input id="da" value={draft.aspects[0] ?? ""} maxLength={60} placeholder="e.g. Never leaves anyone behind" onChange={(e) => set({ aspects: [e.target.value] })} />

            <div className="designer-preview">
              <div className="face" style={bg(draft.portrait)} />
              <div>
                <div className="name">{draft.name || "Unnamed"}</div>
                <div style={{ color: "var(--line)" }}>
                  {role.rank} · {draft.crewRole}
                </div>
                <div className="dim">
                  <KiithBadge kiith={draft.kiith} size={16} />
                  Kiith {draft.kiith}
                </div>
              </div>
            </div>
            {issues.length > 0 && (
              <ul className="list issues">
                {issues.map((i) => (
                  <li key={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</li>
                ))}
              </ul>
            )}
            <button
              className="btn primary big"
              disabled={!ready}
              onClick={() => {
                send({ type: "createCharacter", character: { ...draft, aspects: draft.aspects.filter((a) => a.trim()) } });
                onClose();
              }}
            >
              Sign on
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
