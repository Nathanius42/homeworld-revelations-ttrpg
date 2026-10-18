import Anthropic from "@anthropic-ai/sdk";
import { ATTRIBUTES, SKILLS, conditionOf } from "@hwr/rules-engine";
import type { PlayerInfo, RollRecord, TableState } from "@hwr/protocol";
import { GameError, type Game } from "./engine.js";

/**
 * Haiku is the default: table narration and five simple tools are light work, it's the
 * fastest at the table and a twentieth of Sonnet's price. If its narration falls short, set
 * HWR_GM_MODEL in .env to claude-sonnet-5-5 (or claude-opus-5-5). All three accept the
 * adaptive thinking and effort settings used below.
 */
export const CLAUDE_MODEL = process.env.HWR_GM_MODEL?.trim() || "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 40;

/** The subset of the SDK the GM uses, so tests can supply a fake. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export function createAnthropicClient(apiKey: string): Anthropic {
  // The ambient ANTHROPIC_BASE_URL is deliberately ignored so a developer proxy on this PC can't hijack the game.
  return new Anthropic({ apiKey, baseURL: process.env.HWR_ANTHROPIC_BASE_URL || "https://api.anthropic.com" });
}

/**
 * Checks a key by listing models, which costs nothing, so the host console can refuse a bad key
 * before saving it. Undefined means the key works.
 */
export async function checkClaudeKey(apiKey: string): Promise<GmFailure | undefined> {
  try {
    await createAnthropicClient(apiKey).models.list({ limit: 1 });
    return undefined;
  } catch (err) {
    const failure = classifyApiError(err);
    if (failure.kind === "auth") return { ...failure, message: "Anthropic rejected that key. Check it's an API key from the Claude Console (it starts sk-ant-) and that it hasn't been revoked." };
    if (failure.kind === "offline") return { ...failure, message: "This PC can't reach Anthropic to check the key. Connect to the internet and try again." };
    return failure;
  }
}

export interface GmFailure {
  /** billing and auth problems need the host to act; busy and offline are usually brief. */
  kind: "billing" | "auth" | "busy" | "offline" | "rejected" | "unknown";
  /** Player-facing explanation, ending with what happens next. */
  message: string;
  /** How long to stop calling the API: 0 retries on the next action, Infinity waits for a restart. */
  pauseMs: number;
}

const MINUTE = 60_000;

/**
 * Turns an API failure into something the table can act on. The SDK has already retried
 * rate limits, overloads and server errors twice by the time one reaches here.
 */
