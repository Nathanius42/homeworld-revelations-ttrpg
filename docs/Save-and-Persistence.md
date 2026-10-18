# Save and Persistence

How campaigns, characters and sessions are saved, restored, shared and migrated.

## Principles

1. **Never lose a session.** Every state change is an event written to disk (or the server) before it's acknowledged.
2. **One source of truth.** In multiplayer the server owns the state; clients cache it.
3. **Saves outlive app versions.** Each save records the rules-pack version and schema version, and migrations upgrade old saves.

## What is saved

| Object | Granularity | Notes |
|---|---|---|
| Campaign | continuous | settings, seed, arcs, missions, cast, memory |
| Session | continuous, plus a closed snapshot | the event log; the end-of-session snapshot is the "chapter save" |
| Character | continuous | the build history (lifepath choices) as well as current values |
| Ship | continuous | breach and fuel state, upgrades |
| Roll log | append-only | never edited; corrections are new events |
| AI GM memory | per session | summaries, open threads, NPC attitudes; the human can review and edit it |

## Mechanisms

- **Event sourcing:** game state = snapshot + events since the snapshot. That gives:
  - **undo** (GM-approved) for misclicks and rules errors
  - **rewind to the start of a scene** when a scene goes wrong ("retcon")
  - **replay** and recaps
- **Autosave:** each event is persisted on receipt. Snapshots are taken at scene end and session end.
- **Manual save slots:** named checkpoints, such as "before the Kadeshi ambush". These are labels on snapshots, so they cost almost nothing.
- **Offline and solo:** a local SQLite store, syncing later with a conflict policy (the server wins; local divergent events become a branch to review).
- **Cloud:** a per-account store. Campaigns can be shared with players: the players get their characters plus the public state, and the GM gets everything.
- **Export and import:**
  - Campaign → a `.hwrcampaign` (zip of JSON plus assets)
  - Character → a `.hwrchar` JSON
  - Ship → a `.hwrship` JSON
  - Imports are validated against the schema and rules pack, and report which content they need (for example "requires the official data pack").
- **Backups:** daily rolling backups of the cloud store. Users can download a full archive.
- **Privacy:** the GM's hidden truths and NPC secrets are stored server-side and never sent to player clients until revealed.

## Versioning

- `schemaVersion` on every file, and forward-only migrations in code with tests.
- `packVersion` for rules content. If a pack update changes a stat, existing characters keep their values and the app flags what differs.
