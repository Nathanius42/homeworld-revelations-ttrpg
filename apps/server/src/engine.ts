import { randomUUID } from "node:crypto";
import {
  FORTUNE_START,
  WORK_DICE,
  addThreat,
  adjustDifficulty,
  applyStress,
  applyWork,
  bankMomentum,
  conditionOf,
  createExtendedTest,
  evaluateAssistedTest,
  cryptoRng,
  endScene,
  extraDiceCost,
  payCost,
  rerollDice,
  rollAttackStress,
  rollChallengeDice,
  rollTest,
  evaluateTest,
  sessionStartPools,
  spendThreat,
  threatFromTruths,
  type Rng,
  type Attribute,
  type Skill,
  type StressOutcome,
  type TestResult,
  type TestSpec,
  type Truth,
} from "@hwr/rules-engine";
import {
  LOG_LIMIT,
  MAX_PLAYERS,
  type Approach,
  type CharacterSheet,
  type AssistDieRecord,
  type ClientMessage,
  type CrewStats,
  type CustomCharacterInput,
  type GmMode,
  type LogEntry,
  type NpcState,
  type PlayerInfo,
  type Role,
  type RollRecord,
  type RollRequest,
  type ShipRange,
  type ShipState,
  type ShipSystem,
  type StationAction,
  type TableState,
  type WeaponSheet,
  type InventoryItem,
  type ItemSize,
  type ItemStatus,
  SHIP_SYSTEMS,
  INFIRMARY_COST,
  type StoryState,
} from "@hwr/protocol";
import { localPortraits } from "./local-portraits.js";
import { recap, recordChapter } from "./campaign.js";
import { BULK, capacity, findItem, load, newItem, setStatus, startingInventory, usable, useItem } from "./inventory.js";
import {
  CREW,
  DesignError,
  IDENTIFYING_DETAILS,
  buildCustomSheet,
  MISSIONS,
  REQUISITION,
  SHIP_REFITS,
  applyRefits,
  meets,
  type CombatNode,
  type Effects,
  type ExtendedNode,
  type Mission,
  type SpaceNode,
  type EnemyShipSpec,
  type MissionNode,
  type Outcome,
  type SceneSetup,
} from "@hwr/content";

/** A rule or permission problem with a client request; the message is shown to that player. */
export class GameError extends Error {}

export interface GameHooks {
  /** A player described an action in free text. */
  onPlayerAction?(player: PlayerInfo, text: string): void;
  /** A roll requested by the GM (not the mission) was accepted. */
  onSideRoll?(record: RollRecord): void;
}

const uid = () => randomUUID().slice(0, 8);

const SECOND_ROUND = 2;
const MAX_ASSISTS = 4;
/** The six pregenerated crew plus room for custom designs. */
const MAX_SHEETS = 18;
const NPC_ATTACK_DIFFICULTY = 2;
const PC_ATTACK_DIFFICULTY = 2;

/** Checks real dice typed in at the table: the right number of d20s, each a whole number from 1 to 20. */
export function realDice(faces: readonly number[], expected: number): number[] {
  if (faces.length !== expected) throw new GameError(`Enter all ${expected} dice.`);
  for (const f of faces) if (!Number.isInteger(f) || f < 1 || f > 20) throw new GameError("Each d20 shows a number from 1 to 20.");
  return [...faces];
}

export function newTableState(opts: { id: string; code: string; name: string; missionId: string; aiAvailable: boolean }): TableState {
  const mission = MISSIONS[opts.missionId];
  if (!mission) throw new GameError(`unknown mission ${opts.missionId}`);
  return {
    id: opts.id,
    code: opts.code,
    name: opts.name,
    phase: "lobby",
    gmMode: opts.aiAvailable ? "claude" : "director",
    aiAvailable: opts.aiAvailable,
    missionId: mission.id,
    missionTitle: mission.title,
    missionBlurb: mission.blurb,
    missionArt: mission.art,
    missionMusic: mission.music,
    missionVoices: mission.voices,
    missionPrimer: mission.primer,
    recommendedPlayers: mission.recommendedPlayers,
    players: [],
    sheets: structuredClone(CREW),
    characters: Object.fromEntries(CREW.map((c) => [c.id, { sheetId: c.id, stress: 0, injuries: 0, fortune: FORTUNE_START, inventory: startingInventory(c.equipment) }])),
    pools: { momentum: 0, threat: 0 },
    scene: {
      id: "lobby",
      title: mission.title,
      location: "Mothership, crew quarters",
      art: "/art/scenes/title.webp",
      truths: [],
      mode: "scene",
      npcs: [],
      round: 0,
      acted: [],
      npcActed: [],
    },
    log: [],
    gmThinking: false,
    awaitingContinue: false,
    seq: 0,
  };
}

/**
 * The rules referee and Director GM. It runs the mission graph, adjudicates every
 * roll and plays the NPCs. AI and human GMs act through the same methods.
 */
export class Game {
  constructor(
    public state: TableState,
    private readonly rng: Rng = cryptoRng(),
    public hooks: GameHooks = {},
  ) {}

  get mission(): Mission {
    return MISSIONS[this.state.missionId]!;
  }

  // ---------------------------------------------------------------- players

  join(name: string, role: Role, playerId?: string): PlayerInfo {
    const existing = playerId ? this.state.players.find((p) => p.id === playerId) : undefined;
    if (existing) {
      existing.connected = true;
      existing.name = name.trim().slice(0, 32) || existing.name;
      return existing;
    }
    if (role === "player" && this.state.players.filter((p) => p.role === "player").length >= MAX_PLAYERS) {
      throw new GameError(`This table is full (${MAX_PLAYERS} players). Join as a spectator instead.`);
    }
    if (role === "gm" && this.state.players.some((p) => p.role === "gm")) {
      throw new GameError("This table already has a GM.");
    }
    const player: PlayerInfo = { id: randomUUID(), name: name.trim().slice(0, 32) || "Crew member", role, connected: true };
    this.state.players.push(player);
    this.system(`${player.name} joined the table${role === "player" ? "" : ` as ${role === "gm" ? "the GM" : "a spectator"}`}.`);
    return player;
  }

  disconnect(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    if (this.state.pendingChoice) this.tryResolveChoice();
  }

  handle(playerId: string, msg: ClientMessage): void {
    const player = this.player(playerId);
    switch (msg.type) {
      case "hello":
        return;
      case "claimCharacter":
        return this.claimCharacter(player, msg.characterId);
      case "createCharacter":
        return this.createCharacter(player, msg.character);
      case "setGmMode":
        return this.setGmMode(msg.mode);
      case "setMission":
        return this.setMission(msg.missionId);
      case "startGame":
        return this.start();
      case "playerAction":
        return this.playerAction(player, msg.text);
      case "takeRoll":
        return this.takeRoll(player, msg.characterId);
      case "roll":
        return this.roll(player, msg);
      case "fortuneReroll":
        return this.fortuneReroll(player, msg.indices);
      case "assist":
        return this.toggleAssist(player, msg.characterId);
      case "acceptRoll":
        return this.accept(player, msg.bonus ?? 0);
      case "advance":
        return this.advance();
      case "combatAction":
        return this.combatAction(player, msg);
      case "stationAction":
        return this.stationAction(player, msg);
      case "vote":
        return this.vote(player, msg.optionId);
      case "spendAdvance":
        return this.spendAdvance(player, msg);
      case "requisition":
        return this.requisition(player, msg.characterId, msg.itemId);
      case "treatWound":
        return this.treatWound(player, msg.characterId);
      case "refit":
        return this.refit(player, msg.refitId);
      case "gmNarrate":
        this.requireGm(player);
        return this.narrate("Game Master", msg.text, "gm");
      case "gmThreat":
        this.requireGm(player);
        return this.adjustThreat(msg.delta, msg.cause);
      case "gmCallTest":
        this.requireGm(player);
        return this.callSideTest({ ...msg.request, askedBy: player.name });
    }
  }

  private player(id: string): PlayerInfo {
    const player = this.state.players.find((p) => p.id === id);
    if (!player) throw new GameError("You are not at this table.");
    return player;
  }

  private requireGm(player: PlayerInfo): void {
    if (player.role !== "gm") throw new GameError("Only the GM can do that.");
  }

  private claimCharacter(player: PlayerInfo, characterId: string | null): void {
    if (player.role !== "player") throw new GameError("Spectators and the GM don't play a character.");
    if (player.characterId) {
      const old = this.state.characters[player.characterId];
      if (old) delete old.controllerId;
      delete player.characterId;
    }
    if (!characterId) return;
    const state = this.state.characters[characterId];
    if (!state) throw new GameError("No such character.");
    const holder = this.state.players.find((p) => p.id === state.controllerId);
    if (holder && holder.id !== player.id && holder.connected) throw new GameError(`${holder.name} is already playing that character.`);
    if (holder) delete holder.characterId;
    state.controllerId = player.id;
    player.characterId = characterId;
    if (this.state.phase !== "lobby") this.system(`${player.name} takes the helm of ${this.sheet(characterId).name}.`);
  }

  private createCharacter(player: PlayerInfo, input: CustomCharacterInput): void {
    if (player.role !== "player") throw new GameError("Spectators and the GM don't play a character.");
    if (this.state.sheets.length >= MAX_SHEETS) throw new GameError("This table has as many crew as it can hold.");
    let sheet: CharacterSheet;
    try {
      sheet = buildCustomSheet(input, `custom-${uid()}`, localPortraits().map((p) => p.url));
    } catch (err) {
      if (err instanceof DesignError) throw new GameError(err.issues.join(" "));
      throw err;
    }
    this.state.sheets.push(sheet);
    this.state.characters[sheet.id] = { sheetId: sheet.id, stress: 0, injuries: 0, fortune: FORTUNE_START, inventory: startingInventory(sheet.equipment) };
    this.system(`${player.name} signs on ${sheet.name}, ${sheet.crewRole} of Kiith ${sheet.kiith}.`);
    this.claimCharacter(player, sheet.id);
  }

