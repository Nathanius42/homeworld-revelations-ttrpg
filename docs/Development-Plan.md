# Development Plan

How we get from the corebook to a campaign-running AI GM table for six players. The work is tracked in [Azure Boards](https://dev.azure.com/molla-workshop/HWR-App/_workitems): 13 epics (#169–#181), 88 features (#182–#269) and 91 user stories (#270–#360).

- Phases 0–2 sit in the **Prototype** iteration and have user stories with acceptance criteria.
- Phases 3–5 sit in **Backlog** at feature level. They get stories when they're planned.
- Phase tags (`Phase-0` … `Phase-5`) are on the epics.

## Stack (decided: [ADR-0001](Decisions/ADR-0001-Tech-Stack.md))

A TypeScript web app: a pnpm and Turborepo monorepo holding `rules-engine`, `content`, `server` and `web`. React + Vite and react-three-fiber on the client, Colyseus on Node + Fastify for real-time play, a SQLite event store, Claude through the Anthropic TypeScript SDK, and local ComfyUI for art. It's hosted on the owner's PC over Tailscale to start.

**Option D is reserved:** a UE5 fleet viewer that would join as a spectator of the same server state.

## Phases

### Phase 0: Foundations (E01, #169)

Stack decision (ADR), monorepo scaffold, CI with coverage and en-AU spell check, the data-pack pipeline, and moving the PDFs to `reference/`.

**Exit:** an empty app builds and deploys from CI. The content policy is written.

### Phase 1: Rules core (E02 #170, E03 #171 engine, E11 #179 schemas)

Test resolution, the Momentum/Threat/Fortune ledgers, truths, personal combat, social conflict, extended tests and challenges, the talent DSL, RulesConfig, dice functions with a fair RNG, and content schemas. **No UI is needed** except a debug harness.

**Exit:** the rules engine passes property tests for every rule on the Rules Model pages, with at least 90% coverage. A scripted Quickstart fight resolves correctly in a test.

### Phase 2: Vertical slice, "The Guidestone" (E03 UI, E04 #172, E06 #174, E10 #178 local, E11, E12 #180 shell)

Roll builder and dice visuals, the lifepath and quick-build designer, pregens, the interactive sheet, the GM Board (player face, Threat panel, quick reference, NPC forge, hidden truths, zone editor), the event store with autosave, undo and rewind, and the Quickstart mission graph.

**Exit (MVP):** a human GM and up to 5 players finish the Quickstart Guidestone adventure on **one device** (a hot-seat or shared screen) with no paper.

### Phase 3: AI Game Master and campaign generation (E08 #176, E07 #175)

The GM tool API, narration, test calling, the Threat and pacing director, memory and recaps, human override, evals, then the session-zero wizard, spine and arcs, mission skeletons, hook weaving and the recurring cast.

**Exit:** the AI GM runs the Guidestone adventure solo and with 3 players, with every mechanic going through tools. The generator produces a 3-arc Exodus campaign whose first mission plays end to end.

### Phase 4: Full table, ships and fleets (E09 #177, E05 #173, E10 cloud)

Server-authoritative multiplayer for 6 players, the lobby, turn gating, absent-player handling and scaling levers. Ship model, stations, ship weapons and breaches, NPC ships, the space zone map, fleet zoom-out/zoom-in, the shipwright and technology. Cloud saves, export/import, migrations, and hidden-information filtering.

**Exit:** a 6-player online session with the AI GM plays a mission that includes a bridge-crew ship fight and a fleet skirmish. A reconnect mid-combat loses nothing.

### Phase 5: Depth and polish (E12, E13 #181, remaining E04/E05)

Supporting characters, advancement and milestones, the party builder, accessibility, the TV view, the generated art library, safety tools, recaps, rules lookup, voice, handouts, the codex, the fleet economy, achievements, the homebrew editor, and Discord.

**Exit:** a 10-session campaign with persistent progression. The app looks finished: art on every screen, ships, portraits and locations.

## Critical path

```
Stack ADR ──► Rules engine ──► Dice + Sheet + GM Board ──► Guidestone MVP
                         └──► GM tool API ──► AI GM ──► Campaign generator
                                         Multiplayer server ──► 6-player + ships ──► Polish
```

The rules engine is the long pole. Everything else depends on it, so it gets the most test investment.

## Risks

| Risk | Mitigation |
|---|---|
| Art volume (ships, portraits, locations) | a generated-art pipeline (local ComfyUI) with style presets, stored in Git LFS |
| The AI GM bends the rules | mechanics only through engine tools; evals in CI; human override |
| AI cost per session | model tiering, prompt caching, budgets shown on the GM Board |
| Six-player turns drag | strike forces, fleet mode, turn timers, async notifications |
| The talent DSL can't express everything | coded escape-hatch handlers, each with a unit test |
| Rules ambiguities | defaults and toggles in RulesConfig; tracked on [Open Questions](Open-Questions.md) |

## Next three actions

1. Scaffold the monorepo: #271, and move the PDFs to `reference/` (#272).
2. Set up CI: #273–#275.
3. Start the rules engine with test resolution: #280–#285.
