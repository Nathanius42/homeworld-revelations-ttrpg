import { useEffect, useState } from "react";
import { INFIRMARY_COST, type TableState } from "@hwr/protocol";
import { SKILLS, SKILL_LABELS } from "@hwr/rules-engine";
import { useMe, useStore } from "../store";

interface RequisitionItem {
  id: string;
  name: string;
  cost: number;
  size: string;
  uses?: number;
  detail: string;
}

/**
 * Between missions in a campaign: the Requisition banked, kit to requisition for your character,
 * the advance they earned on the last mission (+1 to a skill, or a new focus), the infirmary for
 * a wound carried over, and their scars.
 */
export function BetweenMissions({ state }: { state: TableState }) {
  const me = useMe();
  const send = useStore((s) => s.send);
  const [catalogue, setCatalogue] = useState<RequisitionItem[]>([]);
  const [focus, setFocus] = useState("");
  useEffect(() => {
    fetch("/api/requisition")
      .then((r) => r.json() as Promise<RequisitionItem[]>)
      .then(setCatalogue)
      .catch(() => undefined);
  }, []);

  const campaign = state.campaign;
  if (!campaign) return null;
  const mine = me?.characterId;
  const sheet = state.sheets.find((s) => s.id === mine);
  const advances = mine ? (campaign.advances[mine] ?? 0) : 0;
  const wounded = mine ? (state.characters[mine]?.injuries ?? 0) > 0 : false;
  const scars = mine ? (campaign.scars?.[mine] ?? []) : [];

  return (
    <section className="frame between-missions" aria-label="Between missions">
      <div className="panel-title">Between missions · {campaign.ru} RU banked</div>
      <div className="panel-body">
        {!sheet ? (
          <p className="dim">Choose your crew member below to spend their advance and requisition kit.</p>
        ) : (
          <>
            <div className="label">{sheet.name}'s advance</div>
            {advances > 0 ? (
              <>
                <p className="dim">Learned from the last mission: raise one skill by 1, or add a focus.</p>
                <div className="chip-grid">
                  {SKILLS.map((s) => (
                    <button key={s} className="chip" disabled={sheet.skills[s] >= 5} onClick={() => send({ type: "spendAdvance", characterId: sheet.id, skill: s })}>
                      {sheet.skills[s] >= 5 ? `${SKILL_LABELS[s]} 5 (max)` : `${SKILL_LABELS[s]} ${sheet.skills[s]} → ${sheet.skills[s] + 1}`}
                    </button>
                  ))}
                </div>
                <div className="row-between" style={{ gap: 8, marginTop: 8 }}>
                  <input placeholder="Or a new focus, e.g. Salvage" value={focus} maxLength={40} onChange={(e) => setFocus(e.target.value)} />
                  <button
                    className="btn small"
                    disabled={focus.trim().length < 2}
                    onClick={() => {
                      send({ type: "spendAdvance", characterId: sheet.id, focus: focus.trim() });
                      setFocus("");
                    }}
                  >
                    Add focus
                  </button>
                </div>
              </>
            ) : (
              <p className="dim">No advance to spend: {sheet.name} earns one for each mission played.</p>
            )}
            {wounded && (
              <>
                <div className="label" style={{ marginTop: 12 }}>
                  Infirmary
                </div>
                <p className="dim">
                  {sheet.name} is still wounded from the last mission: they start this one with an injury, and one more takes them down.
                </p>
                <button className="btn small" disabled={campaign.ru < INFIRMARY_COST} onClick={() => send({ type: "treatWound", characterId: sheet.id })}>
                  Treat the wound · {INFIRMARY_COST} RU
                </button>
              </>
            )}
            {scars.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 12 }}>
                  Scars
                </div>
                <ul className="scar-list">
                  {scars.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="label" style={{ marginTop: 12 }}>
              Requisition kit for {sheet.name}
            </div>
            <ul className="list requisition">
              {catalogue.map((item) => (
                <li key={item.id}>
                  <button className="btn small" disabled={campaign.ru < item.cost} onClick={() => send({ type: "requisition", characterId: sheet.id, itemId: item.id })}>
                    {item.cost} RU
                  </button>{" "}
                  <b>{item.name}</b>
                  <span className="dim">
                    {" "}
                    · {item.size}
                    {item.uses ? ` · ${item.uses} uses` : ""} · {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
