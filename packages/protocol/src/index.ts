import type {
  AttributeScores,
  D20Die,
  TestSpec,
  ChallengeRoll,
  ExtendedTest,
  Pools,
  SkillScores,
  TestResult,
  Truth,
  Attribute,
  Skill,
} from "@hwr/rules-engine";

export type Role = "player" | "gm" | "spectator";
export type GmMode = "director" | "claude" | "human";

export interface WeaponSheet {
  name: string;
  stressRating: number;
  range: "Reach" | "Close" | "Medium" | "Long" | "Extreme";
  vicious?: number;
  piercing?: number;
  notes?: string;
}

export interface TalentSheet {
  name: string;
  summary: string;
}

export interface CharacterSheet {
  id: string;
  name: string;
  kiith: string;
  crewRole: string;
  rank: string;
  portrait: string;
  tagline: string;
  attributes: AttributeScores;
  skills: SkillScores;
  focuses: string[];
  talents: TalentSheet[];
  truths: string[];
  aspects: string[];
  weapons: WeaponSheet[];
  armour: number;
  maxStress: number;
  equipment: string[];
}

/** What a player chooses in the character designer; the server builds the full sheet. */
export interface CustomCharacterInput {
  name: string;
  kiith: string;
  crewRole: string;
  tagline: string;
  portrait: string;
  attributes: AttributeScores;
  skills: SkillScores;
  focuses: string[];
  aspects: string[];
}

/** Options for the character designer, served at /api/designer. */
export interface DesignerOptions {
  kiithid: { name: string; blurb: string }[];
  roles: { crewRole: string; rank: string; focusSuggestions: string[]; talents: TalentSheet[]; weapons: WeaponSheet[]; armour: number }[];
  portraits: string[];
  /** Portraits of the people at the table, present only on a PC that has them. */
  familyPortraits?: { url: string; label: string }[];
  attributes: AttributeScores;
  skills: SkillScores;
}

/** Running tallies for the debrief's crew citations. */
export interface CrewStats {
  rolls: number;
  passes: number;
  successes: number;
  /** Dice that came up 1 (the Kushan emblem). */
  crits: number;
  complications: number;
  /** Times this character assisted someone else's test. */
  helped: number;
  /** Stress inflicted on enemies. */
  dealt: number;
  takedowns: number;
  /** Stress taken. */
  taken: number;
}

export type ItemStatus = "ok" | "damaged" | "broken" | "lost" | "used up" | "stowed";

/** small fits a pocket or belt, medium needs a hand or a strap, large needs both arms. */
export type ItemSize = "small" | "medium" | "large";

/** Something a character carries: starting kit, or anything picked up along the way. */
export interface InventoryItem {
  id: string;
  name: string;
  /** Where it came from, e.g. "Starting kit" or "Found in the derelict's armoury". */
  origin: string;
  status: ItemStatus;
  size?: ItemSize;
  /** Charges left on a consumable; absent means it doesn't run out. */
  uses?: number;
  /** Short events in order: found, used, damaged, lost. */
  history: string[];
  /** Scene in which it last helped a test; each item helps once per scene. */
  usedInScene?: string;
}

export interface CharacterState {
  sheetId: string;
  stress: number;
  injuries: number;
  fortune: number;
  controllerId?: string;
  inventory?: InventoryItem[];
  /** Injured at some point this mission: they start the next one still wounded unless treated. */
  hurt?: boolean;
  /** Taken down at some point this mission: they come out of it with a scar. */
  downed?: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  role: Role;
  characterId?: string;
  connected: boolean;
}

export type NpcTier = "minor" | "notable" | "major";

export interface NpcState {
  id: string;
  templateId: string;
  name: string;
  tier: NpcTier;
  portrait?: string;
  detail: string;
  stress: number;
  maxStress: number;
  injuries: number;
  armour: number;
  hostile: boolean;
  defeated: boolean;
  surrendered?: boolean;
  /** Notable NPCs can spend Threat to shrug off one injury per scene. */
  avoidedInjury?: boolean;
}

