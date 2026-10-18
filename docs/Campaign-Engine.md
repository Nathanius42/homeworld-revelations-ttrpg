# Campaign Engine

How the app **generates a campaign** and then **runs it** session by session for a full table. It draws on Corebook ch. 9 (Gamemastering) and ch. 6–8 (setting).

> **Built so far:** the first step, carrying a crew from mission to mission (chapters, advances, requisition and the recap), is described in [Campaign](Campaign.md). The generation described here is still to come.

## Table size

| | Value | Basis |
|---|---|---|
| Players supported | **1–6 PCs**, design target 6 | the corebook recommends 3–6 players |
| Characters in a scene | 6 PCs + up to 2 supporting characters | SC cap when most PCs are present |
| GM | 1 human, or the AI GM | |
| Spectators | unlimited, read-only | |

- **Absent players** have their PC become *uncontrolled* (difficulty-0 tests and assists only), or step out of the story.
- **Small groups** fill gaps with supporting characters.

### Scaling levers the engine applies automatically

| Lever | Rule | Effect at 6 players |
|---|---|---|
| Starting Threat | 2 × players | 12 |
| Personal fights | budget = PCs in PC-equivalents (minor 2/3, notable 1, major 2) | ~6 PC-eq., e.g. 1 major, 1 notable, 4–5 minors |
| Ship fights | total NPC scale ≈ number of PCs | e.g. two frigates (scale 3 each) |
| Reversal cost | 2 × PCs present | 12 |
| Turn length | strike forces (up to 5 identical minors as one turn) | keeps rounds short |
| Fleet battles | each player commands one ship ("zoom out") | every player busy |
| Spotlight | role coverage check; at least one scene per session built for each track | engineers and medics get their moments |

Pacing: plan **one scene or encounter per 30 minutes** of session, plus 2–3 spares.

## Campaign generation

### Inputs (the session-zero wizard)

1. **Play style:** Bridge Crew · Masters and Commanders · Spooks and Spies · Support Personnel (p. 265).
2. **Era:** Pre-Exodus (Kharak) · Exodus (the 16-mission journey to Hiigara; the default) · Post-Landfall (the new wars, the Council, Progenitor hunts).
3. **Campaign type:** *finite* (a defined epic goal, missions mapped in advance) or *open* (one mission at a time, seeded from the last).
4. **Length:** the number of missions, and the session length.
5. **Tone dials:** combat ↔ intrigue ↔ exploration; lethality; how gritty the resources are.
6. **Players and their characters:** lifepath or creation-in-play. Career events and defining aspects become hooks.
7. **Home ship:** ready-made, quick or constructed (see Ship Combat).
8. **Lines and veils:** safety tools. Content the table excludes or fades out.

### Generator pipeline

```
seed (inputs + RNG seed)
  → campaign spine     goal, antagonist faction(s), 3–5 arcs, finale
  → arc beats          each arc: 3–6 missions, an arc milestone at the end
  → mission skeletons  goal, location, faction, challenge graph, 1 twist
  → hooks              PC career events / defining aspects tied to missions
  → cast              recurring major NPCs (ally, nemesis, wildcard) with open slots
  → content picks      ships, locations, artifacts, seeds from the setting catalogue
```

- **Spine templates** come from the setting. Examples: the Exodus to Hiigara; a Progenitor relic race against the Taiidan; containing a Gaalsien insurgency inside the fleet; a Kadeshi nebula incursion; Turanic raiders on the supply lines; a Bentusi or Galactic Council intrigue.
- **The output is editable:** every generated element can be re-rolled or hand-edited before play, and is versioned.
- **Determinism:** same seed + same inputs = same campaign. Useful for testing and for sharing a campaign.

The Claude model generates the prose (briefings, NPC voices, location descriptions). The engine generates the *structure* and enforces the rules, so the output is always playable.

## Running a session

### Session loop

```
open session
  Threat ← 2 × players; each PC's Fortune ← 1; Momentum ← 0
  recap (AI summary of last session + open threads)
  for each scene:
    frame (who/what/where/when/why) → establish truths
    players act → resolve (tests via engine) → narrate consequences
    [action scene → structured rounds; ship scene → stations / fleet mode]
    scene end: Momentum −1, clear stress, check injuries / stabilisation
  close session
    award RU (attendance, Fortune use, challenged aspect, milestone, extras)
    or milestones (normal / spotlight / arc)
    replace challenged defining aspects
    advancement window (one per PC)
    AI writes session log + seeds for next mission
```

### AI GM responsibilities

| Responsibility | Mechanism |
|---|---|
| Narrate and voice NPCs | LLM, constrained by the scene state and the setting bible |
| Call for tests | proposes attribute + skill + difficulty, with its reasoning shown; the host can veto |
| Spend Threat | through the GM Board's quick-spends, each tied to a visible cause |
| Fail forward | on a failure, picks an alternative path or cost from the challenge graph |
| Offer success at cost and aspect complications | standard offers with Fortune attached |
| Keep pacing | scene timer against the 30-minute guide; trims or adds spare scenes |
| Fill major NPC slots | reveals logged |
| Remember | campaign memory: truths, NPC attitudes, promises made in negotiations, debts |

The AI uses **tools**, not free text, for anything mechanical (`rollTest`, `addThreat`, `createTruth`, `spawnNpc`, `advanceChallenge`). That keeps the state authoritative and auditable, and stops the model inventing rules.

### Multiplayer

- **Server-authoritative game state** with a real-time channel (WebSocket). Clients send *intents*, such as "buy 1 die with Threat"; the server validates them against the rules and broadcasts the new state.
- **Turn and claim model:** in free scenes, any player may declare an action (queued, with the GM ordering them). In action scenes the turn tracker gates input.
- **Reconnection and late joiners** pick up the full state snapshot.
- **Async play** (optional, later): play-by-post with turn notifications.

## Persistence

Campaign → arcs → missions → sessions → scenes → events. Everything is an **append-only event log** (rolls, spends, truths created, damage), with materialised snapshots. That gives undo, replays, "previously on…" recaps, and a source the AI GM can read for continuity.
