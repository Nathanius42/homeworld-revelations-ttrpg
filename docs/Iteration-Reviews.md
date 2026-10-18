# Iteration Reviews

A short look back at each stretch of work: what got done, what didn't, what we learnt, and what's next. Work items are in Azure Boards (project HWR-App); stories marked *Resolved* sit in the **Needs Playtest** column until they've been played.

## First family playtest and the night after, 17 October 2026

**Goal:** play a real game on the TV with the family, then fix what it showed.

### What the playtest showed

The game ran on the laptop (portable build) with the family on their phones and the TV over HDMI. It was valuable, and rough:

- **Taps that did nothing.** The laptop's server was so busy making Kokoro speech that it didn't answer for up to 15 seconds (measured from the desktop: the network was fine, the server wasn't). Narration fell further and further behind, and votes seemed not to register. (#882, #878)
- **Whose turn is it?** Nothing said what the game was waiting for. (#880)
- **The TV showed the host console**, not the game. (#881)
- **Sign on was hidden** under the phone browser's toolbar in the character designer. (#879)
- New players wanted a short **orientation** at the start. (#887)

### Done

| Area | Result | Board |
|---|---|---|
| Responsiveness | Kokoro in a worker thread with capped threads; the server answers within ~40 ms while speaking. Falls back to browser voices on a PC too slow to keep up, and skips stale narration | #882, #878 |
| Speak-ahead | The server makes each line's audio as soon as it's written; the TV's wait per line fell from 2.3 s to 0.6 s | #878 |
| Turns | A "waiting on" banner on the TV and every phone, "Your move" with a buzz, "Sending…" on every tap, open tests suggesting who's best placed, a nudge when the table goes quiet | #880 |
| TV | Opens full screen on the TV by itself, follows the table picked on the host console, waits with a proper screen | #881 |
| Onboarding | "Before you begin" in the lobby: the setting, the stakes, how a turn works | #887 |
| Phones | Panels sized to the visible screen (`dvh`) so buttons aren't hidden | #879 |
| Campaign | Chapters, *Continue the campaign* with the same crew and seats, advances, requisition, a "Previously…" recap | #903 |
| Content | *The Road to Tiir*, a sequel to the Khar-Toba (private), with three new desert paintings | #908 |
| Real dice | Roll d20s at the table and type them in | #910 |
| Launcher | Tray app with the Kushan badge, Edge app windows, shortcuts | #834 |
| Testing | **The virtual family**: bots play a whole mission against a running server, timed, with speech | #900 |

### What we learnt

- **Test with the real machine and real load.** Every unit and e2e test passed on the desktop; only a family on the laptop found the blocked server. The virtual family now reproduces that load on any PC, in minutes.
- **A tap must always answer.** Even when the game is slow, "Sending…" turns silence into patience.
- **Shared rules, shared code.** The voice choice and sentence splitting now live in one place, so the server can prepare exactly what the TV will ask for (and the test asking for something different gave a misleading result until it did too).

### Next

- Play again with the family: confirm the fixes in the *Needs Playtest* column.
- Run the virtual family on the laptop before the next game night.
- Scars and lasting injuries, ship upgrades with RU, and picking up an older campaign.

## Prototype: overnight build, 16–17 October 2026

**Goal:** a playable, good-looking Homeworld: Revelations table for friends, with no human GM needed.

### Done

| Area | Result | Board |
|---|---|---|
| Foundations | pnpm + Turborepo monorepo, strict TypeScript, CI pipeline (*HWR-App CI*, green) | #362, #372 |
| Rules | 2d20 tests, Momentum/Threat/Fortune, stress and injuries, extended tests, **assists** | #363, #382 |
| Content | Six pregenerated crew; two missions, *The Silent Beacon* and *Cold Harbour*; a mission validator | #364, #383 |
| GM | **Director** (scripted, no key needed) and **Claude GM** (tool use; mock-tested) | #365, #366 |
| Multiplayer | Fastify + WebSockets, up to six players plus spectators and a GM; reconnects to the same seat | #367 |
| Saves | SQLite snapshot after every change, plus an action log | #368 |
| Web client | Homeworld HUD design, lobby with a mission picker, roll builder with live odds, combat, debrief, phone layout | #369, #384 |
| Dice | 3D grey d20s with the Kushan emblem on the 1, Challenge Dice, upright results | #370 |
| Art | Scenes painted over renders of the **real HWRM ship models**; painterly interiors and portraits | #371, #377 |
| Fleet Archive | The real ships in 3D, from local files only | #381 |
| Sound | Synthesised drone and cues, with a mute toggle | #385 |
| Character designer | Point-buy *Personnel office* in the lobby, with a generated portrait gallery | #386 |
| Debrief | Crew citations from running per-character stats | #387 |
| Ship combat | **Space battles** at bridge stations (ship system + skill, breaches, enemy ships with the real models); Cold Harbour's escape | #390 |
| Couch play | **TV view** (`/t/CODE/tv`) for a big screen while players use phones; a *How to play* field manual | #388, #389 |
| Tests | 300 simulated playthroughs in unit tests; Playwright plays both missions in real browsers | #376 |
| Ways of working | Project skills in `.claude/skills`; this review; wiki pages for Getting Started and the Art Pipeline | |

### Not done

- **The Claude GM hasn't met the real API.** It needs `ANTHROPIC_API_KEY` in `.env`; everything else about it is tested with a scripted fake.
- **Joining from a second device on the LAN** hasn't been tried; it needs a person.
- **Deserts of Kharak units** need a Unity extractor first (#378).
- The full lifepath wizard, fleet-scale battles (zones, squadrons, one ship per player), the campaign generator and the GM Board are still designs on the wiki.

### What we learnt

- **Simulate before you tune.** The balance simulator played 1,200 sessions in seconds and found a game-stalling bug (#373) and two difficulty problems that a hand test would have missed.
- **Real assets beat clever prompts.** IP-Adapter alone painted generic ships. Rendering the actual game models and painting over them made the Mothership *the* Mothership. Nathan's correction that it flies upright made the title image.
- **Look at the screenshots.** Layout problems (a squeezed log, stretched cards, unreadable captions) only showed up in the e2e screenshots.
- **Make unattended tools fail, not prompt.** A double-encoded token opened a sign-in window instead of failing (#379); a pipe hid a failing typecheck, and CI caught it (#380).
- **Races in UI tests are real.** "Is it there? Click it." breaks when the server replaces the button in between; every action needs a bounded timeout.

### Next

1. Play a session with friends; close or reopen the *Needs Playtest* stories from what you see.
2. Add the API key and try the Claude GM, especially free-text actions in combat.
3. Pick the next big piece: ship combat (E05), the campaign generator (E07), or the GM Board (E06).
