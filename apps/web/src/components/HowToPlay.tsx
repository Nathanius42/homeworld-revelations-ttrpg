import { Emblem } from "./Log";

/** A one-screen primer on the 2d20 rules as this app uses them, for players new to the system. */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="frame sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          Field manual<span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="panel-body primer">
          <section>
            <h3>Tests</h3>
            <p>
              When the outcome is uncertain, someone rolls a <b>test</b>. Add an <b>attribute</b> and a <b>skill</b> to get your <b>target number</b> (TN). Roll
              two d20s: every die at or under the TN is a <b>success</b>. A 1, shown as the <Emblem size={14} /> Kushan emblem, counts as <b>two</b>.
            </p>
            <p>
              The <b>difficulty</b> (the amber diamonds) is how many successes you need. Most tests need one or two. The roll card shows your chance before you
              commit.
            </p>
          </section>
          <section>
            <h3>Focuses</h3>
            <p>If one of your character's focuses fits what you're doing, tick it: dice at or under your skill rating then count double.</p>
          </section>
          <section>
            <h3>Momentum</h3>
            <p>
              Successes beyond the difficulty become <b>Momentum</b> (the cyan diamonds), shared by the whole crew, up to six. Spend it to buy extra dice
              (1, then 2, then 3) or, on a hit, to add damage or extra Work.
            </p>
          </section>
          <section>
            <h3>Threat</h3>
            <p>
              <b>Threat</b> (the amber number) is the GM's pool for making trouble: reinforcements, enemies acting first, complications. It grows when you buy dice
              with it instead of Momentum, when you roll a 20 (a <b>complication</b>), and when things go badly.
            </p>
          </section>
          <section>
            <h3>Fortune</h3>
            <p>
              Each character has <b>Fortune</b> (the amber pips on their card). Spend one to re-roll some of your dice after seeing them, or to make one die a
              guaranteed 1 before you roll.
            </p>
          </section>
          <section>
            <h3>Help each other</h3>
            <p>
              When a test is waiting, anyone else can press <b>Assist</b> to add a die rolled against their own attribute and skill. Assist successes only count
              if the person rolling scores at least one.
            </p>
          </section>
          <section>
            <h3>Combat</h3>
            <p>
              Each crew member acts once a round: attack a target or try to talk them down. A hit rolls <b>Challenge Dice</b> for damage (reticles count, the
              emblem adds an effect). Damage fills the stress bar; big hits cause <b>injuries</b>, and two injuries take you out until the fight is over.
            </p>
          </section>
          <section>
            <h3>You don't need a GM</h3>
            <p>
              The <b>Director</b> runs the story, the enemies and every roll. Press <b>Next</b> under the story to move on, vote together on choices, and type in the log
              to talk in character. With the <b>Claude GM</b> turned on, what you type gets an answer.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
