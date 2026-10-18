import type { TableState } from "@hwr/protocol";
import { KiithBadge } from "../badges";
import { bg, cx, partyOf } from "../util";
import { conditionOf } from "@hwr/rules-engine";
import { displayUrl, useJoinOrigin } from "../join";
import { Dock } from "./Dock";
import { QrCode } from "./QrCode";
import { Log } from "./Log";
import { MusicButton, Panorama, Pools, VoiceButton, useGameSounds } from "./TableView";
import { TurnBanner } from "./TurnBanner";
import { BeforeYouBegin } from "./BeforeYouBegin";
import { waitingOn } from "../turn";
import { useEffect, useState } from "react";
import { speechSupported, useNarrationSpeech, useVoiceEnabled } from "../speech";

/**
 * A big-screen view for a TV at the table: the story, the dice and the crew, with no controls.
 * Players act on their phones; open /t/CODE/tv on the TV.
 */
/** Browsers only allow speech after the page has been clicked once; say so on the TV. */
function VoiceUnlockHint({ voice }: { voice: boolean }) {
  const active = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
  const [unlocked, setUnlocked] = useState(active);
  useEffect(() => {
    if (unlocked) return;
    const on = () => setUnlocked(true);
    window.addEventListener("pointerdown", on, { once: true });
    window.addEventListener("keydown", on, { once: true });
    return () => {
      window.removeEventListener("pointerdown", on);
      window.removeEventListener("keydown", on);
    };
  }, [unlocked]);
  if (!voice || unlocked || !speechSupported()) return null;
  return <div className="tv-voice-hint">Click or tap the screen once to turn on the voice and music</div>;
}

export function TvView({ state }: { state: TableState }) {
  const joinUrl = `${useJoinOrigin()}/t/${state.code}`;
  const voice = useVoiceEnabled(true);
  useNarrationSpeech(state, voice);
  useGameSounds(state);
  const hint = <VoiceUnlockHint voice={voice} />;
  const toAct = waitingOn(state)?.characterIds ?? [];
  if (state.phase === "lobby") {
    return (
      <div className="tv tv-lobby tv-lobby-split" style={bg(state.missionArt)}>
        {hint}
        <div className="tv-lobby-card frame">
          <div className="label">{state.name} · now boarding</div>
          <h1>{state.missionTitle}</h1>
          <p>{state.missionBlurb}</p>
          <div className="label" style={{ marginTop: 18 }}>
            Join on your phone
          </div>
          <div className="tv-join-card">
            <QrCode text={joinUrl} size={220} label="Scan to join this table" />
            <div>
              <div className="tv-code">{state.code}</div>
              <div className="mono dim">{displayUrl(joinUrl)}</div>
            </div>
          </div>
          <div className="tv-aboard">
            {partyOf(state).map((s) => (
              <div key={s.id} className="tv-aboard-face" style={bg(s.portrait)} title={s.name} />
            ))}
          </div>
        </div>
        <BeforeYouBegin state={state} tv />
      </div>
    );
  }
  return (
    <div className="tv">
      {hint}
      <div className="tv-top">
        <Panorama state={state} />
        <TurnBanner state={state} tv />
      </div>
      <div className="tv-main">
        <Log state={state} />
        <div className="tv-side">
          <Dock state={state} />
          {state.phase === "ended" && state.awards && (
            <div className="frame tv-ru">
              <div className="label">Requisition earned</div>
              <div className="ru">{state.awards.ru} RU</div>
            </div>
          )}
        </div>
      </div>
      <div className="tv-bottom">
        <div className="tv-crew">
          {partyOf(state).map((s) => {
            const c = state.characters[s.id]!;
            return (
              <div key={s.id} className={cx("tv-crew-card", conditionOf(c.injuries) !== "active" && "down", toAct.includes(s.id) && "to-act")}>
                <div className="face" style={bg(s.portrait)} />
                <div>
                  <div className="nm">
                    <KiithBadge kiith={s.kiith} size={18} />
                    {s.name}
                  </div>
                  <div className="bar">
                    <span style={{ width: `${(c.stress / s.maxStress) * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Pools state={state} />
        <div className="mono dim tv-join">
          Join: <b>{state.code}</b> · {displayUrl(joinUrl)}
        </div>
        <VoiceButton tv />
        <MusicButton tv />
      </div>
    </div>
  );
}