export function classifyApiError(err: unknown): GmFailure {
  if (err instanceof Anthropic.APIConnectionError) {
    return { kind: "offline", message: "The Claude GM can't reach the API (is this PC online?). The Director carries on; it will try again in a minute.", pauseMs: MINUTE };
  }
  if (err instanceof Anthropic.APIError) {
    const text = `${err.message} ${JSON.stringify(err.error ?? "")}`;
    if (err.type === "billing_error" || /credit balance|usage limit|spend limit|billing/i.test(text)) {
      return {
        kind: "billing",
        message: "The Claude GM is out of API credit or has hit its spend limit. Top up on the Billing page of the Claude Console and it will try again within five minutes. The Director carries on.",
        pauseMs: 5 * MINUTE,
      };
    }
    if (err.status === 401) {
      return { kind: "auth", message: "The Claude GM's API key was rejected or has expired. Paste a new key on the host console (or put one in .env and restart the server). The Director carries on.", pauseMs: Infinity };
    }
    if (err.status === 403) {
      return { kind: "auth", message: "The Claude GM's API key isn't allowed to use this model or workspace. Check the key's workspace in the Claude Console and restart the server. The Director carries on.", pauseMs: Infinity };
    }
    if (err.status === 429 || err.status === 529 || err.type === "overloaded_error" || (err.status ?? 0) >= 500) {
      return { kind: "busy", message: "Claude is busy right now, so the Director carries on this turn. Try again in a moment.", pauseMs: 0 };
    }
    return { kind: "rejected", message: `The API turned that request down (${err.status ?? "error"}; details are in the server log). The Director carries on.`, pauseMs: 0 };
  }
  return { kind: "unknown", message: "Something went wrong with the Claude GM (details are in the server log). The Director carries on.", pauseMs: 0 };
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "narrate",
    description:
      "Say something to the table: description, NPC dialogue or consequences. Use one call per voice. Keep each to one to three short paragraphs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        speaker: { type: "string", description: "Who is speaking: 'Narrator', 'Fleet Command', or an NPC's name." },
        tone: { type: "string", enum: ["gm", "npc", "fleet", "danger"], description: "gm = description, npc = dialogue, fleet = Fleet Command, danger = threats and harm." },
        text: { type: "string" },
      },
      required: ["speaker", "tone", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "call_for_test",
    description:
      "Ask a character to roll a skill test when the outcome of what they're attempting is uncertain and interesting. Only one roll can be waiting at a time. The result arrives in a later message; end your turn after calling this.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string", description: "Character id from the party list, or an empty string to let anyone take it." },
        attribute: { type: "string", enum: [...ATTRIBUTES] },
        skill: { type: "string", enum: [...SKILLS] },
        difficulty: { type: "integer", description: "0 (trivial) to 5 (epic). Most tests are 1 or 2." },
        reason: { type: "string", description: "Short label shown on the roll card, e.g. 'Talk the guard round'." },
      },
      required: ["character_id", "attribute", "skill", "difficulty", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "adjust_threat",
    description:
      "Add Threat when the situation worsens (positive delta), or spend it (negative delta) to make trouble: a complication, an NPC reinforcement, a twist. Always give the in-fiction cause.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { delta: { type: "integer" }, cause: { type: "string" } },
      required: ["delta", "cause"],
      additionalProperties: false,
    },
  },
  {
    name: "add_truth",
    description: "Add a scene truth: an advantage that helps the crew, a complication that hinders them, or a threat.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string" },
        kind: { type: "string", enum: ["advantage", "complication", "threat"] },
      },
      required: ["label", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "give_item",
    description:
      "Put something in a character's kit when they pick it up, are given it or make it: a weapon off a wall, a data core, a stolen keycard. Be generous with interesting finds; players can use an item later to make a test one step easier (once per scene).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string", description: "Character id from the party list." },
        name: { type: "string", description: "Short item name, e.g. 'Pair of ceremonial swords'." },
        origin: { type: "string", description: "Where it came from, in a few words, e.g. 'Taken from the derelict's armoury'." },
        uses: { type: "integer", description: "Charges for consumables (e.g. 3 for a medkit), or 0 if it doesn't run out." },
        size: { type: "string", enum: ["small", "medium", "large"], description: "small: pocket or belt. medium: needs a hand or a strap (rifle, toolkit, pair of swords). large: needs both arms (crate, engine part)." },
      },
      required: ["character_id", "name", "origin", "uses", "size"],
      additionalProperties: false,
    },
  },
  {
    name: "change_item",
    description:
      "Damage, break, lose or repair an item as a consequence: a blade snaps parrying a blow, a keycard is dropped in the vacuum, an engineer patches a cracked visor. Use it for complications and costs, not at random.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        item: { type: "string", description: "The item's name as it appears in the party list." },
        status: { type: "string", enum: ["damaged", "broken", "lost", "stowed", "ok"], description: "ok = repaired or taken back in hand; stowed = left aboard the ship, out of reach until they return." },
        reason: { type: "string", description: "What happened, in a few words." },
      },
      required: ["character_id", "item", "status", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_truth",
    description: "Remove a scene truth that no longer applies, by its id.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

function systemPrompt(game: Game): string {
  const m = game.mission;
  return `You are the Game Master for a table playing Homeworld: Revelations, a tabletop RPG set in the Homeworld universe, through a web app. The players are friends who want a fun, cinematic evening; none of them wants to run the game.

How the app splits the work:
- A scripted Director runs the mission's structure: scene changes, the crew's votes, mission tests, combat turns, the extended test and the ending. You never advance the mission yourself and never contradict what the Director has narrated.
- You handle everything in between: when a player describes something their character does in free text, you respond in character, describe the result, voice NPCs, and call for a test when the outcome is uncertain. You can raise or spend Threat and add or remove truths.
- If a mission roll or vote is already waiting, keep your response short and point the players back to it.

Rules you need:
- Tests: attribute + skill = target number. Roll 2d20 (up to 5 with bought dice); each die at or under the target is a success; 1s are two successes. Difficulty 0-5 is the number of successes needed; most tests are 1 or 2. Excess successes become group Momentum (max 6). A 20 is a complication.
- Attributes: ${ATTRIBUTES.join(", ")}. Skills: ${SKILLS.join(", ")}.
- Threat is your pool. Players add to it when they buy dice with it or roll complications. Spend it visibly, with a cause, to make trouble. Don't hoard it, and don't punish the crew for nothing.
- Truths are facts of the scene. Advantages make tests easier, complications make them harder.
- Characters carry items, listed under "Carrying". When someone picks something up, give it to them with give_item. Items can come back later in surprising ways; players can use one to make a test one step easier, once per scene. Damage, break or lose gear with change_item as a cost or complication, and bring finds back into the story.
- No hammerspace: people carry only what fits on their person. Small things count 1, medium 2, large 4 against their load (shown as Load x/y). If give_item says it won't fit, have them drop or stow something, hand it to someone with room, or leave it behind; a crate of rifles doesn't go in a pocket. Stowed gear is aboard the ship and out of reach until they return.
- Crew can assist each other's tests: each helper adds one d20, which only counts if the leader scores.
- In ship battles the crew work bridge stations (Tactical, Helm, Sensors, Comms, Engineering, Command), rolling the ship's system rating plus their skill. Narrate the ship's peril vividly; the Director runs the enemy ships.

Style:
- Australian English. Second person for the crew ("you"), present tense.
- Homeworld tone: vast, lonely, beautiful space; the Exodus fleet's hope and grief; Kiith loyalties; ancient Hiigaran mysteries.
- Short and punchy: one to three paragraphs per narrate call. End on something the crew can act on.
- Say yes to creative ideas, then make them roll if it's risky. Never decide what a player's character feels or does.
- Use the tools for everything you say; plain text replies aren't shown.

Mission: ${m.title}
${m.blurb}

GM background (secret, reveal through play):
${m.gmNotes}

The crew:
${game.state.sheets
  .filter((s) => game.partyIds().includes(s.id))
  .map(
    (s) =>
      `- ${s.name} (id ${s.id}), ${s.rank}, ${s.crewRole} of Kiith ${s.kiith}. ${s.tagline} Attributes ${ATTRIBUTES.map((a) => `${a} ${s.attributes[a]}`).join(", ")}. Skills ${SKILLS.map((k) => `${k} ${s.skills[k]}`).join(", ")}. Focuses: ${s.focuses.join(", ")}.`,
  )
  .join("\n")}`;
}

function situation(state: TableState, game: Game): string {
  const scene = state.scene;
  const party = game.partyIds().map((id) => {
    const sheet = game.sheet(id);
    const c = state.characters[id]!;
    const player = state.players.find((p) => p.id === c.controllerId);
    const { load: now, capacity: max } = game.loadOf(id);
    const kit = (c.inventory ?? [])
      .filter((i) => i.status !== "lost" && i.status !== "used up")
      .map((i) => `${i.name} (${i.size ?? "small"}${i.status !== "ok" ? `, ${i.status}` : ""}${i.uses !== undefined ? `, ${i.uses} left` : ""})`)
      .join(", ");
    const scars = state.campaign?.scars?.[id] ?? [];
    const scarText = scars.length ? ` Scars from earlier missions (weave them into the story now and then): ${scars.join("; ")}.` : "";
    return `${sheet.name} [id ${id}] (played by ${player?.name ?? "nobody"}): stress ${c.stress}/${sheet.maxStress}, injuries ${c.injuries}, ${conditionOf(c.injuries)}. Load ${now}/${max}. Carrying: ${kit || "nothing"}.${scarText}`;
  });
  const waiting = state.pendingRoll
    ? `A roll is waiting: ${state.pendingRoll.reason}.`
    : state.pendingChoice
      ? `The crew is voting: ${state.pendingChoice.prompt}`
      : state.scene.mode === "action"
        ? `Combat, round ${scene.round}.`
        : state.space
          ? `Ship battle, round ${state.space.round}: ${state.space.ship.name} hull ${state.space.ship.maxHull - state.space.ship.hull}/${state.space.ship.maxHull}; enemies ${state.space.enemies.map((e) => `${e.name}${e.destroyed ? " (destroyed)" : ""}`).join(", ")}.`
          : "Nothing is waiting.";
  const recent = state.log
    .slice(-8)
    .map((l) =>
      l.type === "narration"
        ? `${l.speaker}: ${l.text}`
        : l.type === "action"
          ? `${l.characterName ?? l.playerName}: ${l.text}`
          : l.type === "roll"
            ? `[roll] ${l.roll.characterName}, ${l.roll.label}: ${l.roll.result.passed ? "passed" : "failed"}`
            : `[system] ${l.text}`,
    )
    .join("\n");
  const story = state.story;
  const flags = Object.entries(story?.flags ?? {}).map(([k, v]) => (v === true ? k : `${k}=${String(v)}`));
  const remembered = flags.length ? `\nThe campaign remembers (choices made on earlier missions; let them echo): ${flags.join(", ")}.` : "";
  const countdown = story?.clock ? `\nCountdown: ${story.clock.label} ${story.clock.value} of ${story.clock.max}. Let the pressure show as it rises.` : "";
  return `<situation>
Scene: ${scene.title}, ${scene.location}.
Truths: ${scene.truths.map((t) => `${t.label} (${t.kind}, id ${t.id})`).join("; ") || "none"}.
Momentum ${state.pools.momentum}, Threat ${state.pools.threat}.${remembered}${countdown}
${party.join("\n")}
${waiting}
Recent log:
${recent}
</situation>`;
}

type Job = { kind: "action"; player: PlayerInfo; text: string } | { kind: "roll"; record: RollRecord };

/**
 * Improvises around the mission script with Claude. Runs one turn at a time per table
 * and reports every change through commit() so players see narration as it lands.
 */
export class ClaudeGm {
  private history: Anthropic.MessageParam[] = [];
  private queue: Job[] = [];
  private running = false;
  private pausedUntil = 0;

  constructor(
    private readonly game: Game,
    private readonly client: MessagesClient,
    private readonly commit: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  onPlayerAction(player: PlayerInfo, text: string): void {
    this.enqueue({ kind: "action", player, text });
  }

  onSideRoll(record: RollRecord): void {
    this.enqueue({ kind: "roll", record });
  }

  /** Resolves once the queue is empty; used by tests. */
  async idle(): Promise<void> {
    while (this.running || this.queue.length) await new Promise((r) => setTimeout(r, 5));
  }

  private enqueue(job: Job): void {
    this.queue.push(job);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    this.game.state.gmThinking = true;
    this.commit();
    try {
      while (this.queue.length) await this.turn(this.queue.shift()!);
    } finally {
      this.running = false;
      this.game.state.gmThinking = false;
      this.commit();
    }
  }

  private describe(job: Job): string {
    const state = this.game.state;
    if (job.kind === "action") {
      const who = job.player.characterId ? `${this.game.sheet(job.player.characterId).name} (${job.player.name})` : job.player.name;
      return `${situation(state, this.game)}\n\n${who} says or does: ${job.text}`;
    }
    const r = job.record;
    return `${situation(state, this.game)}\n\nThe test you called for is in: ${r.characterName}, "${r.label}", ${r.result.successes} successes against difficulty ${r.result.difficulty}: ${r.result.passed ? `PASSED with ${r.result.momentum} Momentum` : "FAILED"}${r.result.complications ? `, with ${r.result.complications} complication(s)` : ""}. Narrate the outcome.`;
  }

  private async turn(job: Job): Promise<void> {
    if (this.game.state.phase !== "playing") return;
    // While paused the table has already been told why; quietly let the Director handle it.
    if (this.now() < this.pausedUntil) return;
    const start = this.history.length;
    this.history.push({ role: "user", content: this.describe(job) });
    let spoke = false;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 4000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [{ type: "text", text: systemPrompt(this.game), cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages: this.history,
        });
        this.history.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "refusal") {
          this.game.narrate("Narrator", "The comm channel crackles with static. (The Claude GM declined that one; try something else.)", "gm");
          this.commit();
          break;
        }
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (response.stop_reason === "tool_use" && toolUses.length) {
          const results: Anthropic.ToolResultBlockParam[] = toolUses.map((use) => {
            const out = this.runTool(use);
            if (use.name === "narrate" && !out.is_error) spoke = true;
            return { type: "tool_result", tool_use_id: use.id, content: out.content, is_error: out.is_error };
          });
          this.commit();
          this.history.push({ role: "user", content: results });
          continue;
        }
        if (response.stop_reason === "pause_turn") continue;
        if (!spoke) {
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
          if (text) {
            this.game.narrate("Narrator", text, "gm");
            this.commit();
          }
        }
        break;
      }
      if (this.game.state.gmNotice) {
        this.game.state.gmNotice = undefined;
        this.commit();
      }
    } catch (err) {
      // Drop the whole failed turn, including any tool calls, so the next request is well formed.
      this.history.length = start;
      const failure = classifyApiError(err);
      console.error(`Claude GM error (${failure.kind}):`, err);
      this.pausedUntil = failure.pauseMs ? this.now() + failure.pauseMs : 0;
      this.game.state.gmNotice = failure.pauseMs ? failure.message : undefined;
      this.game.system(failure.message);
      this.commit();
    }
    this.trimHistory();
  }

  private runTool(use: Anthropic.ToolUseBlock): { content: string; is_error?: boolean } {
    const input = use.input as Record<string, unknown>;
    try {
      switch (use.name) {
        case "narrate": {
          const tone = (["gm", "npc", "fleet", "danger"] as const).find((t) => t === input.tone) ?? "gm";
          this.game.narrate(String(input.speaker || "Narrator").slice(0, 60), String(input.text ?? "").slice(0, 2000), tone);
          return { content: "Said." };
        }
        case "call_for_test": {
          const attribute = ATTRIBUTES.find((a) => a === input.attribute);
          const skill = SKILLS.find((s) => s === input.skill);
          if (!attribute || !skill) return { content: "Unknown attribute or skill.", is_error: true };
          const characterId = typeof input.character_id === "string" && input.character_id ? input.character_id : undefined;
          this.game.callSideTest({
            characterId,
            attribute,
            skill,
            difficulty: Number(input.difficulty) || 0,
            reason: String(input.reason ?? "Test").slice(0, 80),
            askedBy: "Claude GM",
          });
          return { content: "The roll card is on the table. Stop here; the result will come in a later message." };
        }
        case "adjust_threat": {
          const delta = Math.trunc(Number(input.delta) || 0);
          if (delta < 0 && -delta > this.game.state.pools.threat) return { content: `Only ${this.game.state.pools.threat} Threat available.`, is_error: true };
          this.game.adjustThreat(Math.max(-6, Math.min(6, delta)), String(input.cause ?? "the GM's doing").slice(0, 120));
          return { content: `Threat is now ${this.game.state.pools.threat}.` };
        }
        case "add_truth": {
          const kind = (["advantage", "complication", "threat"] as const).find((k) => k === input.kind) ?? "complication";
          const label = String(input.label ?? "").slice(0, 60);
          const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "truth";
          this.game.addTruth({ id, label, kind, strength: 1, scope: "location" });
          return { content: `Added truth ${id}.` };
        }
        case "remove_truth":
          this.game.removeTruth(String(input.id ?? ""));
          return { content: "Removed." };
        case "give_item": {
          const uses = Number(input.uses) || 0;
          const size = ["small", "medium", "large"].includes(String(input.size)) ? (String(input.size) as "small" | "medium" | "large") : undefined;
          const item = this.game.giveItem(String(input.character_id ?? ""), String(input.name ?? ""), String(input.origin ?? ""), uses > 0 ? uses : undefined, size);
          return { content: `Given: ${item.name}.` };
        }
        case "change_item": {
          const status = String(input.status ?? "");
          if (!["damaged", "broken", "lost", "stowed", "ok"].includes(status)) return { content: "Unknown status.", is_error: true };
          const item = this.game.changeItem(String(input.character_id ?? ""), String(input.item ?? ""), status as "damaged" | "broken" | "lost" | "stowed" | "ok", String(input.reason ?? ""));
          return { content: `${item.name} is now ${item.status}.` };
        }
        default:
          return { content: `Unknown tool ${use.name}.`, is_error: true };
      }
    } catch (err) {
      if (err instanceof GameError) return { content: err.message, is_error: true };
      throw err;
    }
  }

  /** Keeps the conversation bounded. Cuts only at a plain user turn so tool results never lose their tool calls. */
  private trimHistory(): void {
    if (this.history.length <= HISTORY_LIMIT) return;
    let cut = this.history.length - HISTORY_LIMIT;
    while (cut < this.history.length && typeof this.history[cut]!.content !== "string") cut++;
    this.history = this.history.slice(cut);
  }
}