  private setGmMode(mode: GmMode): void {
    if (this.state.phase !== "lobby") throw new GameError("The GM can only be changed in the lobby.");
    if (mode === "claude" && !this.state.aiAvailable) throw new GameError("The Claude GM needs an API key on the server.");
    this.state.gmMode = mode;
  }

  private setMission(missionId: string): void {
    if (this.state.phase !== "lobby") throw new GameError("The mission can only be changed in the lobby.");
    const mission = MISSIONS[missionId];
    if (!mission) throw new GameError("No such mission.");
    Object.assign(this.state, {
      missionId: mission.id,
      missionTitle: mission.title,
      missionBlurb: mission.blurb,
      missionArt: mission.art,
      missionMusic: mission.music,
      missionVoices: mission.voices,
      missionPrimer: mission.primer,
      recommendedPlayers: mission.recommendedPlayers,
    });
    this.state.scene.title = mission.title;
  }

  // ---------------------------------------------------------------- session flow

  start(): void {
    if (this.state.phase !== "lobby") throw new GameError("The session has already started.");
    const party = this.partyIds();
    if (party.length === 0) throw new GameError("Choose at least one character before launching.");
    this.state.pools = sessionStartPools(party.length);
    this.state.phase = "playing";
    this.state.awards = { ru: 0, reasons: [] };
    for (const id of party) Object.assign(this.state.characters[id]!, { fortune: FORTUNE_START, hurt: false, downed: false });
    const wounded = party.filter((id) => this.state.characters[id]!.injuries > 0).map((id) => this.sheet(id).name);
    // The story carries on from the campaign; a mission with a countdown starts it if this campaign hasn't met it yet.
    const story = (this.state.story = structuredClone(this.state.campaign?.story) ?? { flags: {} });
    const clock = this.mission.clock;
    if (clock && story.clock?.id !== clock.id) story.clock = { ...clock, value: 0 };
    this.system(`Mission start: ${this.mission.title}. ${party.length} crew aboard. Threat starts at ${this.state.pools.threat}.`);
    const previously = this.state.campaign && recap(this.state.campaign);
    if (previously) this.narrate("Narrator", previously, "gm");
    if (wounded.length) this.system(`${wounded.join(", ")} ${wounded.length > 1 ? "start" : "starts"} the mission still wounded: one more injury and they're down.`);
    this.enterNode(this.mission.startNode);
  }

  // ---------------------------------------------------------------- between missions

  /** Spends one of a character's campaign advances: +1 to a skill (up to 5) or a new focus. */
  private spendAdvance(player: PlayerInfo, msg: Extract<ClientMessage, { type: "spendAdvance" }>): void {
    if (this.state.phase !== "lobby") throw new GameError("Advances are spent between missions, in the lobby.");
    this.requireController(player, msg.characterId);
    const campaign = this.state.campaign;
    if (!campaign || (campaign.advances[msg.characterId] ?? 0) < 1) throw new GameError("No advance to spend yet: finish a mission first.");
    const sheet = this.sheet(msg.characterId);
    if (msg.skill) {
      const now = sheet.skills[msg.skill];
      if (now >= 5) throw new GameError(`${sheet.name}'s ${msg.skill} is already as high as it goes.`);
      sheet.skills[msg.skill] = now + 1;
      this.system(`${sheet.name} has learned from experience: ${msg.skill} rises to ${now + 1}.`);
    } else {
      const focus = msg.focus?.trim().slice(0, 40) ?? "";
      if (focus.length < 2) throw new GameError("Name the new focus.");
      if (sheet.focuses.some((f) => f.toLowerCase() === focus.toLowerCase())) throw new GameError(`${sheet.name} already has that focus.`);
      if (sheet.focuses.length >= 8) throw new GameError(`${sheet.name} has as many focuses as a crew member can hold.`);
      sheet.focuses.push(focus);
      this.system(`${sheet.name} has learned from experience: a new focus, ${focus}.`);
    }
    campaign.advances[msg.characterId] = (campaign.advances[msg.characterId] ?? 1) - 1;
  }

  /** Buys kit from the fleet with the campaign's banked Requisition. */
  private requisition(player: PlayerInfo, characterId: string, itemId: string): void {
    if (this.state.phase !== "lobby") throw new GameError("Requisition happens between missions, in the lobby.");
    this.requireController(player, characterId);
    const campaign = this.state.campaign;
    if (!campaign) throw new GameError("Requisition is earned on missions: finish one first.");
    const item = REQUISITION.find((r) => r.id === itemId);
    if (!item) throw new GameError("The fleet doesn't stock that.");
    if (campaign.ru < item.cost) throw new GameError(`${item.name} costs ${item.cost} RU and the crew has ${campaign.ru}.`);
    this.giveItem(characterId, item.name, "Requisitioned from the fleet", item.uses, item.size);
    campaign.ru -= item.cost;
  }

  /** Refits the crew's ship with the campaign's banked Requisition. Any of the crew can order it; each refit is done once. */
  private refit(player: PlayerInfo, refitId: string): void {
    if (this.state.phase !== "lobby") throw new GameError("The shipyard works between missions, in the lobby.");
    if (!player.characterId) throw new GameError("Only the crew can order a refit.");
    const campaign = this.state.campaign;
    if (!campaign) throw new GameError("Requisition is earned on missions: finish one first.");
    const refit = SHIP_REFITS.find((r) => r.id === refitId);
    if (!refit) throw new GameError("The shipyard doesn't offer that.");
    const done = (campaign.refits ??= []);
    if (done.includes(refit.id)) throw new GameError(`The ship already has ${refit.name.toLowerCase()}.`);
    if (campaign.lostRefits?.includes(refit.id)) throw new GameError(`${refit.name} can't be fitted again: that system was cut off for good.`);
    if (campaign.ru < refit.cost) throw new GameError(`${refit.name} costs ${refit.cost} RU and the crew has ${campaign.ru}.`);
    campaign.ru -= refit.cost;
    done.push(refit.id);
    this.system(`The shipyard fits ${refit.name.toLowerCase()} (${refit.cost} RU).`);
  }

  /** The fleet infirmary treats a wound carried from the last mission, for 1 RU of the campaign's Requisition. */
  private treatWound(player: PlayerInfo, characterId: string): void {
    if (this.state.phase !== "lobby") throw new GameError("The infirmary treats wounds between missions, in the lobby.");
    this.requireController(player, characterId);
    const campaign = this.state.campaign;
    const c = this.state.characters[characterId]!;
    const sheet = this.sheet(characterId);
    if (!campaign || c.injuries < 1) throw new GameError(`${sheet.name} has no wound to treat.`);
    if (campaign.ru < INFIRMARY_COST) throw new GameError(`The infirmary needs ${INFIRMARY_COST} RU and the crew has ${campaign.ru}.`);
    c.injuries = 0;
    campaign.ru -= INFIRMARY_COST;
    this.system(`The fleet surgeons treat ${sheet.name}'s wound. ${sheet.name} is fit for duty.`);
  }

  advance(): void {
    if (!this.state.awaitingContinue) return;
    const node = this.currentNode();
    this.state.awaitingContinue = false;
    if (node?.type === "narration") this.enterNode(node.next);
  }

  private currentNode(): MissionNode | undefined {
    return this.state.nodeId ? this.mission.nodes[this.state.nodeId] : undefined;
  }

  private enterNode(id: string): void {
    const node = this.mission.nodes[id];
    if (!node) throw new Error(`mission ${this.mission.id} has no node ${id}`);
    this.state.nodeId = id;
    if (node.scene) this.setScene(node.scene);
    switch (node.type) {
      case "narration":
        this.narrate(node.speaker, node.text, node.tone ?? "gm");
        if (node.effects) this.applyEffects(node.effects);
        this.state.awaitingContinue = true;
        return;
      case "choice": {
        this.narrate("Narrator", node.prompt, "gm");
        const offered = node.options.filter((o) => !o.requires || meets(o.requires, this.state.story));
        this.state.pendingChoice = { id: node.id, prompt: node.prompt, options: offered.map(({ id, label, hint }) => ({ id, label, hint })), votes: {} };
        return;
      }
      case "branch": {
        const taken = node.cases.find((c) => meets(c.when, this.state.story));
        return this.enterNode(taken?.next ?? node.otherwise);
      }
      case "test":
        this.narrate("Narrator", node.prompt, "gm");
        this.requestRoll({
          kind: "test",
          origin: "mission",
          reason: node.reason,
          approaches: node.approaches,
          focusHint: node.focusHint,
          complicationRange: node.complicationRange,
        });
        return;
      case "combat":
        return this.startCombat(node);
      case "space":
        return this.startSpace(node);
      case "extended":
        this.narrate("Narrator", node.prompt, "gm");
        this.state.extended = { ...createExtendedTest(node.id, node.label, node.work, node.magnitude, node.resistance), attemptsLeft: node.attempts };
        this.requestWork(node);
        return;
      case "end": {
        this.narrate("Fleet Command", node.text, "fleet");
        this.award(node.ru, "Mission complete");
        recordChapter(this.state, this.mission.title, node.text);
        this.state.phase = "ended";
        this.state.scene.mode = "scene";
        this.system(`Session over. The crew earned ${this.state.awards?.ru ?? 0} RU.`);
        return;
      }
    }
  }

  private setScene(setup: SceneSetup): void {
    const firstScene = this.state.scene.id === "lobby";
    const carried = this.state.scene.truths.filter((t) => t.scope === "situation");
    const fresh = (setup.truths ?? []).filter((t) => !carried.some((c) => c.id === t.id));
    this.state.scene = {
      id: uid(),
      title: setup.title,
      location: setup.location,
      art: setup.art,
      truths: [...carried, ...structuredClone(fresh)],
      ...(setup.mood ? { mood: setup.mood } : {}),
      mode: "scene",
      npcs: [],
      round: 0,
      acted: [],
      npcActed: [],
    };
    if (!firstScene) {
      this.state.pools = endScene(this.state.pools);
      for (const id of this.partyIds()) this.state.characters[id]!.stress = 0;
    }
    const threat = threatFromTruths(fresh);
    if (threat > 0) this.adjustThreat(threat, fresh.filter((t) => t.kind === "threat").map((t) => t.label).join(", "));
  }

