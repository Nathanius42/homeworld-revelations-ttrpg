import type { Approach, EnemyShipState, FlagValue, Mood, NpcTier, ShipState, StationAction, StoryState, WeaponSheet } from "@hwr/protocol";
import type { AttributeScores, SkillScores, Truth } from "@hwr/rules-engine";

/** State changes a node can make when it resolves. */
export interface Effects {
  momentum?: number;
  threat?: number;
  addTruths?: Truth[];
  removeTruths?: string[];
  /** Stress on the character who rolled (after armour). */
  stressRoller?: number;
  /** Stress on every character at the table (after armour). */
  stressParty?: number;
  ru?: number;
  /** Something the crew finds: given to the character who rolled, or to whoever carries least. */
  giveItem?: { name: string; origin: string; uses?: number; size?: "small" | "medium" | "large" };
  /** Story flags to remember for later missions, such as `{ destroyerScuttled: true }`. */
  setFlags?: Record<string, FlagValue>;
  /** Moves the campaign countdown (the mission's `clock`): positive runs it on, negative winds it back. */
  clock?: number;
  /** Refits (ids from SHIP_REFITS) the crew's ship loses for the rest of the campaign: they can't be fitted again. */
  loseRefits?: string[];
}

/**
 * A test of what the story remembers: a flag set (to a value, or to anything truthy), a flag
 * not set, or the countdown at or past a point.
 */
export type Condition = { flag: string; equals?: FlagValue } | { notFlag: string } | { clockAtLeast: number };

/** Whether the story meets a condition. */
export function meets(condition: Condition, story: StoryState | undefined): boolean {
  const flags = story?.flags ?? {};
  if ("flag" in condition) return condition.equals === undefined ? Boolean(flags[condition.flag]) : flags[condition.flag] === condition.equals;
  if ("notFlag" in condition) return !flags[condition.notFlag];
  return (story?.clock?.value ?? 0) >= condition.clockAtLeast;
}

export interface Outcome {
  text: string;
  speaker?: string;
  effects?: Effects;
  next: string;
}

export interface SceneSetup {
  title: string;
  location: string;
  art: string;
  truths?: Truth[];
  /** Music for the scene (lobby, briefing, exploring, mystery, tension, combat, victory, loss). */
  mood?: Mood;
}

interface NodeBase {
  id: string;
  /** Replaces the scene when this node starts. */
  scene?: SceneSetup;
}

export interface NarrationNode extends NodeBase {
  type: "narration";
  speaker: string;
  tone?: "fleet" | "npc" | "gm" | "danger";
  text: string;
  effects?: Effects;
  next: string;
}

export interface ChoiceNode extends NodeBase {
  type: "choice";
  prompt: string;
  /** An option with `requires` is only offered when the story meets it; `effects` apply when it wins the vote. */
  options: { id: string; label: string; hint?: string; next: string; requires?: Condition; effects?: Effects }[];
}

/** Goes straight on to the first case the story meets, else `otherwise`. The players never see it. */
export interface BranchNode extends NodeBase {
  type: "branch";
  cases: { when: Condition; next: string }[];
  otherwise: string;
}

export interface TestNode extends NodeBase {
  type: "test";
  prompt: string;
  reason: string;
  approaches: Approach[];
  focusHint?: string;
  complicationRange?: number;
  pass: Outcome;
  fail: Outcome;
}

export interface CombatNode extends NodeBase {
  type: "combat";
  intro: string;
  npcs: string[];
  victory: Outcome;
  defeat: Outcome;
  parley?: { label: string; approach: Approach; pass: Outcome; failText: string };
  /** Narrated when the Director spends Threat on reinforcements. */
  reinforcementText?: string;
  /** Narrated when the minor NPCs give up after their leader falls. */
  moraleText?: string;
}

export type EnemyShipSpec = Omit<EnemyShipState, "hull" | "breaches" | "destroyed" | "impactRound" | "impacted">;

