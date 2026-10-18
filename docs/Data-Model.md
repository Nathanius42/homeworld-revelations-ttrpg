# Data Model

The first-cut entity model. It is split into **rules content** (static, versioned data packs) and **game state** (per campaign, event-sourced).

## Rules content (data packs)

| Entity | Key fields |
|---|---|
| `RulesConfig` | poolCap 5, boughtCap 3, momentumCap 6, threatPerPlayer 2, fortuneStart 1, fortuneCap 3, npcFirstCost, defaultDifficulty, toggles (milestones vs RU) |
| `Attribute`, `Skill` | id, name, description |
| `KiithBackground` | id, attributeBonuses[3] or "choose 3", truth, exclusiveTalentIds[], rollRange |
| `Environment` | attributeChoices[], skillChoices[], aspectExamples[], rollRange |
| `Upbringing` | accept {attr +2, attr +1}, rebel {…}, skillChoices[], focusExamples[], rollRange |
| `ProfessionTrack` | mainSkillChoices[2], focusExamples[], rollRange |
| `Career` | talentGrant, aspectConstraint, rankLimits |
| `CareerEvent` | attribute, skill, focusExamples[], aspect?, prompts[], rollRange |
| `Role` | trackRequirement, shipRequirement, talentId, minRank |
| `Talent` | id, category, requirements (expression), trigger, modifier, limits, cost? |
| `Weapon` | type, range, stressRating, effects[], qualities[], useLimit, ruCost, factions[] |
| `Equipment` | purpose, rulesHook?, useLimit, armour, ruCost |
| `ShipClass` / `Chassis` | scale, class, baseAttributes, mounts, attributePoints, upgradePoints |
| `ShipTemplate` | stat block: attributes, scale, armour, fuel, weapons[], specialFunctions[] |
| `ShipWeapon` | category, range, stress (fixed or scale + n), effects[], pointCost, requirements |
| `SpecialFunction` | class 1–3, requirements, ruCost, rulesHook |
| `Technology` | category, requirements, research {work, magnitude, resistance}, ruCost, grants |
| `NpcTemplate` | tier, heritage, stats, talents/specialRules, truths, gear |
| `Heritage` | attributeBonuses, truth, talentIds (for non-Kushan) |
| `Location`, `Faction`, `Artifact`, `Seed` | tags (era, faction, style, tone), truths, page refs |

**Talent and special-function rules hooks** are the hard part. They're modelled as a small declarative DSL (`when: { test: { skill: "Flight" }, situation: "environmental" } → difficulty: -1, min: 1`), with an escape hatch to coded handlers for the odd ones.

## Game state

| Entity | Key fields |
|---|---|
| `Campaign` | settings (style, era, type, tone, safety), seed, packVersion |
| `Player` | account, display name, connection |
| `Character` | kind (PC/SC/NPC), tier, owner/controller, stats, focuses, talents, truths, aspects (active or challenged), stress, injuries, fortune, ru, gear, slotsUndefined |
| `Ship` | template or custom build, current hull, breaches[system], fuel, crew assignments by station, crewQuality |
| `Arc`, `Mission` | goal, challenge DAG, status |
| `Session` | date, attendees, threatStart, awards |
| `Scene` | kind (scene/encounter/action/ship/fleet), zones graph, truths, participants, controller map |
| `Pools` | momentum, threat, with an event history |
| `Clock` | kind, track, current, owner |
| `Event` | append-only: roll, spend, truthCreated, damage, breach, advance, narration… |

## Storage

- Rules packs: versioned JSON/YAML, validated with a schema. The **official-content pack is local and git-ignored**; the repo ships a *system reference* pack written in our own words, plus test fixtures.
- Game state: Postgres (or SQLite for solo or offline play), with an event table plus snapshots.