/** What the music should feel like; battles and endings pick their own. */
export type Mood = "lobby" | "briefing" | "exploring" | "mystery" | "tension" | "combat" | "victory" | "loss";

export interface SceneState {
  id: string;
  title: string;
  location: string;
  art: string;
  truths: Truth[];
  /** Set by the mission; the client falls back to exploring or tension. */
  mood?: Mood;
  mode: "scene" | "action" | "space";
  npcs: NpcState[];
  round: number;
  /** Characters who have taken their turn this combat round. */
  acted: string[];
  /** NPCs who have taken their turn this combat round. */
  npcActed: string[];
  /** True once the party has tried to talk their way out of this fight. */
  parleyTried?: boolean;
}

export type RollKind = "test" | "attack" | "work";

// ---------------------------------------------------------------- ships

export const SHIP_SYSTEMS = ["communications", "computers", "engines", "sensors", "structure", "weapons"] as const;
export type ShipSystem = (typeof SHIP_SYSTEMS)[number];
export type ShipRange = "Close" | "Medium" | "Long";

export interface ShipWeapon {
  name: string;
  /** Challenge Dice rolled on a hit. */
  cd: number;
  range: ShipRange;
  piercing?: number;
  vicious?: number;
}

export interface ShipState {
  id: string;
  name: string;
  className: string;
  /** 1 fighter, 2 corvette, 3 frigate, 4 destroyer, 5 carrier or heavy cruiser, 6 mothership. */
  scale: number;
  systems: Record<ShipSystem, number>;
  /** Damage taken, against maxHull (Structure + Scale). */
  hull: number;
  maxHull: number;
  armour: number;
  breaches: Record<ShipSystem, number>;
  weapons: ShipWeapon[];
  /** Ship-studio model id, shown in 3D when the local models are available. */
  model?: string;
}

export interface EnemyShipState extends ShipState {
  /** Crew quality: the attribute and skill its crew roll with. */
  crew: { attribute: number; skill: number };
  range: ShipRange;
  destroyed: boolean;
  /** Fires only on rounds divisible by this (big guns that need to charge). */
  chargeEvery?: number;
  /** Victory doesn't require destroying this ship. */
  optional?: boolean;
}

export type StationAction = "fire" | "evasive" | "pattern" | "scan" | "repair" | "rally" | "jam" | "breakaway";

export interface SpaceBattleState {
  ship: ShipState;
  enemies: EnemyShipState[];
  round: number;
  /** Characters who have taken a station action this round. */
  acted: string[];
  enemyActed: string[];
  /** How often each station action has been used this round (repeats are harder). */
  uses: Partial<Record<StationAction, number>>;
  evasive?: boolean;
  pattern?: boolean;
  jammed?: boolean;
  /** Enemy whose weakness has been found: the next hit on it gains Piercing 2. */
  weakness?: string;
}

/** What a roll feeds back into once accepted. */
export type RollOrigin = "mission" | "attack" | "parley" | "work" | "side" | "station";

export interface RollRequest {
  id: string;
  kind: RollKind;
  origin: RollOrigin;
  /** Character asked to roll; empty means any character at the table may take it. */
  characterId?: string;
  attribute: Attribute;
  skill: Skill;
  difficulty: number;
  reason: string;
  focusHint?: string;
  complicationRange?: number;
  targetNpcId?: string;
  weaponName?: string;
  /** Alternative approaches the roller can choose between (Director tests). */
  approaches?: Approach[];
  /** Set once a character has rolled; outcomes apply when the roller accepts. */
  rolled?: RollRecord;
  /** Crew members adding a die to this test (2d20 assists). */
  assists?: AssistOffer[];
  /** Who asked for the roll, shown on the roll card. */
  askedBy?: string;
  /** A ship station action this roll resolves. */
  station?: { action: StationAction; targetId?: string; weaponName?: string };
}