  private applyOutcome(outcome: Outcome, rollerId?: string): void {
    this.narrate(outcome.speaker ?? "Narrator", outcome.text, outcome.speaker === "Fleet Command" ? "fleet" : "gm");
    if (outcome.effects) this.applyEffects(outcome.effects, rollerId);
    if (this.state.phase === "playing") this.enterNode(outcome.next);
  }

  private applyEffects(effects: Effects, rollerId?: string): void {
    if (effects.momentum) this.gainMomentum(effects.momentum);
    if (effects.threat) this.adjustThreat(effects.threat, "the situation turns against you");
    for (const truth of effects.addTruths ?? []) this.addTruth(truth);
    for (const id of effects.removeTruths ?? []) this.removeTruth(id);
    if (effects.stressRoller && rollerId) this.damagePc(rollerId, effects.stressRoller);
    if (effects.stressParty) for (const id of this.partyIds()) this.damagePc(id, effects.stressParty);
    if (effects.ru) this.award(effects.ru, "Objective secured");
    if (effects.giveItem) {
      const to = rollerId ?? this.leastLoaded();
      if (to) this.giveItem(to, effects.giveItem.name, effects.giveItem.origin, effects.giveItem.uses, effects.giveItem.size, true);
    }
    if (effects.setFlags) Object.assign(this.story().flags, effects.setFlags);
    if (effects.clock) this.advanceClock(effects.clock);
    if (effects.loseRefits) this.loseRefits(effects.loseRefits);
  }

  /** Strips refits from the campaign's ship for good, naming each one the crew actually had. */
  private loseRefits(ids: readonly string[]): void {
    const campaign = this.state.campaign;
    if (!campaign) return;
    campaign.lostRefits = [...new Set([...(campaign.lostRefits ?? []), ...ids])];
    const lost = (campaign.refits ?? []).filter((id) => ids.includes(id));
    if (!lost.length) return;
    campaign.refits = campaign.refits!.filter((id) => !ids.includes(id));
    const names = lost.map((id) => SHIP_REFITS.find((r) => r.id === id)?.name.toLowerCase() ?? id);
    this.system(`Lost for good: ${names.join(" and ")}.`);
  }

  /** What the story remembers in this mission. */
  private story(): StoryState {
    return (this.state.story ??= { flags: {} });
  }

  /** Runs the campaign countdown on (or back), within its bounds, and tells the table. */
  private advanceClock(delta: number): void {
    const clock = this.story().clock;
    if (!clock) return;
    const before = clock.value;
    clock.value = Math.max(0, Math.min(clock.max, clock.value + delta));
    if (clock.value === before) return;
    const full = clock.value === clock.max ? " The countdown has run out." : "";
    this.system(`${clock.label}: ${clock.value} of ${clock.max}.${full}`);
  }

  private award(ru: number, reason: string): void {
    this.state.awards ??= { ru: 0, reasons: [] };
    this.state.awards.ru += ru;
    this.state.awards.reasons.push(`${reason}: ${ru} RU`);
  }

  // ---------------------------------------------------------------- shared GM moves

  narrate(speaker: string, text: string, tone: "fleet" | "npc" | "gm" | "danger" = "gm"): void {
    this.log({ type: "narration", speaker, text, tone });
  }

  system(text: string): void {
    this.log({ type: "system", text });
  }

  adjustThreat(delta: number, cause: string): void {
    if (delta === 0) return;
    const pools = this.state.pools;
    this.state.pools = delta > 0 ? addThreat(pools, delta) : spendThreat(pools, Math.min(pools.threat, -delta));
    this.system(`Threat ${delta > 0 ? "+" : "−"}${Math.abs(delta)}: ${cause}.`);
  }

  addTruth(truth: Truth): void {
    if (this.state.scene.truths.some((t) => t.id === truth.id)) return;
    this.state.scene.truths.push({ ...truth });
    this.system(`New ${truth.kind}: ${truth.label}.`);
  }

  removeTruth(id: string): void {
    const truth = this.state.scene.truths.find((t) => t.id === id);
    if (!truth) return;
    this.state.scene.truths = this.state.scene.truths.filter((t) => t.id !== id);
    this.system(`No longer true: ${truth.label}.`);
  }

  private gainMomentum(amount: number): void {
    const { pools, lost } = bankMomentum(this.state.pools, amount);
    this.state.pools = pools;
    if (lost > 0) this.system(`The Momentum pool is full; ${lost} Momentum lost.`);
  }

  playerAction(player: PlayerInfo, text: string): void {
    const clean = text.trim().slice(0, 600);
    if (!clean) return;
    const characterName = player.characterId ? this.sheet(player.characterId).name : undefined;
    this.log({ type: "action", playerName: player.name, characterName, text: clean });
    this.hooks.onPlayerAction?.(player, clean);
  }

  /** A test asked for by the GM outside the mission script. Its result goes back to the GM. */
  callSideTest(req: Pick<RollRequest, "characterId" | "attribute" | "skill" | "difficulty" | "reason" | "focusHint" | "askedBy">): void {
    if (this.state.phase !== "playing") throw new GameError("The session isn't running.");
    if (this.state.pendingRoll) throw new GameError("Another roll is already waiting.");
    if (req.characterId && !this.partyIds().includes(req.characterId)) throw new GameError("That character isn't in the party.");
    this.requestRoll({
      kind: "test",
      origin: "side",
      characterId: req.characterId,
      reason: req.reason,
      focusHint: req.focusHint,
      askedBy: req.askedBy,
      approaches: [{ label: req.reason, attribute: req.attribute, skill: req.skill, difficulty: Math.max(0, Math.min(5, req.difficulty)) }],
    });
  }

  // ---------------------------------------------------------------- choices

  private vote(player: PlayerInfo, optionId: string): void {
    const choice = this.state.pendingChoice;
    if (!choice) throw new GameError("There's nothing to vote on.");
    if (!player.characterId && player.role !== "gm") throw new GameError("Only the crew vote.");
    if (!choice.options.some((o) => o.id === optionId)) throw new GameError("No such option.");
    if (player.role === "gm") return this.resolveChoice(optionId);
    choice.votes[player.id] = optionId;
    this.tryResolveChoice();
  }

  private tryResolveChoice(): void {
    const choice = this.state.pendingChoice;
    if (!choice) return;
    const voters = this.state.players.filter((p) => p.connected && p.characterId);
    if (voters.length === 0 || !voters.every((p) => choice.votes[p.id])) return;
    const tally = new Map<string, number>();
    for (const p of voters) tally.set(choice.votes[p.id]!, (tally.get(choice.votes[p.id]!) ?? 0) + 1);
    const best = Math.max(...tally.values());
    const tied = [...tally.entries()].filter(([, n]) => n === best).map(([id]) => id);
    const winner = this.pick(tied);
    if (tied.length > 1) this.system("The vote is tied; fate decides.");
    this.resolveChoice(winner);
  }

  private resolveChoice(optionId: string): void {
    const node = this.currentNode();
    if (node?.type !== "choice") return;
    const option = node.options.find((o) => o.id === optionId)!;
    delete this.state.pendingChoice;
    this.system(`The crew decides: ${option.label}.`);
    if (option.effects) this.applyEffects(option.effects);
    if (this.state.phase === "playing") this.enterNode(option.next);
  }

  // ---------------------------------------------------------------- rolls

  private requestRoll(req: Omit<RollRequest, "id" | "attribute" | "skill" | "difficulty"> & { approaches: Approach[] }): void {
    this.ensureSomeoneStanding();
    const first = req.approaches[0]!;
    this.state.pendingRoll = { id: uid(), attribute: first.attribute, skill: first.skill, difficulty: first.difficulty, ...req };
  }

  private takeRoll(player: PlayerInfo, characterId: string): void {
    const pending = this.state.pendingRoll;
    if (!pending || pending.rolled) throw new GameError("There's no roll to take.");
    if (pending.characterId && pending.characterId !== characterId) throw new GameError("This roll is for someone else.");
    this.requireController(player, characterId);
    pending.characterId = characterId;
  }

  private requireController(player: PlayerInfo, characterId: string): void {
    const state = this.state.characters[characterId];
    if (!state?.controllerId) throw new GameError("That character isn't in the party.");
    if (state.controllerId !== player.id && player.role !== "gm") throw new GameError("That isn't your character.");
    if (conditionOf(state.injuries) !== "active") throw new GameError(`${this.sheet(characterId).name} is in no state to act.`);
  }

  /** Crew can lend a die to any waiting test except an attack. */
  private toggleAssist(player: PlayerInfo, characterId: string): void {
    const pending = this.state.pendingRoll;
    if (!pending || pending.rolled) throw new GameError("There's no test waiting for help.");
    if (pending.kind === "attack") throw new GameError("Attacks can't be assisted.");
    if (pending.characterId === characterId) throw new GameError("You can't assist your own test.");
    this.requireController(player, characterId);
    const assists = pending.assists ?? [];
    const existing = assists.findIndex((a) => a.characterId === characterId);
    if (existing >= 0) {
      assists.splice(existing, 1);
    } else {
      if (assists.length >= MAX_ASSISTS) throw new GameError(`At most ${MAX_ASSISTS} crew can help with one test.`);
      assists.push({ characterId, characterName: this.sheet(characterId).name });
    }
    pending.assists = assists;
  }

  /** Rolls the assistants' dice and re-scores the test with them. */
  private withAssists(spec: TestSpec, leader: TestResult, assists: AssistDieRecord[]): TestResult {
    if (assists.length === 0) return leader;
    const result = evaluateAssistedTest(
      spec,
      leader.dice.map((d) => d.face),
      assists.map((a) => ({ attribute: a.attribute, skill: a.skill, focus: false, face: a.die.face })),
    );
    result.assists.forEach((die, i) => (assists[i]!.die = die));
    return result;
  }

