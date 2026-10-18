import type { Approach, EnemyShipState, Mood, NpcTier, ShipState, WeaponSheet } from "@hwr/protocol";
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
  options: { id: string; label: string; hint?: string; next: string }[];
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

/** A ship battle: the crew work the bridge stations of their ship against enemy ships. */
export interface SpaceNode extends NodeBase {
  type: "space";
  intro: string;
  ship: Omit<ShipState, "hull" | "breaches">;
  enemies: Omit<EnemyShipState, "hull" | "breaches" | "destroyed">[];
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

export type MissionNode = NarrationNode | ChoiceNode | TestNode | CombatNode | SpaceNode | ExtendedNode | EndNode;

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
  /** Narration voices for named speakers (Kokoro voice ids, such as "bf_isabella"), so each sounds like who they are. */
  voices?: Record<string, string>;
  startNode: string;
  nodes: Record<string, MissionNode>;
  npcs: Record<string, NpcTemplate>;
  /** Background the AI GM gets in its prompt; never shown to players. */
  gmNotes: string;
}

/** Ids of nodes that a node can lead to. */
export function nextNodes(node: MissionNode): string[] {
  switch (node.type) {
    case "narration":
      return [node.next];
    case "choice":
      return node.options.map((o) => o.next);
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
