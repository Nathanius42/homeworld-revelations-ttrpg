import { BeforeYouBegin } from "./BeforeYouBegin";
import { BetweenMissions } from "./BetweenMissions";
import { useEffect, useState } from "react";
import type { GmMode, TableState } from "@hwr/protocol";
import { ATTRIBUTES, ATTRIBUTE_LABELS, SKILLS, SKILL_LABELS } from "@hwr/rules-engine";
import { useMe, useStore } from "../store";
import { CharacterDesigner } from "./CharacterDesigner";
import { bg, controllerOf, cx } from "../util";
import { displayUrl, useJoinOrigin } from "../join";
import { QrCode } from "./QrCode";
import { MusicButton } from "./TableView";

const GM_MODES: { mode: GmMode; label: string; desc: string }[] = [
  { mode: "director", label: "Director", desc: "A scripted GM runs the mission, the NPCs and every roll. Free text is table talk." },
  { mode: "claude", label: "Claude GM", desc: "The Director keeps the structure; Claude improvises around anything you try in free text." },
  { mode: "human", label: "Human GM", desc: "The Director runs the script and a friend joins as GM to narrate, spend Threat and call extra tests." },
];

interface MissionSummary {
  id: string;
  title: string;
  blurb: string;
  recommendedPlayers: string;
  art: string;
}

function useMissions(): MissionSummary[] {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  useEffect(() => {
    fetch("/api/missions")
      .then((r) => r.json())
      .then(setMissions)
      .catch(() => setMissions([]));
  }, []);
  return missions;
}