/**
 * A turn in a staged battle. It happens once, the first time its trigger holds: from a round on,
 * once a ship is destroyed (or has struck), once the crew's ship has taken so much hull damage, or
 * once every enemy that matters is gone (enemies it brings in then keep the battle going).
 */
export interface SpacePhase {
  id: string;
  when: { round?: number; destroyed?: string; hullAtLeast?: number; cleared?: true };
  /** Passed over for good if the story doesn't meet this when the trigger holds. */
  requires?: Condition;
  text: string;
  speaker?: string;
  effects?: Effects;
  /** Enemies that arrive. */
  spawn?: EnemyShipSpec[];
  /** Stations the ship stops answering from. */
  lock?: StationAction[];
  unlock?: StationAction[] | "all";
  /** Wakes (true) or quiets (false) the ship's own will. */
  rogue?: boolean;
  /** Ends the battle on the spot. */
  end?: "victory" | "escaped" | "defeat";
}

/** What a ship with a mind of its own does at the end of a round when it's awake. */
export interface RogueShip {
  speaker: string;
  /** Lines for each thing it can do; {target} and {station} are filled in. */
  fire: string[];
  surge: string[];
  seize: string[];
  /** Challenge Dice of damage a surge does to the ship (default 3). */
  surgeCd?: number;
  /** Awake from the first round. */
  awake?: boolean;
}

/** A ship battle: the crew work the bridge stations of their ship against enemy ships. */
export interface SpaceNode extends NodeBase {
  type: "space";
  intro: string;
  ship: Omit<ShipState, "hull" | "breaches">;
  enemies: EnemyShipSpec[];
  /** Stations locked from the start. */
  locked?: StationAction[];
  phases?: SpacePhase[];
  rogue?: RogueShip;
  /** Difficulty to override a locked station (default 2). */
  overrideDifficulty?: number;
  /** Applied each time a missile (an enemy with `impact`) strikes. */
  impactEffects?: Effects;
  /** Applied each time Helm puts the ship in a missile's path. */
  interceptEffects?: Effects;
  /** Whether Helm can try to Break away, and what difficulty it starts at. */
  breakaway?: { difficulty: number };
  /** Narrated when the enemies that matter are destroyed. */
  victory: Outcome;
  /** Narrated when the crew break away. */
  escaped?: Outcome;
  defeat: Outcome;
}

export interface ExtendedNode extends NodeBase {
  type: "extended";
  prompt: string;
  label: string;
  work: number;
  magnitude: number;
  resistance: number;
  attempts: number;
  approaches: Approach[];
  /** Narrated after each attempt that doesn't finish the task. */
  pressure: string[];
  complete: Outcome;
  timeout: Outcome;
}

export interface EndNode extends NodeBase {
  type: "end";
  text: string;
  ru: number;
}

export type MissionNode = NarrationNode | ChoiceNode | BranchNode | TestNode | CombatNode | SpaceNode | ExtendedNode | EndNode;

export interface NpcTemplate {
  id: string;
  name: string;
  tier: NpcTier;
  portrait?: string;
  detail: string;
  attributes: AttributeScores;
  skills: SkillScores;
  maxStress: number;
  armour: number;
  weapon: WeaponSheet;
  /** Which attribute the NPC attacks with. */
  attackAttribute: "coordination" | "brawn";
}

export interface Mission {
  id: string;
  title: string;
  blurb: string;
  recommendedPlayers: string;
  /** Banner art for the lobby and mission picker. */
  art: string;
  /** A named music set in the private playlist (tools/music/build.py), such as "kharak" for missions on the desert world. */
  music?: string;
  /** The mission a campaign should play next (players can still choose another). */
  sequel?: string;
  /** "Before you begin" for new players, shown in the lobby: the setting, who you are, what's at stake. A few short paragraphs. */
  primer?: string[];
  /** Narration voices for named speakers (Kokoro voice ids, such as "bf_isabella", or "bm_fable@0.82" to set the speed), so each sounds like who they are. */
  voices?: Record<string, string>;
  startNode: string;
  nodes: Record<string, MissionNode>;
  npcs: Record<string, NpcTemplate>;
  /** Background the AI GM gets in its prompt; never shown to players. */
  gmNotes: string;
  /**
   * The campaign countdown this mission uses, such as `{ id: "awakening", label: "Dreadnought awakening", max: 8 }`.
   * It starts at 0 the first time a campaign meets it and carries on from mission to mission.
   */
  clock?: { id: string; label: string; max: number };
}