  private roll(player: PlayerInfo, msg: Extract<ClientMessage, { type: "roll" }>): void {
    const pending = this.state.pendingRoll;
    if (!pending) throw new GameError("There's no roll waiting.");
    if (pending.rolled) throw new GameError("The dice are already down.");
    const characterId = pending.characterId ?? player.characterId;
    if (!characterId) throw new GameError("Choose a character first.");
    this.requireController(player, characterId);
    const approaches = pending.approaches ?? [{ label: pending.reason, attribute: pending.attribute, skill: pending.skill, difficulty: pending.difficulty }];
    const approach = approaches[msg.approachIndex ?? 0];
    if (!approach) throw new GameError("No such approach.");

    const sheet = this.sheet(characterId);
    const character = this.state.characters[characterId]!;
    const bought = Math.max(0, Math.min(3, Math.floor(msg.boughtDice)));
    const presetCrits = msg.fortuneCritical ? 1 : 0;
    if (presetCrits && character.fortune < 1) throw new GameError("No Fortune left.");
    const { pools, payment } = payCost(this.state.pools, extraDiceCost(bought), msg.payWithThreat);
    this.state.pools = pools;
    if (presetCrits) character.fortune -= 1;

    const item = msg.itemId ? this.usableItem(characterId, msg.itemId) : undefined;
    const difficulty = item ? Math.max(0, approach.difficulty - 1) : approach.difficulty;
    const spec: TestSpec = {
      attribute: approach.system && this.state.space ? this.state.space.ship.systems[approach.system] : sheet.attributes[approach.attribute],
      skill: sheet.skills[approach.skill],
      focus: msg.useFocus,
      difficulty,
      complicationRange: pending.complicationRange,
      dice: 2 + bought,
      presetCrits,
    };
    // The leader rolls first (or types in real dice), then each assistant adds a die.
    const leader = msg.faces ? evaluateTest(spec, [...Array(presetCrits).fill(1), ...realDice(msg.faces, spec.dice - presetCrits)]) : rollTest(spec, this.rng);
    const assists: AssistDieRecord[] = (pending.assists ?? [])
      .filter((a) => a.characterId !== characterId && conditionOf(this.state.characters[a.characterId]?.injuries ?? 2) === "active")
      .map((a) => {
        const helper = this.sheet(a.characterId);
        const face = this.rng.die(20);
        return {
          characterId: a.characterId,
          characterName: a.characterName,
          attribute: helper.attributes[approach.attribute],
          skill: helper.skills[approach.skill],
          die: { face, successes: 0, complication: false, preset: false },
        };
      });
    const result = this.withAssists(spec, leader, assists);
    pending.characterId = characterId;
    pending.attribute = approach.attribute;
    pending.skill = approach.skill;
    pending.difficulty = difficulty;
    pending.rolled = {
      requestId: pending.id,
      characterId,
      characterName: sheet.name,
      label: approach.label,
      result,
      boughtDice: bought,
      payment,
      fortuneSpent: presetCrits > 0,
      spec,
      ...(assists.length ? { assists } : {}),
      ...(item ? { item: { id: item.id, name: item.name } } : {}),
      ...(msg.faces ? { physical: true } : {}),
    };
    if (payment.threat > 0) this.system(`${sheet.name} buys dice with ${payment.threat} Threat.`);
    if (item) {
      this.system(`${sheet.name} uses ${item.name}: one step easier.`);
      for (const note of useItem(item, this.state.scene.id, approach.label, result.complications > 0)) this.system(note);
    }
  }

  private fortuneReroll(player: PlayerInfo, indices: number[]): void {
    const record = this.state.pendingRoll?.rolled;
    if (!record) throw new GameError("There's nothing to re-roll.");
    this.requireController(player, record.characterId);
    if (record.rerolled) throw new GameError("This roll has already been re-rolled.");
    const character = this.state.characters[record.characterId]!;
    if (character.fortune < 1) throw new GameError("No Fortune left.");
    if (indices.length === 0) throw new GameError("Choose at least one die.");
    character.fortune -= 1;
    const leader = rerollDice(record.result, indices, this.rng);
    record.result = record.spec && record.assists?.length ? this.withAssists(record.spec, leader, record.assists) : leader;
    record.rerolled = true;
    record.fortuneSpent = true;
  }

  private accept(player: PlayerInfo, bonusWanted: number): void {
    const pending = this.state.pendingRoll;
    const record = pending?.rolled;
    if (!pending || !record) throw new GameError("There's no roll to accept.");
    this.requireController(player, record.characterId);
    delete this.state.pendingRoll;

    const { result } = record;
    const canBoost = result.passed && (pending.origin === "attack" || pending.origin === "work" || pending.station?.action === "fire");
    const bonus = canBoost ? Math.max(0, Math.min(3, result.momentum, Math.floor(bonusWanted))) : 0;

    if (pending.origin === "attack" && result.passed) {
      const npc = this.state.scene.npcs.find((n) => n.id === pending.targetNpcId);
      const weapon = this.weapon(this.sheet(record.characterId), pending.weaponName);
      if (npc) {
        const stress = rollAttackStress(weapon, this.sheet(record.characterId).skills.combat, this.rng, bonus);
        const out = this.damageNpc(npc, stress.stress, stress.piercing);
        record.stress = { ...stress.roll, inflicted: out.inflicted, target: npc.name, injuriesGained: out.injuriesGained };
      }
    }
    if (pending.origin === "station" && pending.station?.action === "fire" && result.passed) this.fireShipWeapon(pending, record, bonus);
    let workOutcome: ReturnType<typeof applyWork> | undefined;
    if (pending.origin === "work" && result.passed && this.state.extended) {
      const roll = rollChallengeDice(WORK_DICE + bonus, this.rng);
      workOutcome = applyWork(this.state.extended, roll.total);
      record.work = { ...roll, effective: workOutcome.effectiveWork };
    }

    this.log({ type: "roll", roll: record });
    this.tally(record);
    if (result.momentum - bonus > 0) this.gainMomentum(result.momentum - bonus);
    for (let i = 0; i < result.complications; i++) this.complication(record.characterName);
    this.describeAttack(pending, record);

    switch (pending.origin) {
      case "mission": {
        const node = this.currentNode();
        if (node?.type === "test") this.applyOutcome(result.passed ? node.pass : node.fail, record.characterId);
        return;
      }
      case "side":
        this.hooks.onSideRoll?.(record);
        return;
      case "parley":
        return this.resolveParley(record);
      case "attack":
        return this.afterPcTurn(record.characterId);
      case "work":
        return this.afterWork(workOutcome);
      case "station":
        return this.resolveStation(pending, record);
    }
  }

  private complication(who: string): void {
    this.adjustThreat(2, `complication on ${who}'s roll`);
  }

  // ---------------------------------------------------------------- combat

  private startCombat(node: CombatNode): void {
    const scene = this.state.scene;
    scene.mode = "action";
    scene.round = 1;
    scene.acted = [];
    scene.npcActed = [];
    scene.parleyTried = false;
    scene.npcs = [];
    for (const templateId of this.scaledRoster(node)) scene.npcs.push(this.spawnNpc(templateId));
    this.narrate("Narrator", node.intro, "danger");

    const prepared = scene.truths.filter((t) => t.scope === "situation" && t.kind === "advantage");
    if (prepared.length > 0) {
      this.system(`Action scene. ${prepared.map((t) => t.label).join(" and ")}: the crew acts first.`);
    } else if (this.state.pools.threat >= 1) {
      this.adjustThreat(-1, "the raiders open fire first");
      const first = this.liveNpcs()[0];
      if (first) this.npcTurn(first);
      if (this.checkCombatEnd()) return;
    }
    this.system("Each crew member takes one action per round: attack, or try to talk them down.");
  }

  /** Mission rosters are written for a full table; smaller parties face one fewer minor NPC per missing seat. */
  private scaledRoster(node: CombatNode): string[] {
    const minors = node.npcs.filter((id) => this.mission.npcs[id]?.tier === "minor");
    const keep = Math.max(1, minors.length - Math.max(0, 4 - this.partyIds().length));
    let seen = 0;
    return node.npcs.filter((id) => this.mission.npcs[id]?.tier !== "minor" || seen++ < keep);
  }

  private spawnNpc(templateId: string): NpcState {
    const tpl = this.mission.npcs[templateId]!;
    const minorCount = this.state.scene.npcs.filter((n) => n.tier === "minor").length;
    const detail = tpl.tier === "minor" ? IDENTIFYING_DETAILS[minorCount % IDENTIFYING_DETAILS.length]! : tpl.detail;
    return {
      id: uid(),
      templateId,
      name: tpl.tier === "minor" ? `${tpl.name} (${detail})` : tpl.name,
      tier: tpl.tier,
      portrait: tpl.portrait,
      detail,
      stress: 0,
      maxStress: tpl.maxStress,
      injuries: 0,
      armour: tpl.armour,
      hostile: true,
      defeated: false,
    };
  }

  private combatNode(): CombatNode | undefined {
    const node = this.currentNode();
    return node?.type === "combat" ? node : undefined;
  }

  private combatAction(player: PlayerInfo, msg: Extract<ClientMessage, { type: "combatAction" }>): void {
    const node = this.combatNode();
    if (!node || this.state.scene.mode !== "action") throw new GameError("There's no fight on.");
    if (this.state.pendingRoll) throw new GameError("Finish the roll in progress first.");
    this.requireController(player, msg.characterId);
    if (this.state.scene.acted.includes(msg.characterId)) throw new GameError("You've already acted this round.");

    if (msg.action === "parley") {
      if (!node.parley) throw new GameError("They're not interested in talking.");
      if (this.state.scene.parleyTried) throw new GameError("You've already tried talking. They're done listening.");
      this.state.scene.parleyTried = true;
      this.requestRoll({ kind: "test", origin: "parley", characterId: msg.characterId, reason: node.parley.label, approaches: [node.parley.approach] });
      return;
    }

    const target = this.liveNpcs().find((n) => n.id === msg.targetNpcId);
    if (!target) throw new GameError("Choose a target that's still standing.");
    const sheet = this.sheet(msg.characterId);
    const weapon = this.weapon(sheet, msg.weaponName);
    const attribute = weapon.range === "Reach" ? "brawn" : "coordination";
    const difficulty = Math.max(1, adjustDifficulty(PC_ATTACK_DIFFICULTY, this.state.scene.truths.filter((t) => t.kind !== "threat")));
    this.requestRoll({
      kind: "attack",
      origin: "attack",
      characterId: msg.characterId,
      targetNpcId: target.id,
      weaponName: weapon.name,
      reason: `Attack ${target.name}`,
      approaches: [{ label: `${weapon.name} at ${target.name}`, attribute, skill: "combat", difficulty }],
    });
  }

