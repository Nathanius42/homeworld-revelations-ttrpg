import type { TableState } from "@hwr/protocol";
import { cx } from "../util";

/** The same few rules for every mission, worded to match the "waiting on" line during play. */
const HOW_TO_PLAY = [
  ["The story", "appears on the TV and your phone. The line under the top bar always says what the game is waiting for."],
  ["Tests", "anyone can take one. Pick the approach that suits your character and roll; others can assist with an extra die."],
  ["Votes", "everyone picks, and the crew goes with the majority."],
  ["Fights", "each of you acts once a round, in any order."],
  ["Talk", "type what your character does in the log, and the GM answers."],
  ["Next ▸", "moves the story on. Anyone can press it."],
] as const;

/**
 * Orientation for new players while the crew gathers in the lobby: the mission's setting and
 * stakes, then how a turn works.
 */
export function BeforeYouBegin({ state, tv = false }: { state: TableState; tv?: boolean }) {
  return (
    <section className={cx("frame before-you-begin", tv && "tv")} aria-label="Before you begin">
      <div className="panel-title">Before you begin</div>
      <div className="panel-body">
        {state.campaign?.chapters.length ? (
          <>
            <div className="label">The story so far</div>
            <ol className="chapters">
              {state.campaign.chapters.map((c, i) => (
                <li key={i}>
                  <b>{c.missionTitle}.</b> {c.ending}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {state.missionPrimer?.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <div className="label">How a turn works</div>
        <ul>
          {HOW_TO_PLAY.map(([what, how]) => (
            <li key={what}>
              <b>{what}:</b> {how}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