/** Ids of nodes that a node can lead to. */
export function nextNodes(node: MissionNode): string[] {
  switch (node.type) {
    case "narration":
      return [node.next];
    case "choice":
      return node.options.map((o) => o.next);
    case "branch":
      return [...node.cases.map((c) => c.next), node.otherwise];
    case "test":
      return [node.pass.next, node.fail.next];
    case "combat":
      return [node.victory.next, node.defeat.next, ...(node.parley ? [node.parley.pass.next] : [])];
    case "extended":
      return [node.complete.next, node.timeout.next];
    case "space":
      return [node.victory.next, node.defeat.next, ...(node.escaped ? [node.escaped.next] : [])];
    case "end":
      return [];
  }
}

/** Every set of effects a node can apply, whichever way it resolves. */
function effectsOf(node: MissionNode): (Effects | undefined)[] {
  switch (node.type) {
    case "narration":
      return [node.effects];
    case "choice":
      return node.options.map((o) => o.effects);
    case "test":
      return [node.pass.effects, node.fail.effects];
    case "combat":
      return [node.victory.effects, node.defeat.effects, node.parley?.pass.effects];
    case "extended":
      return [node.complete.effects, node.timeout.effects];
    case "space":
      return [node.victory.effects, node.defeat.effects, node.escaped?.effects, node.impactEffects, node.interceptEffects, ...(node.phases ?? []).map((p) => p.effects)];
    default:
      return [];
  }
}

/** Finds broken links and unreachable nodes in a mission graph. */
export function validateMission(mission: Mission): string[] {
  const problems: string[] = [];
  if (!mission.nodes[mission.startNode]) problems.push(`start node ${mission.startNode} is missing`);
  for (const node of Object.values(mission.nodes)) {
    for (const next of nextNodes(node)) {
      if (!mission.nodes[next]) problems.push(`${node.id} links to missing node ${next}`);
    }
    if (node.type === "combat") {
      for (const npc of node.npcs) if (!mission.npcs[npc]) problems.push(`${node.id} uses missing NPC ${npc}`);
    }
    if (node.type === "space") {
      const ships = new Set([...node.enemies, ...(node.phases ?? []).flatMap((p) => p.spawn ?? [])].map((e) => e.id));
      const phaseIds = new Set<string>();
      for (const phase of node.phases ?? []) {
        if (phaseIds.has(phase.id)) problems.push(`${node.id} has two phases called ${phase.id}`);
        phaseIds.add(phase.id);
        if (phase.when.destroyed && !ships.has(phase.when.destroyed)) problems.push(`${node.id} phase ${phase.id} waits on missing ship ${phase.when.destroyed}`);
        if (Object.keys(phase.when).length === 0) problems.push(`${node.id} phase ${phase.id} has no trigger`);
      }
      if (node.phases?.some((p) => p.rogue) && !node.rogue) problems.push(`${node.id} wakes a rogue ship but doesn't say what it does`);
    }
    // A vote must always have something to vote on, whatever the story remembers.
    if (node.type === "choice" && node.options.every((o) => o.requires)) problems.push(`${node.id} has no option without a requirement`);
    if (!mission.clock && effectsOf(node).some((e) => e?.clock)) problems.push(`${node.id} moves a countdown, but the mission has no clock`);
  }
  const seen = new Set<string>();
  const queue = [mission.startNode];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !mission.nodes[id]) continue;
    seen.add(id);
    queue.push(...nextNodes(mission.nodes[id]!));
  }
  for (const id of Object.keys(mission.nodes)) if (!seen.has(id)) problems.push(`${id} is unreachable`);
  if (![...seen].some((id) => mission.nodes[id]?.type === "end")) problems.push("no end node is reachable");
  return problems;
}