  private weapon(sheet: CharacterSheet, name?: string): WeaponSheet {
    const weapon = sheet.weapons.find((w) => w.name === name) ?? sheet.weapons[0];
    if (!weapon) return { name: "Fists", stressRating: 1, range: "Reach" };
    return weapon;
  }

  private describeAttack(pending: RollRequest, record: RollRecord): void {
    if (pending.origin !== "attack") return;
    if (!record.result.passed) {
      this.narrate("Narrator", `${record.characterName}'s attack misses.`, "gm");
    } else if (record.stress && record.stress.inflicted === 0) {
      this.narrate("Narrator", `${record.characterName} hits ${record.stress.target}, but the armour holds.`, "gm");
    }
  }

  private liveNpcs(): NpcState[] {
    return this.state.scene.npcs.filter((n) => n.hostile && !n.defeated && !n.surrendered);
  }

  private activeParty(): string[] {
    return this.partyIds().filter((id) => conditionOf(this.state.characters[id]!.injuries) === "active");
  }

  private damageNpc(npc: NpcState, raw: number, piercing: number): StressOutcome {
    const out = applyStress({ stress: npc.stress, maxStress: npc.maxStress, injuries: npc.injuries, armour: npc.armour }, raw, piercing);
    let injuries = out.vitals.injuries;
    if (npc.tier !== "minor" && out.injuriesGained > 0 && !npc.avoidedInjury && this.state.pools.threat >= 2) {
      npc.avoidedInjury = true;
      injuries -= 1;
      this.adjustThreat(-2, `${npc.name} shrugs off the wound`);
    }
    npc.stress = out.vitals.stress;
    npc.injuries = injuries;
    const limit = npc.tier === "minor" ? 1 : 2;
    if (npc.injuries >= limit) {
      npc.defeated = true;
      this.narrate("Narrator", `${npc.name} goes down.`, "danger");
      if (npc.tier !== "minor") this.moraleBreak();
    }
    return { ...out, injuriesGained: injuries - (out.vitals.injuries - out.injuriesGained) };
  }

  private moraleBreak(): void {
    const minors = this.liveNpcs().filter((n) => n.tier === "minor");
    if (minors.length === 0 || this.liveNpcs().some((n) => n.tier !== "minor")) return;
    for (const n of minors) n.surrendered = true;
    this.narrate("Narrator", this.combatNode()?.moraleText ?? "With their leader down, the rest throw down their weapons.", "gm");
  }

  private npcTurn(npc: NpcState): void {
    const tpl = this.mission.npcs[npc.templateId]!;
    const targets = this.activeParty();
    if (targets.length === 0) return;
    const targetId = this.pick(targets);
    const target = this.sheet(targetId);
    let dice = 2;
    if (npc.tier !== "minor" && this.state.pools.threat >= 3) {
      this.adjustThreat(-1, `${npc.name} takes careful aim`);
      dice = 3;
    }
    const result = rollTest(
      {
        attribute: tpl.attributes[tpl.attackAttribute],
        skill: tpl.skills.combat,
        focus: npc.tier !== "minor",
        difficulty: NPC_ATTACK_DIFFICULTY,
        dice,
      },
      this.rng,
    );
    const record: RollRecord = {
      requestId: uid(),
      characterId: npc.id,
      characterName: npc.name,
      label: `${tpl.weapon.name} at ${target.name}`,
      result,
      boughtDice: dice - 2,
      payment: { momentum: 0, threat: 0 },
      fortuneSpent: false,
      npc: true,
    };
    if (result.passed) {
      const stress = rollAttackStress(tpl.weapon, tpl.skills.combat, this.rng);
      const out = this.damagePc(targetId, stress.stress, stress.piercing, false);
      record.stress = { ...stress.roll, inflicted: out.inflicted, target: target.name, injuriesGained: out.injuriesGained };
    }
    this.log({ type: "roll", roll: record });
    if (result.passed) this.reportPcHit(targetId, record);
    else this.narrate("Narrator", `${npc.name} attacks ${target.name} and misses.`, "gm");
    // NPC Momentum becomes Threat, capped so one lucky volley can't swamp the table.
    if (result.momentum > 0) this.adjustThreat(Math.min(2, result.momentum), `${npc.name}'s attack builds an edge`);
    if (result.complications > 0) {
      this.narrate("Narrator", `${npc.name}'s weapon jams. The crew seizes the moment.`, "gm");
      this.gainMomentum(result.complications);
    }
    this.state.scene.npcActed.push(npc.id);
  }

  private reportPcHit(targetId: string, record: RollRecord): void {
    const sheet = this.sheet(targetId);
    const stress = record.stress!;
    const condition = conditionOf(this.state.characters[targetId]!.injuries);
    if (stress.inflicted === 0) this.narrate("Narrator", `${record.characterName} hits ${sheet.name}, but the armour holds.`, "gm");
    else if (condition !== "active") this.narrate("Narrator", `${sheet.name} is down!`, "danger");
    else if (stress.injuriesGained > 0) this.narrate("Narrator", `${sheet.name} is wounded.`, "danger");
    else this.narrate("Narrator", `${record.characterName} hits ${sheet.name} for ${stress.inflicted} stress.`, "gm");
  }

  private resolveParley(record: RollRecord): void {
    const node = this.combatNode();
    if (!node?.parley) return;
    if (record.result.passed) {
      this.endCombat();
      for (const npc of this.liveNpcs()) npc.hostile = false;
      this.applyOutcome(node.parley.pass, record.characterId);
      return;
    }
    this.narrate("Narrator", node.parley.failText, "npc");
    this.afterPcTurn(record.characterId);
  }

  private afterPcTurn(characterId: string): void {
    const scene = this.state.scene;
    if (!scene.acted.includes(characterId)) scene.acted.push(characterId);
    if (this.checkCombatEnd()) return;
    const waiting = this.liveNpcs().find((n) => !scene.npcActed.includes(n.id));
    if (waiting) this.npcTurn(waiting);
    if (this.checkCombatEnd()) return;
    if (this.activeParty().every((id) => scene.acted.includes(id))) {
      for (const npc of this.liveNpcs().filter((n) => !scene.npcActed.includes(n.id))) {
        this.npcTurn(npc);
        if (this.checkCombatEnd()) return;
      }
      this.newRound();
    }
  }

  private newRound(): void {
    const scene = this.state.scene;
    scene.round += 1;
    scene.acted = [];
    scene.npcActed = [];
    const node = this.combatNode();
    const minor = node?.npcs.find((id) => this.mission.npcs[id]?.tier === "minor");
    if (scene.round === SECOND_ROUND && minor && this.partyIds().length >= 3 && this.state.pools.threat >= 4) {
      this.adjustThreat(-2, "reinforcements");
      scene.npcs.push(this.spawnNpc(minor));
      scene.npcs.push(this.spawnNpc(minor));
      this.narrate("Narrator", node?.reinforcementText ?? "Two more enemies join the fight.", "danger");
    }
    this.system(`Round ${scene.round}.`);
  }

  private checkCombatEnd(): boolean {
    const node = this.combatNode();
    if (!node || this.state.scene.mode !== "action") return true;
    if (this.liveNpcs().length === 0) {
      this.endCombat();
      this.applyOutcome(node.victory);
      return true;
    }
    if (this.activeParty().length === 0) {
      this.endCombat();
      this.applyOutcome(node.defeat);
      return true;
    }
    return false;
  }

  private endCombat(): void {
    const scene = this.state.scene;
    scene.mode = "scene";
    scene.truths = scene.truths.filter((t) => !(t.scope === "situation" && t.kind === "advantage"));
    this.ensureSomeoneStanding(true);
  }

  /** The Director never lets a session stall: after a fight, the fallen are patched up enough to walk. */
  private ensureSomeoneStanding(always = false): void {
    const party = this.partyIds();
    const down = party.filter((id) => conditionOf(this.state.characters[id]!.injuries) !== "active");
    if (down.length === 0 || (!always && down.length < party.length)) return;
    for (const id of down) this.state.characters[id]!.injuries = 1;
    this.system(`${down.map((id) => this.sheet(id).name).join(", ")} ${down.length > 1 ? "are" : "is"} patched up and back on their feet, still carrying an injury.`);
  }

  // ---------------------------------------------------------------- space battles

  private spaceNode(): SpaceNode | undefined {
    const node = this.currentNode();
    return node?.type === "space" ? node : undefined;
  }

  private startSpace(node: SpaceNode): void {
    const zero = () => Object.fromEntries(SHIP_SYSTEMS.map((k) => [k, 0])) as Record<ShipSystem, number>;
    this.state.scene.mode = "space";
    this.state.space = {
      // Refits bought in the campaign go on whichever ship the crew fly.
      ship: { ...applyRefits(node.ship, this.state.campaign?.refits ?? []), hull: 0, breaches: zero() },
      enemies: this.scaledFleet(node).map((e) => this.enemyState(e, 1)),
      round: 1,
      acted: [],
      enemyActed: [],
      uses: {},
      ...(node.breakaway ? { canBreakaway: true } : {}),
      ...(node.locked?.length ? { locked: [...node.locked] } : {}),
      ...(node.rogue?.awake ? { rogue: true } : {}),
    };
    this.narrate("Narrator", node.intro, "danger");
    this.system("Ship action! Each crew member works one bridge station a round. Repeating an action in the same round is harder.");
    const ending = this.runPhases();
    if (ending) this.endSpace(ending);
  }

