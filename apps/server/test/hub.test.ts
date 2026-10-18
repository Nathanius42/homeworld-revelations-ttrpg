import { describe, expect, it } from "vitest";
import type { MessagesClient } from "../src/claude-gm.js";
import { Hub } from "../src/hub.js";
import { Store } from "../src/store.js";

/** Never called in these tests: the hub only needs to know a client exists. */
const fakeClient = { messages: { create: async () => ({}) } } as unknown as MessagesClient;

describe("Hub.setAi", () => {
  it("offers the Claude GM to live tables once a key arrives, and falls back to the Director when it goes", () => {
    const hub = new Hub(new Store(":memory:"));
    const table = hub.create("Test");
    expect(table.game.state.aiAvailable).toBe(false);
    expect(table.game.state.gmMode).toBe("director");

    hub.setAi(fakeClient);
    expect(table.game.state.aiAvailable).toBe(true);
    expect(hub.create("Later").game.state.gmMode).toBe("claude");

    table.game.state.gmMode = "claude";
    hub.setAi(undefined);
    expect(table.game.state.aiAvailable).toBe(false);
    expect(table.game.state.gmMode).toBe("director");
  });
});
