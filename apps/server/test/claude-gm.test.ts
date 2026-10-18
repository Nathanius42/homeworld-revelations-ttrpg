import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { seededRng } from "@hwr/rules-engine";
import { DEFAULT_MISSION_ID } from "@hwr/content";
import { CLAUDE_MODEL, ClaudeGm, classifyApiError, type MessagesClient } from "../src/claude-gm.js";
import { Game, newTableState } from "../src/engine.js";

function message(stop: Anthropic.Message["stop_reason"], content: unknown[]): Anthropic.Message {
  return { id: "m", type: "message", role: "assistant", model: CLAUDE_MODEL, content, stop_reason: stop, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}

function scripted(responses: Anthropic.Message[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      create: async (params) => {
        calls.push(structuredClone(params));
        const next = responses.shift();
        if (!next) throw new Error("no more scripted responses");
        return next;
      },
    },
  };
  return { client, calls };
}

function setup() {
  const game = new Game(newTableState({ id: "t", code: "ABCD", name: "T", missionId: DEFAULT_MISSION_ID, aiAvailable: true }), seededRng(9));
  const p = game.join("Nat", "player");
  game.handle(p.id, { type: "claimCharacter", characterId: "teyra-sjet" });
  game.handle(p.id, { type: "startGame" });
  return { game, player: game.state.players[0]! };
}

describe("Claude GM", () => {
  it("narrates, calls a test and narrates the result through tools", async () => {
    const { game, player } = setup();
    const { client, calls } = scripted([
      message("tool_use", [
        { type: "thinking", thinking: "...", signature: "sig" },
        { type: "tool_use", id: "tu1", name: "narrate", input: { speaker: "Narrator", tone: "gm", text: "The glyphs shimmer under your gloved hand." } },
        { type: "tool_use", id: "tu2", name: "call_for_test", input: { character_id: "teyra-sjet", attribute: "reason", skill: "exploration", difficulty: 1, reason: "Read the glyphs" } },
      ]),
      message("end_turn", [{ type: "text", text: "" }]),
      message("tool_use", [{ type: "tool_use", id: "tu3", name: "narrate", input: { speaker: "Narrator", tone: "gm", text: "The words resolve: a warning." } }]),
      message("end_turn", []),
    ]);
    const gm = new ClaudeGm(game, client, () => {});
    game.hooks.onSideRoll = (r) => gm.onSideRoll(r);

    gm.onPlayerAction(player, "I study the glyphs on the wall.");
    await gm.idle();
    expect(game.state.log.some((l) => l.type === "narration" && l.text.includes("glyphs shimmer"))).toBe(true);
    expect(game.state.pendingRoll?.origin).toBe("side");

    const second = calls[1]!;
    const toolResults = second.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(toolResults.map((r) => r.tool_use_id)).toEqual(["tu1", "tu2"]);
    expect(second.thinking).toEqual({ type: "adaptive" });
    expect(second.model).toBe(CLAUDE_MODEL);
  });

  it("reports API failures in the log without crashing", async () => {
    const { game, player } = setup();
    const client: MessagesClient = { messages: { create: async () => Promise.reject(new Error("boom")) } };
    const gm = new ClaudeGm(game, client, () => {});
    gm.onPlayerAction(player, "Hello?");
    await gm.idle();
    expect(game.state.log.at(-1)).toMatchObject({ type: "system" });
    expect(game.state.gmThinking).toBe(false);
  });

  it("pauses on a billing error, tells the table once, and resumes after the pause", async () => {
    const { game, player } = setup();
    let clock = 0;
    let calls = 0;
    let fail = true;
    const client: MessagesClient = {
      messages: {
        create: async () => {
          calls++;
          if (fail) throw apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.");
          return message("tool_use", [{ type: "tool_use", id: "n1", name: "narrate", input: { speaker: "Narrator", tone: "gm", text: "Back online." } }]);
        },
      },
    };
    const gm = new ClaudeGm(game, client, () => {}, () => clock);
    gm.onPlayerAction(player, "Hello?");
    await gm.idle();
    expect(game.state.gmNotice).toMatch(/out of API credit/);
    const notices = () => game.state.log.filter((l) => l.type === "system" && l.text.includes("API credit")).length;
    expect(notices()).toBe(1);

    gm.onPlayerAction(player, "Still there?");
    await gm.idle();
    expect(calls).toBe(1);
    expect(notices()).toBe(1);

    clock += 5 * 60_000;
    fail = false;
    const after = calls;
    gm.onPlayerAction(player, "Topped up!");
    await gm.idle();
    expect(calls).toBeGreaterThan(after);
    expect(game.state.gmNotice).toBeUndefined();
    expect(game.state.log.some((l) => l.type === "narration" && l.text === "Back online.")).toBe(true);
  });

  it("rolls back a failed turn's tool calls so the next request is well formed", async () => {
    const { game, player } = setup();
    const seen: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const responses: (Anthropic.Message | Error)[] = [
      message("tool_use", [{ type: "tool_use", id: "a", name: "narrate", input: { speaker: "Narrator", tone: "gm", text: "First." } }]),
      apiError(529, "overloaded_error", "Overloaded"),
      message("end_turn", [{ type: "text", text: "Second." }]),
    ];
    const client: MessagesClient = {
      messages: {
        create: async (params) => {
          seen.push(structuredClone(params));
          const next = responses.shift()!;
          if (next instanceof Error) throw next;
          return next;
        },
      },
    };
    const gm = new ClaudeGm(game, client, () => {});
    gm.onPlayerAction(player, "One");
    await gm.idle();
    expect(game.state.gmNotice).toBeUndefined();
    gm.onPlayerAction(player, "Two");
    await gm.idle();
    const last = seen.at(-1)!.messages;
    expect(last).toHaveLength(1);
    expect(last[0]!.role).toBe("user");
  });
});