  /** A fresh enemy as it enters the battle in the given round. */
  private enemyState(spec: EnemyShipSpec, round: number): NonNullable<TableState["space"]>["enemies"][number] {
    const zero = Object.fromEntries(SHIP_SYSTEMS.map((k) => [k, 0])) as Record<ShipSystem, number>;
    const e = { ...structuredClone(spec), hull: 0, breaches: zero, destroyed: false };
    return spec.impact ? { ...e, impactRound: round + spec.impact.rounds - 1 } : e;
  }

  /** Runs every phase whose trigger now holds, in order, and returns the ending one called for. */
  private runPhases(): "victory" | "escaped" | "defeat" | undefined {
    const sp = this.state.space;
    const node = this.spaceNode();
    if (!sp || !node?.phases) return undefined;
    sp.phasesDone ??= [];
    for (const phase of node.phases) {
      if (sp.phasesDone.includes(phase.id)) continue;
      const w = phase.when;
      const holds =
        (w.round === undefined || sp.round >= w.round) &&
        (w.destroyed === undefined || sp.enemies.some((e) => e.id === w.destroyed && e.destroyed)) &&
        (w.hullAtLeast === undefined || sp.ship.hull >= w.hullAtLeast) &&
        (!w.cleared || sp.enemies.every((e) => e.destroyed || e.optional));
      if (!holds) continue;
      sp.phasesDone.push(phase.id);
      if (phase.requires && !meets(phase.requires, this.state.story)) continue;
      this.narrate(phase.speaker ?? "Narrator", phase.text, phase.speaker ? "npc" : "danger");
      if (phase.effects) this.applyEffects(phase.effects);
      for (const spec of phase.spawn ?? []) {
        sp.enemies = sp.enemies.filter((e) => e.id !== spec.id);
        sp.enemies.push(this.enemyState(spec, sp.round));
        if (spec.impact) this.system(`${spec.name} inbound: it strikes at the end of round ${sp.round + spec.impact.rounds - 1} unless it's stopped.`);
      }
      if (phase.lock?.length) {
        sp.locked = [...new Set([...(sp.locked ?? []), ...phase.lock])];
        this.system(`Locked out: ${phase.lock.map((a) => this.stationRules(a).label).join(", ")}. Engineering can override.`);
      }
      if (phase.unlock) sp.locked = phase.unlock === "all" ? [] : (sp.locked ?? []).filter((a) => !phase.unlock!.includes(a));
      if (phase.rogue !== undefined) sp.rogue = phase.rogue;
      if (phase.end) return phase.end;
    }
    return undefined;
  }

  /**
   * Enemy fleets are written for three or more crew; one or two face one fewer of the ships that
   * must be beaten. Missiles are the story's stakes, so they all still fly.
   */
  private scaledFleet(node: SpaceNode): SpaceNode["enemies"] {
    if (this.partyIds().length > 2) return node.enemies;
    const required = node.enemies.filter((e) => !e.optional && !e.impact);
    if (required.length < 2) return node.enemies;
    const drop = required.at(-1)!;
    return node.enemies.filter((e) => e !== drop);
  }

  /** Station, test and base difficulty for each ship action. */
  private stationRules(action: StationAction): { station: string; label: string; system?: ShipSystem; attribute: Attribute; skill: Skill; difficulty: number } {
    switch (action) {
      case "fire":
        return { station: "Tactical", label: "Fire", system: "weapons", attribute: "coordination", skill: "combat", difficulty: 1 };
      case "evasive":
        return { station: "Helm", label: "Evasive action", system: "engines", attribute: "agility", skill: "flight", difficulty: 1 };
      case "pattern":
        return { station: "Helm", label: "Attack pattern", system: "weapons", attribute: "coordination", skill: "flight", difficulty: 1 };
      case "breakaway":
        return { station: "Helm", label: "Break away", system: "engines", attribute: "agility", skill: "flight", difficulty: this.spaceNode()?.breakaway?.difficulty ?? 2 };
      case "scan":
        return { station: "Sensors", label: "Scan for weakness", system: "sensors", attribute: "insight", skill: "combat", difficulty: 2 };
      case "repair":
        return { station: "Engineering", label: "Damage control", attribute: "coordination", skill: "engineering", difficulty: 1 };
      case "rally":
        return { station: "Command", label: "Rally the crew", attribute: "will", skill: "command", difficulty: 0 };
      case "jam":
        return { station: "Comms", label: "Jam their targeting", system: "communications", attribute: "reason", skill: "combat", difficulty: 1 };
      case "intercept":
        return { station: "Helm", label: "Intercept", system: "engines", attribute: "agility", skill: "flight", difficulty: 2 };
      case "override":
        return { station: "Engineering", label: "Override", system: "computers", attribute: "reason", skill: "engineering", difficulty: this.spaceNode()?.overrideDifficulty ?? 2 };
    }
  }

  private isDamaged(ship: ShipState, system: ShipSystem): boolean {
    return ship.breaches[system] >= Math.ceil(ship.scale / 2);
  }

  private isOffline(ship: ShipState, system: ShipSystem): boolean {
    return ship.breaches[system] >= ship.scale;
  }

  /** Attacking a bigger ship is easier (−1 per step of scale), a smaller one harder (+1 per step). */
  private scaleModifier(attacker: number, target: number): number {
    return attacker - target;
  }

  private inRange(weapon: { range: ShipRange }, target: { range: ShipRange }): boolean {
    const order: ShipRange[] = ["Close", "Medium", "Long"];
    return order.indexOf(weapon.range) >= order.indexOf(target.range);
  }

  private liveEnemies() {
    return this.state.space?.enemies.filter((e) => !e.destroyed) ?? [];
  }

  private stationAction(player: PlayerInfo, msg: Extract<ClientMessage, { type: "stationAction" }>): void {
    const sp = this.state.space;
    const node = this.spaceNode();
    if (!sp || !node || this.state.scene.mode !== "space") throw new GameError("There's no ship battle on.");
    if (this.state.pendingRoll) throw new GameError("Finish the roll in progress first.");
    this.requireController(player, msg.characterId);
    if (sp.acted.includes(msg.characterId)) throw new GameError("You've already worked a station this round.");
    if (msg.action === "breakaway" && !node.breakaway) throw new GameError("There's no breaking away from this fight.");
    if (sp.locked?.includes(msg.action)) throw new GameError(`The ship won't answer: ${this.stationRules(msg.action).label} is locked out. Override it first.`);
    if (msg.action === "override" && !(msg.station && sp.locked?.includes(msg.station))) throw new GameError("Choose a locked station to take back.");
    const rules = this.stationRules(msg.action);
    if (rules.system && this.isOffline(sp.ship, rules.system)) throw new GameError(`The ${rules.system} system is offline.`);

    let difficulty = rules.difficulty + (sp.uses[msg.action] ?? 0);
    if (rules.system && this.isDamaged(sp.ship, rules.system)) difficulty += 1;
    let reason = `${rules.station}: ${rules.label}`;
    const target = msg.targetId ? this.liveEnemies().find((e) => e.id === msg.targetId) : undefined;
    let weaponName: string | undefined;
    if (msg.action === "fire" || msg.action === "scan" || msg.action === "intercept") {
      if (!target) throw new GameError("Choose a target that's still flying.");
      if (msg.action === "intercept" && !target.impact) throw new GameError("Only a missile in flight can be intercepted.");
      reason += ` · ${target.name}`;
    }
    if (msg.action === "override") reason += ` · ${this.stationRules(msg.station!).label}`;
    if (msg.action === "fire") {
      const weapon = sp.ship.weapons.find((w) => w.name === msg.weaponName) ?? sp.ship.weapons.find((w) => this.inRange(w, target!));
      if (!weapon || !this.inRange(weapon, target!)) throw new GameError(`${target!.name} is out of range for that weapon.`);
      weaponName = weapon.name;
      difficulty += this.scaleModifier(sp.ship.scale, target!.scale) + (sp.evasive ? 1 : 0) - (sp.pattern ? 1 : 0);
    }
    if (msg.action === "breakaway") difficulty += this.liveEnemies().filter((e) => !e.optional && e.range === "Close").length;
    if (msg.action === "repair") {
      const worst = Math.max(...SHIP_SYSTEMS.map((k) => sp.ship.breaches[k]));
      difficulty = Math.max(1, worst) + (sp.uses.repair ?? 0);
    }
    difficulty = Math.max(rules.difficulty === 0 ? 0 : 1, Math.min(5, difficulty));
    this.requestRoll({
      kind: msg.action === "fire" ? "attack" : "test",
      origin: "station",
      characterId: msg.characterId,
      reason,
      station: { action: msg.action, targetId: target?.id, weaponName, ...(msg.action === "override" ? { station: msg.station } : {}) },
      approaches: [{ label: reason, attribute: rules.attribute, skill: rules.skill, difficulty, system: rules.system }],
    });
  }

  /** Applies damage to a ship. Breaches land on systems from the hit table. */
  private hitShip(ship: ShipState, raw: number, piercing: number): { inflicted: number; breached: ShipSystem[] } {
    const breachesBefore = SHIP_SYSTEMS.reduce((n, k) => n + ship.breaches[k], 0);
    const out = applyStress({ stress: ship.hull, maxStress: ship.maxHull, injuries: breachesBefore, armour: ship.armour }, raw, piercing);
    ship.hull = out.vitals.stress;
    const breached: ShipSystem[] = [];
    for (let i = 0; i < out.injuriesGained; i++) {
      const roll = this.rng.die(20);
      const system: ShipSystem =
        roll === 1 ? "communications" : roll === 2 ? "computers" : roll <= 6 ? "engines" : roll <= 9 ? "sensors" : roll <= 17 ? "structure" : "weapons";
      ship.breaches[system] += 1;
      breached.push(system);
    }
    return { inflicted: out.inflicted, breached };
  }