export interface AssistOffer {
  characterId: string;
  characterName: string;
}

export interface AssistDieRecord {
  characterId: string;
  characterName: string;
  /** The assistant's own attribute and skill for the approach being rolled. */
  attribute: number;
  skill: number;
  die: D20Die;
}

export interface Approach {
  label: string;
  attribute: Attribute;
  skill: Skill;
  difficulty: number;
  /** Ship action: roll the ship's system rating instead of the character's attribute. */
  system?: ShipSystem;
}

export interface RollPayment {
  momentum: number;
  threat: number;
}

export interface RollRecord {
  requestId: string;
  characterId: string;
  characterName: string;
  label: string;
  result: TestResult;
  boughtDice: number;
  payment: RollPayment;
  fortuneSpent: boolean;
  /** True when the Fortune re-roll has been used on this roll. */
  rerolled?: boolean;
  /** NPC rolls are made by the GM and shown in amber. */
  npc?: boolean;
  /** Rolled with real dice at the table and typed in. */
  physical?: boolean;
  /** Assist dice; their successes count only if the leader scored at least one. */
  assists?: AssistDieRecord[];
  /** The test as rolled, so a Fortune re-roll can be re-scored with its assists. */
  spec?: TestSpec;
  /** An item that made the test one step easier. */
  item?: { id: string; name: string };
  stress?: ChallengeRoll & { inflicted: number; target: string; injuriesGained: number; breached?: ShipSystem[] };
  work?: ChallengeRoll & { effective: number };
}

export type LogEntry =
  | { id: string; at: number; type: "narration"; speaker: string; text: string; tone?: "fleet" | "npc" | "gm" | "danger" }
  | { id: string; at: number; type: "action"; playerName: string; characterName?: string; text: string }
  | { id: string; at: number; type: "roll"; roll: RollRecord }
  | { id: string; at: number; type: "system"; text: string };

export interface ChoiceOption {
  id: string;
  label: string;
  hint?: string;
}

export interface PendingChoice {
  id: string;
  prompt: string;
  options: ChoiceOption[];
  votes: Record<string, string>;
}

export type Phase = "lobby" | "playing" | "ended";

/** One mission played in a campaign, for the "Previously on…" recap. */
export interface CampaignChapter {
  missionId: string;
  missionTitle: string;
  /** How it ended, in a sentence or two (from the mission's ending). */
  ending: string;
  ru: number;
  /** Crew who were there, by name. */
  crew: string[];
  /** Scars earned on this mission, e.g. "Teyra S'jet: a burn across the jaw". */
  scars?: string[];
  at: number;
}

/** A campaign as the host sees it in the list of saved campaigns: its latest table and how far it has got. */
export interface CampaignSummary {
  id: string;
  name: string;
  chapters: number;
  /** The last mission finished, if any. */
  lastMission?: string;
  crew: string[];
  /** The campaign's latest table: where to resume, or the finished chapter to continue from. */
  code: string;
  phase: Phase;
  missionTitle: string;
  updatedAt: number;
}

/** A crew carried from mission to mission: what happened, the Requisition banked, advances to spend. */
export interface CampaignState {
  id: string;
  name: string;
  chapters: CampaignChapter[];
  /** Requisition banked from earlier missions, spent between missions on kit. */
  ru: number;
  /** Advances each character has earned and not yet spent (one per mission played). */
  advances: Record<string, number>;
  /** Lasting scars by character id, earned by being taken down on a mission. They never heal. */
  scars?: Record<string, string[]>;
}