describe("Claude GM items", () => {
  it("gives a find with give_item and refuses one nobody could carry", async () => {
    const { game, player } = setup();
    const { client, calls } = scripted([
      message("tool_use", [
        { type: "tool_use", id: "g1", name: "give_item", input: { character_id: "teyra-sjet", name: "Pair of old swords", origin: "Hanging in the derelict's shrine", uses: 0, size: "medium" } },
        { type: "tool_use", id: "g2", name: "give_item", input: { character_id: "teyra-sjet", name: "Crate of reactor parts", origin: "Hold", uses: 0, size: "large" } },
        { type: "tool_use", id: "g3", name: "give_item", input: { character_id: "teyra-sjet", name: "Second crate", origin: "Hold", uses: 0, size: "large" } },
      ]),
      message("end_turn", []),
    ]);
    const gm = new ClaudeGm(game, client, () => {});
    gm.onPlayerAction(player, "I take the swords off the wall, and the crates too.");
    await gm.idle();
    const names = game.inventoryOf("teyra-sjet").map((i) => i.name);
    expect(names).toContain("Pair of old swords");
    const results = calls[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results.find((r) => r.tool_use_id === "g3")).toMatchObject({ is_error: true });
    expect(String(results.find((r) => r.tool_use_id === "g3")!.content)).toMatch(/won't fit/);
    expect(JSON.stringify(calls[0]!.system)).toMatch(/hammerspace/i);
    expect(JSON.stringify(calls[0]!.messages)).toMatch(/Load \d+\/\d+/);
  });
});

function apiError(status: number, type: string, msg: string): Error {
  return Anthropic.APIError.generate(status, { type: "error", error: { type, message: msg } }, msg, new Headers());
}

describe("classifyApiError", () => {
  it("explains each failure in terms the host can act on", () => {
    expect(classifyApiError(apiError(400, "billing_error", "Insufficient credit"))).toMatchObject({ kind: "billing", pauseMs: 300_000 });
    expect(classifyApiError(apiError(400, "invalid_request_error", "Your credit balance is too low"))).toMatchObject({ kind: "billing" });
    expect(classifyApiError(apiError(401, "authentication_error", "invalid x-api-key"))).toMatchObject({ kind: "auth", pauseMs: Infinity });
    expect(classifyApiError(apiError(403, "permission_error", "nope"))).toMatchObject({ kind: "auth" });
    expect(classifyApiError(apiError(429, "rate_limit_error", "slow down"))).toMatchObject({ kind: "busy", pauseMs: 0 });
    expect(classifyApiError(apiError(529, "overloaded_error", "Overloaded"))).toMatchObject({ kind: "busy" });
    expect(classifyApiError(apiError(400, "invalid_request_error", "messages: bad"))).toMatchObject({ kind: "rejected", pauseMs: 0 });
    expect(classifyApiError(new Anthropic.APIConnectionError({ message: "ECONNREFUSED" }))).toMatchObject({ kind: "offline" });
    expect(classifyApiError(new Error("boom"))).toMatchObject({ kind: "unknown" });
  });
});