  private fireShipWeapon(pending: RollRequest, record: RollRecord, bonus: number): void {
    const sp = this.state.space!;
    const target = sp.enemies.find((e) => e.id === pending.station?.targetId);
    const weapon = sp.ship.weapons.find((w) => w.name === pending.station?.weaponName);
    if (!target || !weapon) return;
    const roll = rollChallengeDice(weapon.cd + bonus, this.rng);
    const piercing = (weapon.piercing ?? 0) + (sp.weakness === target.id ? 2 : 0);
    if (sp.weakness === target.id) delete sp.weakness;
    const hit = this.hitShip(target, roll.total + (weapon.vicious ?? 0) * roll.effects, piercing);
    record.stress = { ...roll, inflicted: hit.inflicted, target: target.name, injuriesGained: hit.breached.length, breached: hit.breached };
    if (this.wrecked(target, hit.inflicted)) {
      target.destroyed = true;
      this.narrate("Narrator", `${target.name} comes apart in a blossom of fire.`, "danger");
      this.stats(record.characterId).takedowns += 1;
    } else if (hit.breached.length) {
      this.narrate("Narrator", `A direct hit on ${target.name}: ${hit.breached.join(" and ")} breached.`, "gm");
    } else if (hit.inflicted === 0) {
      this.narrate("Narrator", `Your fire splashes off ${target.name}'s armour.`, "gm");
    }
  }

  private resolveStation(pending: RollRequest, record: RollRecord): void {
    const sp = this.state.space;
    const action = pending.station?.action;
    if (!sp || !action) return;
    sp.uses[action] = (sp.uses[action] ?? 0) + 1;
    const name = record.characterName.split(" ")[0];
    if (record.result.passed) {
      switch (action) {
        case "evasive":
          sp.evasive = true;
          this.narrate("Narrator", `${name} throws the corvette into a corkscrew: harder to hit, harder to aim.`, "gm");
          break;
        case "pattern":
          sp.pattern = true;
          this.narrate("Narrator", `${name} lines up an attack run. Your guns bear, but so do theirs.`, "gm");
          break;
        case "scan": {
          sp.weakness = pending.station?.targetId;
          const t = sp.enemies.find((e) => e.id === sp.weakness);
          this.narrate("Narrator", `${name} finds a seam in ${t?.name ?? "the target"}'s armour. The next hit will punch through.`, "gm");
          break;
        }
        case "repair": {
          const worst = [...SHIP_SYSTEMS].sort((a, b) => sp.ship.breaches[b] - sp.ship.breaches[a])[0]!;
          if (sp.ship.breaches[worst] > 0) {
            sp.ship.breaches[worst] -= 1;
            this.narrate("Narrator", `${name} reroutes around the damage: ${worst} back on line.`, "gm");
          } else {
            sp.ship.hull = Math.max(0, sp.ship.hull - 3);
            this.narrate("Narrator", `${name} patches the hull.`, "gm");
          }
          break;
        }
        case "rally":
          this.narrate("Narrator", `${name}'s voice cuts through the alarms. The bridge steadies.`, "gm");
          break;
        case "jam":
          sp.jammed = true;
          this.narrate("Narrator", `${name} floods their targeting channels with noise.`, "gm");
          break;
        case "breakaway":
          return this.endSpace("escaped");
        case "intercept": {
          const missile = sp.enemies.find((e) => e.id === pending.station?.targetId && !e.destroyed);
          if (!missile) break;
          missile.destroyed = true;
          // A warhead bursting against the hull gets through all but the heaviest armour.
          const hit = this.hitShip(sp.ship, rollChallengeDice(missile.impact?.cd ?? 5, this.rng).total, 3);
          const breached = hit.breached.length ? ` ${hit.breached.join(" and ")} breached.` : "";
          this.narrate("Narrator", `${name} throws the ship into ${missile.name}'s path. It bursts against the hull: ${hit.inflicted} damage.${breached}`, "danger");
          const node = this.spaceNode();
          if (node?.interceptEffects) this.applyEffects(node.interceptEffects);
          break;
        }
        case "override": {
          const station = pending.station?.station;
          if (!station) break;
          sp.locked = (sp.locked ?? []).filter((a) => a !== station);
          this.narrate("Narrator", `${name} tears the ${this.stationRules(station).label.toLowerCase()} controls back from the ship's grip.`, "gm");
          break;
        }
        case "fire":
          break;
      }
    } else if (action === "fire") {
      this.narrate("Narrator", `${name}'s shots streak past ${pending.reason.split(" · ")[1] ?? "the target"}.`, "gm");
    } else if (action === "breakaway") {
      this.narrate("Narrator", `${name} can't shake them. They're still on your tail.`, "gm");
    } else {
      this.narrate("Narrator", `${name} can't make it work in time.`, "gm");
    }
    this.afterStation(record.characterId);
  }

  private afterStation(characterId: string): void {
    const sp = this.state.space!;
    if (!sp.acted.includes(characterId)) sp.acted.push(characterId);
    if (this.checkSpaceEnd()) return;
    const waiting = this.liveEnemies().find((e) => !sp.enemyActed.includes(e.id));
    if (waiting) this.enemyShipTurn(waiting);
    if (this.checkSpaceEnd()) return;
    if (this.activeParty().every((id) => sp.acted.includes(id))) {
      for (const e of this.liveEnemies().filter((x) => !sp.enemyActed.includes(x.id))) {
        this.enemyShipTurn(e);
        if (this.checkSpaceEnd()) return;
      }
      if (sp.rogue) this.rogueTurn();
      if (this.checkSpaceEnd()) return;
      for (const m of this.liveEnemies().filter((x) => x.impact && (x.impactRound ?? 0) <= sp.round)) {
        this.impact(m);
        if (this.checkSpaceEnd()) return;
      }
      sp.round += 1;
      sp.acted = [];
      sp.enemyActed = [];
      sp.uses = {};
      delete sp.evasive;
      delete sp.pattern;
      delete sp.jammed;
      this.system(`Round ${sp.round}.`);
      this.checkSpaceEnd();
    }
  }

  /** Enough breaches to break a ship; a missile goes with any hit that gets through its armour. */
  private wrecked(enemy: NonNullable<TableState["space"]>["enemies"][number], inflicted: number): boolean {
    return SHIP_SYSTEMS.reduce((n, k) => n + enemy.breaches[k], 0) >= enemy.scale || (Boolean(enemy.impact) && inflicted > 0);
  }

  /** A missile that wasn't stopped strikes home. */
  private impact(missile: NonNullable<TableState["space"]>["enemies"][number]): void {
    const sp = this.state.space!;
    missile.destroyed = true;
    missile.impacted = true;
    this.narrate("Narrator", missile.impact!.text, "danger");
    if (missile.impact!.cd) {
      const hit = this.hitShip(sp.ship, rollChallengeDice(missile.impact!.cd, this.rng).total, 0);
      if (hit.breached.length) this.narrate("Narrator", `The blast breaches ${hit.breached.join(" and ")}.`, "danger");
    }
    const node = this.spaceNode();
    if (node?.impactEffects) this.applyEffects(node.impactEffects);
  }

  /** The ship's own will: it fires on someone, surges through its own systems, or seizes a station. */
  private rogueTurn(): void {
    const sp = this.state.space!;
    const rogue = this.spaceNode()?.rogue;
    if (!rogue) return;
    // Only stations the crew could use in this fight are worth taking from them.
    const usable = (a: StationAction) => (a !== "breakaway" || sp.canBreakaway) && (a !== "intercept" || this.liveEnemies().some((x) => x.impact));
    const seizable = (["fire", "evasive", "pattern", "scan", "jam", "breakaway", "intercept"] as StationAction[]).filter((a) => usable(a) && !sp.locked?.includes(a));
    const targets = this.liveEnemies();
    const weapon = sp.ship.weapons[0];
    const roll = this.rng.die(6);
    const act = roll <= 2 ? "surge" : (roll <= 4 || !seizable.length) && targets.length && weapon ? "fire" : seizable.length ? "seize" : "surge";
    if (act === "fire") {
      const target = this.pick(targets);
      this.narrate(rogue.speaker, this.pick(rogue.fire).replace("{target}", target.name), "npc");
      const hit = this.hitShip(target, rollChallengeDice(weapon!.cd, this.rng).total, weapon!.piercing ?? 0);
      if (this.wrecked(target, hit.inflicted)) {
        target.destroyed = true;
        this.narrate("Narrator", `${target.name} comes apart in a blossom of fire.`, "danger");
      } else {
        this.narrate("Narrator", `${target.name} takes ${hit.inflicted}.`, "gm");
      }
    } else if (act === "seize") {
      const station = this.pick(seizable);
      sp.locked = [...(sp.locked ?? []), station];
      this.narrate(rogue.speaker, this.pick(rogue.seize).replace("{station}", this.stationRules(station).label.toLowerCase()), "npc");
      this.system(`Locked out: ${this.stationRules(station).label}. Engineering can override.`);
    } else {
      this.narrate(rogue.speaker, this.pick(rogue.surge), "npc");
      // A surge comes from inside the hull, so armour doesn't stop it.
      const hit = this.hitShip(sp.ship, rollChallengeDice(rogue.surgeCd ?? 3, this.rng).total, sp.ship.armour);
      this.narrate("Narrator", `Power surges through the decks: ${hit.inflicted} damage${hit.breached.length ? `, ${hit.breached.join(" and ")} breached` : ""}.`, "danger");
    }
  }