export interface TableState {
  id: string;
  code: string;
  name: string;
  phase: Phase;
  gmMode: GmMode;
  aiAvailable: boolean;
  missionId: string;
  missionTitle: string;
  missionBlurb: string;
  missionArt: string;
  /** The mission's own music set from this PC's playlist (such as "kharak"), preferred over the general moods. */
  missionMusic?: string;
  /** The mission's "Before you begin" paragraphs for new players. */
  missionPrimer?: string[];
  /** Kokoro voices for the mission's named speakers, such as {"Mevath Sagald": "bf_isabella"}. */
  missionVoices?: Record<string, string>;
  recommendedPlayers: string;
  players: PlayerInfo[];
  sheets: CharacterSheet[];
  characters: Record<string, CharacterState>;
  pools: Pools;
  scene: SceneState;
  log: LogEntry[];
  pendingRoll?: RollRequest;
  pendingChoice?: PendingChoice;
  extended?: ExtendedTest & { attemptsLeft?: number };
  space?: SpaceBattleState;
  /** True while the GM (Director or Claude) is composing a response. */
  gmThinking: boolean;
  /** Set while the Claude GM is paused, e.g. out of API credit; says why and what to do. */
  gmNotice?: string;
  /** Narration is waiting for someone to press Continue. */
  awaitingContinue: boolean;
  /** Current node of the mission graph. */
  nodeId?: string;
  awards?: { ru: number; reasons: string[] };
  /** Set when this table is part of a campaign. */
  campaign?: CampaignState;
  /** Set on a finished table once the campaign continues: everyone moves to this table. */
  nextTable?: string;
  stats?: Record<string, CrewStats>;
  seq: number;
}

/** Messages from a client to the server. */
export type ClientMessage =
  | { type: "hello"; tableCode: string; playerId?: string; name: string; role: Role }
  | { type: "claimCharacter"; characterId: string | null }
  /** Design a new crew member; the server checks it, adds it to the table and gives it to you. */
  | { type: "createCharacter"; character: CustomCharacterInput }
  | { type: "setGmMode"; mode: GmMode }
  | { type: "setMission"; missionId: string }
  | { type: "startGame" }
  | { type: "playerAction"; text: string }
  | { type: "takeRoll"; characterId: string; approachIndex?: number }
  | {
      type: "roll";
      boughtDice: number;
      payWithThreat: boolean;
      useFocus: boolean;
      fortuneCritical: boolean;
      approachIndex?: number;
      /** Use an item from the roller's inventory: one step easier, once per item per scene. */
      itemId?: string;
      /** Real dice rolled at the table: the faces of the d20s (not counting a Fortune critical, which is a 1). */
      faces?: number[];
    }
  | { type: "fortuneReroll"; indices: number[] }
  /** Offer (or withdraw) your character's help on the waiting test. */
  | { type: "assist"; characterId: string }
  /** Momentum spent when accepting adds stress to an attack or Work to an extended test (max 3). */
  | { type: "acceptRoll"; bonus?: number }
  | { type: "advance" }
  | { type: "combatAction"; action: "attack" | "parley"; characterId: string; targetNpcId?: string; weaponName?: string }
  | { type: "stationAction"; action: StationAction; characterId: string; targetId?: string; weaponName?: string }
  | { type: "vote"; optionId: string }
  /** Between missions: spend an advance on +1 to a skill or a new focus. */
  | { type: "spendAdvance"; characterId: string; skill?: Skill; focus?: string }
  /** Between missions: buy kit from the fleet with banked Requisition. */
  | { type: "requisition"; characterId: string; itemId: string }
  /** Between missions: the fleet infirmary treats a wound carried from the last mission, for 1 RU. */
  | { type: "treatWound"; characterId: string }
  | { type: "gmNarrate"; text: string }
  | { type: "gmThreat"; delta: number; cause: string }
  | { type: "gmCallTest"; request: Pick<RollRequest, "characterId" | "attribute" | "skill" | "difficulty" | "reason" | "focusHint"> };

/** Messages from the server to a client. */
export type ServerMessage =
  | { type: "welcome"; playerId: string; state: TableState }
  | { type: "state"; state: TableState }
  | { type: "error"; message: string };

export const MAX_PLAYERS = 6;
/** Requisition the fleet infirmary charges to treat a wound carried between missions. */
export const INFIRMARY_COST = 1;
export const LOG_LIMIT = 250;
export * from "./speech.js";