export function Lobby({ state }: { state: TableState }) {
  const missions = useMissions();
  const [designing, setDesigning] = useState(false);
  const send = useStore((s) => s.send);
  const me = useMe();
  const invite = `${useJoinOrigin()}/t/${state.code}`;
  const crew = state.players.filter((p) => p.role === "player");
  const claimed = crew.filter((p) => p.characterId).length;

  return (
    <div className="lobby">
      <div className="lobby-head">
        <div className="frame mission-banner">
          <div className="art" style={bg(state.missionArt)} />
          <div className="content">
            <div className="label">Mission briefing · {state.name}</div>
            <h2>{state.missionTitle}</h2>
            <div style={{ fontSize: 18 }}>{state.missionBlurb}</div>
            <div className="dim" style={{ marginTop: 8 }}>
              {state.recommendedPlayers} · no GM experience needed
            </div>
          </div>
        </div>
        <div className="frame invite">
          <div className="label">Table code</div>
          <div className="code">{state.code}</div>
          <QrCode text={invite} size={132} label="Scan to join this table" />
          <button
            className="btn small"
            onClick={() => {
              void navigator.clipboard?.writeText(invite);
              useStore.getState().toast("Invite link copied.");
            }}
          >
            Copy invite link
          </button>
          <div className="dim mono" style={{ fontSize: 12 }}>
            {displayUrl(invite)}
          </div>
          <a className="btn small" href={`/t/${state.code}/tv`} target="_blank" rel="noreferrer">
            Open TV view
          </a>
          <MusicButton />
        </div>
      </div>

      <BeforeYouBegin state={state} />
      <BetweenMissions state={state} />

      {missions.length > 1 && (
        <div className="frame">
          <div className="panel-title">Choose your mission</div>
          <div className="panel-body mission-grid">
            {missions.map((m) => (
              <button
                key={m.id}
                className={cx("mission-card", m.id === state.missionId && "selected")}
                onClick={() => send({ type: "setMission", missionId: m.id })}
              >
                <div className="art" style={bg(m.art)} />
                <div className="info">
                  <div className="name">{m.title}</div>
                  <div className="dim">{m.recommendedPlayers}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="frame">
        <div className="panel-title">
          Choose your crew member<span className="spacer" />
          <span className="dim mono">{claimed}/6 aboard</span>
        </div>
        <div className="panel-body">
          {me?.role !== "player" && <div className="dim" style={{ marginBottom: 10 }}>You're {me?.role === "gm" ? "the GM" : "watching"}; the crew choose their characters here.</div>}
          <div className="crew-grid">
            {state.sheets.map((sheet) => {
              const holder = controllerOf(state, sheet.id);
              const mine = holder?.id === me?.id;
              const taken = holder && !mine && holder.connected;
              const top = [...SKILLS].sort((a, b) => sheet.skills[b] - sheet.skills[a]).slice(0, 2);
              const bestAttr = [...ATTRIBUTES].sort((a, b) => sheet.attributes[b] - sheet.attributes[a])[0]!;
              return (
                <button
                  key={sheet.id}
                  className={cx("crew-card", mine && "mine", taken && "taken")}
                  disabled={me?.role !== "player" || Boolean(taken)}
                  onClick={() => send({ type: "claimCharacter", characterId: mine ? null : sheet.id })}
                >
                  {holder && <div className="badge">{mine ? "You" : holder.name}</div>}
                  <div className="portrait" style={bg(sheet.portrait)} />
                  <div className="info">
                    <div className="name">{sheet.name}</div>
                    <div className="role">
                      {sheet.rank} · {sheet.crewRole}
                    </div>
                    <div className="tagline">{sheet.tagline}</div>
                    <div className="stat-row">
                      <span className="stat-chip">
                        {ATTRIBUTE_LABELS[bestAttr]} <b>{sheet.attributes[bestAttr]}</b>
                      </span>
                      {top.map((k) => (
                        <span key={k} className="stat-chip">
                          {SKILL_LABELS[k]} <b>{sheet.skills[k]}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
            {me?.role === "player" && (
              <button className="crew-card design-card" onClick={() => setDesigning(true)}>
                <div className="plus">+</div>
                <div className="name">Design your own</div>
                <div className="tagline">Build a Kushan officer of your own: kiith, role, attributes, skills and focuses.</div>
              </button>
            )}
          </div>
        </div>
      </div>
      {designing && <CharacterDesigner onClose={() => setDesigning(false)} />}

      <div className="lobby-foot">
        <div className="frame">
          <div className="panel-title">Game Master</div>
          <div className="panel-body gm-options">
            {GM_MODES.map((g) => (
              <button
                key={g.mode}
                className={cx("gm-option", state.gmMode === g.mode && "selected")}
                disabled={g.mode === "claude" && !state.aiAvailable}
                onClick={() => send({ type: "setGmMode", mode: g.mode })}
                title={g.mode === "claude" && !state.aiAvailable ? "Add ANTHROPIC_API_KEY to the server's .env to enable" : undefined}
              >
                <span className="pip" />
                <span style={{ fontWeight: 700 }}>
                  {g.label}
                  {g.mode === "claude" && !state.aiAvailable && <span className="dim"> · needs an API key</span>}
                </span>
                <span className="desc">{g.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="frame">
          <div className="panel-title">At the table</div>
          <div className="panel-body player-list">
            {state.players.map((p) => (
              <div key={p.id} className="player-row">
                <span className={cx("dot", p.connected && "on")} />
                <span style={{ fontWeight: 700 }}>{p.name}</span>
                <span className="dim">
                  {p.role === "gm" ? "GM" : p.role === "spectator" ? "watching" : p.characterId ? state.sheets.find((s) => s.id === p.characterId)?.name : "choosing…"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="frame launch">
          <button className="btn primary big" disabled={claimed === 0} onClick={() => send({ type: "startGame" })}>
            Begin mission
          </button>
          <div className="dim" style={{ fontSize: 14, textAlign: "center" }}>
            {claimed === 0 ? "Someone needs to choose a crew member." : `Threat starts at ${claimed * 2}. Anyone can launch.`}
          </div>
        </div>
      </div>
    </div>
  );
}