  private enemyShipTurn(enemy: NonNullable<TableState["space"]>["enemies"][number]): void {
    const sp = this.state.space!;
    sp.enemyActed.push(enemy.id);
    if (enemy.chargeEvery && sp.round % enemy.chargeEvery !== 0) {
      this.narrate("Narrator", `${enemy.name}'s main gun is charging. It will fire next round.`, "danger");
      return;
    }
    const weapon = enemy.weapons[0];
    if (!weapon) return;
    let difficulty = 1 + this.scaleModifier(enemy.scale, sp.ship.scale) + (sp.evasive ? 1 : 0) - (sp.pattern ? 1 : 0) + (sp.jammed ? 1 : 0);
    if (this.isDamaged(enemy, "weapons")) difficulty += 1;
    difficulty = Math.max(1, Math.min(5, difficulty));
    const result = rollTest({ attribute: enemy.crew.attribute, skill: enemy.crew.skill, focus: true, difficulty, dice: 2 }, this.rng);
    const record: RollRecord = {
      requestId: uid(),
      characterId: enemy.id,
      characterName: enemy.name,
      label: `${weapon.name} at ${sp.ship.name}`,
      result,
      boughtDice: 0,
      payment: { momentum: 0, threat: 0 },
      fortuneSpent: false,
      npc: true,
    };
    if (result.passed) {
      const roll = rollChallengeDice(weapon.cd, this.rng);
      const hit = this.hitShip(sp.ship, roll.total + (weapon.vicious ?? 0) * roll.effects, weapon.piercing ?? 0);
      record.stress = { ...roll, inflicted: hit.inflicted, target: sp.ship.name, injuriesGained: hit.breached.length, breached: hit.breached };
    }
    this.log({ type: "roll", roll: record });
    if (!result.passed) {
      this.narrate("Narrator", `${enemy.name}'s fire flashes past.`, "gm");
    } else if (record.stress!.breached?.length) {
      const breached = record.stress!.breached;
      this.narrate("Narrator", `${enemy.name} hits hard: ${breached.join(" and ")} breached!`, "danger");
      if (breached.includes("structure")) {
        const crew = this.activeParty();
        if (crew.length) this.damagePc(this.pick(crew), 2);
      }
    } else {
      this.narrate("Narrator", `${enemy.name} rakes the hull for ${record.stress!.inflicted}.`, "gm");
    }
    if (result.momentum > 0) this.adjustThreat(Math.min(2, result.momentum), `${enemy.name} presses the attack`);
  }

  private checkSpaceEnd(): boolean {
    const sp = this.state.space;
    if (!sp || this.state.scene.mode !== "space") return true;
    const ending = this.runPhases();
    if (ending) {
      this.endSpace(ending);
      return true;
    }
    if (this.isOffline(sp.ship, "structure")) {
      this.endSpace("defeat");
      return true;
    }
    if (sp.enemies.every((e) => e.destroyed || e.optional)) {
      this.endSpace("victory");
      return true;
    }
    if (this.activeParty().length === 0) {
      this.endSpace("defeat");
      return true;
    }
    return false;
  }

  private endSpace(result: "victory" | "escaped" | "defeat"): void {
    const node = this.spaceNode();
    this.state.scene.mode = "scene";
    delete this.state.space;
    this.ensureSomeoneStanding(true);
    if (!node) return;
    this.applyOutcome(result === "escaped" ? (node.escaped ?? node.victory) : result === "victory" ? node.victory : node.defeat);
  }

  // ---------------------------------------------------------------- extended tests

  private requestWork(node: ExtendedNode): void {
    const ext = this.state.extended!;
    this.requestRoll({
      kind: "work",
      origin: "work",
      reason: `${node.label}: ${ext.workRemaining} Work to go, ${ext.attemptsLeft} attempts left`,
      approaches: node.approaches,
    });
  }

  private afterWork(outcome: ReturnType<typeof applyWork> | undefined): void {
    const node = this.currentNode();
    const ext = this.state.extended;
    if (node?.type !== "extended" || !ext) return;
    if (outcome) {
      this.state.extended = { ...outcome.test, attemptsLeft: ext.attemptsLeft };
      if (outcome.breakthroughsGained > 0) this.system(`Breakthrough! (${outcome.test.breakthroughs} of ${outcome.test.magnitude})`);
    }
    const current = this.state.extended!;
    current.attemptsLeft = (current.attemptsLeft ?? 1) - 1;
    if (outcome?.complete) {
      delete this.state.extended;
      this.applyOutcome(node.complete);
      return;
    }
    if ((current.attemptsLeft ?? 0) <= 0) {
      delete this.state.extended;
      this.applyOutcome(node.timeout);
      return;
    }
    const used = node.attempts - (current.attemptsLeft ?? 0);
    this.narrate("Narrator", node.pressure[(used - 1) % node.pressure.length]!, "danger");
    if (!outcome && this.state.pools.threat >= 3 && current.resistance === node.resistance) {
      this.adjustThreat(-2, `${node.label} gets harder (resistance +1)`);
      current.resistance += 1;
    }
    this.requestWork(node);
  }

  // ---------------------------------------------------------------- crew stats

  private stats(characterId: string): CrewStats {
    this.state.stats ??= {};
    return (this.state.stats[characterId] ??= {
      rolls: 0,
      passes: 0,
      successes: 0,
      crits: 0,
      complications: 0,
      helped: 0,
      dealt: 0,
      takedowns: 0,
      taken: 0,
    });
  }

  /** Records a crew roll for the debrief's citations. */
  private tally(record: RollRecord): void {
    if (record.npc) return;
    const s = this.stats(record.characterId);
    s.rolls += 1;
    if (record.result.passed) s.passes += 1;
    s.successes += record.result.successes;
    s.crits += record.result.dice.filter((d) => d.face === 1).length;
    s.complications += record.result.complications;
    if (record.stress) {
      s.dealt += record.stress.inflicted;
      const target = this.state.scene.npcs.find((n) => n.name === record.stress!.target);
      if (target?.defeated) s.takedowns += 1;
    }
    for (const a of record.assists ?? []) {
      const h = this.stats(a.characterId);
      h.helped += 1;
      if (a.die.face === 1) h.crits += 1;
    }
  }

  // ---------------------------------------------------------------- helpers

  private pick<T>(items: readonly T[]): T {
    return items.length === 1 ? items[0]! : items[this.rng.die(items.length) - 1]!;
  }

  // ---------------------------------------------------------------- inventory

  inventoryOf(characterId: string): InventoryItem[] {
    const c = this.state.characters[characterId];
    if (!c) throw new GameError("No such character.");
    return (c.inventory ??= startingInventory(this.sheet(characterId).equipment));
  }

  private usableItem(characterId: string, itemId: string): InventoryItem {
    const item = this.inventoryOf(characterId).find((i) => i.id === itemId);
    if (!item) throw new GameError("That item isn't in your kit.");
    if (!usable(item)) throw new GameError(`${item.name} is ${item.status}.`);
    if (item.usedInScene === this.state.scene.id) throw new GameError(`${item.name} has already helped in this scene.`);
    return item;
  }

  /** What a character can carry, and what they're carrying now. */
  loadOf(characterId: string): { load: number; capacity: number } {
    return { load: load(this.inventoryOf(characterId)), capacity: capacity(this.sheet(characterId).attributes.brawn) };
  }

  /**
   * Puts a found or given item in a character's kit and says so in the log. Refuses anything that
   * won't fit their load: no hammerspace. With stowIfFull it goes aboard the ship instead.
   */
  giveItem(characterId: string, name: string, origin: string, uses?: number, size?: ItemSize, stowIfFull = false): InventoryItem {
    const clean = name.trim();
    if (!clean) throw new GameError("Name the item.");
    const item = newItem(clean, origin, uses, size);
    const who = this.sheet(characterId).name;
    const { load: now, capacity: max } = this.loadOf(characterId);
    if (now + BULK[item.size ?? "small"] > max) {
      if (!stowIfFull) {
        throw new GameError(`${item.name} (${item.size}) won't fit: ${who} is carrying ${now} of ${max}. Drop or stow something first, or give it to someone else.`);
      }
      item.status = "stowed";
      item.history.push("Stowed aboard: nobody had room to carry it");
      this.inventoryOf(characterId).push(item);
      this.system(`${item.name} is stowed aboard; nobody has room to carry it.`);
      return item;
    }
    this.inventoryOf(characterId).push(item);
    this.system(`${who} takes ${item.name}.`);
    return item;
  }

  /** Damages, breaks, loses or repairs an item as the story demands. */
  changeItem(characterId: string, ref: string, status: ItemStatus, reason: string): InventoryItem {
    const item = findItem(this.inventoryOf(characterId), ref);
    if (!item) throw new GameError(`${this.sheet(characterId).name} isn't carrying "${ref}".`);
    if (item.status === "stowed" && status === "ok") {
      const { load: now, capacity: max } = this.loadOf(characterId);
      if (now + BULK[item.size ?? "small"] > max) throw new GameError(`${item.name} won't fit: ${this.sheet(characterId).name} is carrying ${now} of ${max}.`);
    }
    setStatus(item, status, reason);
    const said = { ok: "is back in hand", damaged: "is damaged", broken: "breaks", lost: "is lost", "used up": "is used up", stowed: "is stowed aboard" }[status];
    this.system(`${this.sheet(characterId).name}'s ${item.name} ${said}${reason ? `: ${reason}` : ""}.`);
    return item;
  }

  /** The standing crew member with the most room to spare, for finds nobody rolled for. */
  private leastLoaded(): string | undefined {
    const spare = (id: string) => this.loadOf(id).capacity - this.loadOf(id).load;
    return this.partyIds()
      .filter((id) => conditionOf(this.state.characters[id]!.injuries) === "active")
      .sort((a, b) => spare(b) - spare(a))[0];
  }

  partyIds(): string[] {
    return Object.values(this.state.characters)
      .filter((c) => c.controllerId)
      .map((c) => c.sheetId);
  }

  sheet(id: string): CharacterSheet {
    const sheet = this.state.sheets.find((s) => s.id === id);
    if (!sheet) throw new GameError(`unknown character ${id}`);
    return sheet;
  }

  /** Stress to a character, after armour. Reports injuries in the log unless the caller does. */
  damagePc(id: string, raw: number, piercing = 0, report = true): StressOutcome {
    const sheet = this.sheet(id);
    const state = this.state.characters[id]!;
    const out = applyStress({ stress: state.stress, maxStress: sheet.maxStress, injuries: state.injuries, armour: sheet.armour }, raw, piercing);
    state.stress = out.vitals.stress;
    state.injuries = out.vitals.injuries;
    if (out.injuriesGained > 0) state.hurt = true;
    if (out.condition !== "active") state.downed = true;
    this.stats(id).taken += out.inflicted;
    if (report && out.injuriesGained > 0) {
      this.narrate("Narrator", out.condition === "active" ? `${sheet.name} is injured.` : `${sheet.name} is down!`, "danger");
    }
    return out;
  }

  private log(entry: DistributiveOmit<LogEntry, "id" | "at">): void {
    this.state.log.push({ ...entry, id: uid(), at: Date.now() } as LogEntry);
    if (this.state.log.length > LOG_LIMIT) this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
