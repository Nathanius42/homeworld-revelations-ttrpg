# Dice Roller

The dice mechanic, modelled on the official *Homeworld: Revelations* dice set: grey dice with cyan pips, 2 d20s and 4 Challenge Dice.

## The physical set

| Die | Faces as printed | Game value |
|---|---|---|
| d20 ×2 | 2–20 as numerals; the **Kushan symbol replaces the 1** (confirmed against the physical set) | Kushan symbol = a 1 = 2 successes (critical) |
| Challenge Die ×4 | single target reticle | 1 |
| | double target reticle | 2 |
| | blank ×2 | 0 |
| | Kushan symbol ×2 | 1 + Effect |

A set has 4 CD, but attacks often roll 5–8 CD (weapon + Combat), so the digital roller has **no die limit** and simply shows more dice.

## Requirements

### Rolling

- **d20 pool builder:** 2 base dice, plus up to 3 bought (cost shown as 1/2/3, paid in Momentum, Threat, or a mix), plus talent bonus dice. **Hard cap 5.**
- **Before the roll:** target number, focus toggle (sets the double-success threshold to the skill), difficulty, complication range (1–5, the shaded faces shown), Fortune *Critical Success* (one die is pre-set to the Kushan symbol).
- **After the roll**, each die shows its state: success, double, complication, fail. The totals show successes against difficulty, the resulting Momentum, and complications.
- **Post-roll actions:** Fortune re-roll (choose any dice), Aim re-roll (1 die), talent re-rolls (single die, with the talent named), success at cost.
- **CD pool:** the count comes from the context (weapon stress + Combat, extended test 4 + bonuses, ship weapon "Scale + N" worked out for you). Shows total stress and the number of Effects, and lists the weapon effects those Effects trigger.
- **Assist dice:** each assistant's single d20 is shown in their colour beside the leader's pool, and greyed out if the leader scores no success.
- **Opposed rolls:** two pools side by side, then the resolution (both pass → compare Momentum; tie → active side; both fail).

### Fairness and trust

- Use a cryptographically secure RNG (`crypto.getRandomValues`), with rejection sampling to avoid modulo bias.
- In multiplayer, the **server rolls** and broadcasts the results. Every client sees the same roll at the same time. Clients never roll for real.
- An immutable **roll log** records who rolled, the context (test name, TN, difficulty), every die, and every spend. The GM and players can review it, and the AI GM reads it.
- Optional **physical dice mode:** a player enters their real roll, either by tapping faces or with camera OCR later. Useful for players who own the set.

### Presentation

- 3D or 2.5D dice in the set's colours (charcoal grey body, cyan #2EC4D6-ish pips). The faces reproduce the set: the Kushan symbol, the single and double reticles, and blanks (private build).
- A tumble animation of about 600 ms, skippable. Respect reduced-motion settings.
- A sound cue, mutable.
- An accessible text readout: "Rolled 2d20 against 14: 3 (success), 20 (complication). 1 success, difficulty 2: failed, 1 complication."

## Engine API (sketch)

```ts
type D20Result = { face: number; successes: 0 | 1 | 2; complication: boolean };
type CdResult  = { face: 1|2|3|4|5|6; value: 0|1|2; effect: boolean };

rollTest(opts: {
  dice: number;               // 2..5, after purchases
  targetNumber: number;       // attribute + skill
  focusThreshold?: number;    // the skill score when a focus applies
  difficulty: number;         // 0..5+
  complicationRange?: number; // 1..5
  presetCrits?: number;       // Fortune critical success
}): { dice: D20Result[]; successes: number; passed: boolean; momentum: number; complications: number };

rollChallenge(count: number): { dice: CdResult[]; total: number; effects: number };
```

Both are pure functions over an injected RNG, so tests can seed them.

## Real dice

Families who like the clatter of real d20s can roll them at the table. On the phone's roll panel, tick **I'm rolling real dice** (remembered per device). The Roll button becomes a box per d20: roll that many at the table, type in what they show, and press **Enter dice**. The server checks each face is a whole number from 1 to 20 and scores them exactly as it scores digital dice (`realDice` and `evaluateTest` in `engine.ts`). A Fortune critical still counts as a 1 without being rolled, and the log marks the roll as *real dice*.

For now only the leader's d20s are typed in; assisting dice and damage dice are still rolled by the app.

