import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MISSIONS, type Mission } from "@hwr/content";
import { hasPrivate, privateDir } from "../src/private-assets.js";
import { newTableState } from "../src/engine.js";
import { loadPrivateMissions, readPrivateMissions } from "../src/private-missions.js";

const tiny = (id: string): Mission => ({
  id,
  title: "Tiny",
  blurb: "A test mission.",
  recommendedPlayers: "1 player",
  art: "/local/missions/tiny.webp",
  startNode: "start",
  nodes: {
    start: { id: "start", type: "narration", speaker: "Narrator", text: "Hello.", next: "end" },
    end: { id: "end", type: "end", text: "Goodbye.", ru: 1 },
  },
  npcs: {},
  gmNotes: "",
});

function folder(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "hwr-missions-"));
  mkdirSync(join(root, "missions"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, "missions", name), typeof body === "string" ? body : JSON.stringify(body));
  return root;
}

describe("private missions", () => {
  it("loads nothing when the folder is missing", () => {
    expect(readPrivateMissions(mkdtempSync(join(tmpdir(), "hwr-none-")))).toEqual({ missions: [], skipped: [] });
  });

  it("loads valid missions into MISSIONS", () => {
    const root = folder({ "index.json": { missions: ["tiny.json"] }, "tiny.json": tiny("tiny-test") });
    expect(loadPrivateMissions(root)).toEqual({ loaded: ["tiny-test"], skipped: [] });
    expect(MISSIONS["tiny-test"]?.title).toBe("Tiny");
    delete MISSIONS["tiny-test"];
  });

  it("hands a mission's music set to the table", () => {
    const root = folder({ "index.json": { missions: ["tiny.json"] }, "tiny.json": { ...tiny("tiny-desert"), music: "kharak" } });
    loadPrivateMissions(root);
    expect(newTableState({ id: "t", code: "A", name: "T", missionId: "tiny-desert", aiAvailable: false }).missionMusic).toBe("kharak");
    delete MISSIONS["tiny-desert"];
  });

  it("skips broken graphs, bad JSON and built-in ids, with a reason", () => {
    const broken = tiny("broken");
    broken.nodes.start = { id: "start", type: "narration", speaker: "Narrator", text: "Hello.", next: "nowhere" };
    const root = folder({
      "index.json": { missions: ["broken.json", "bad.json", "clash.json", "missing.json"] },
      "broken.json": broken,
      "bad.json": "{ not json",
      "clash.json": tiny("silent-beacon"),
    });
    const { missions, skipped } = readPrivateMissions(root);
    expect(missions).toEqual([]);
    expect(skipped).toHaveLength(4);
    expect(skipped[0]).toMatch(/broken\.json: .*missing node nowhere/);
    expect(skipped[2]).toMatch(/already a built-in/);
  });

  // Only on a PC with the private folder: every mission there must load, and its art must exist.
  it.skipIf(!hasPrivate("missions"))("loads every mission in this PC's private folder", () => {
    const { missions, skipped } = readPrivateMissions();
    expect(skipped).toEqual([]);
    expect(missions.length).toBeGreaterThan(0);
    const local = (url?: string) => (url?.startsWith("/local/missions/") ? [url] : []);
    for (const m of missions) {
      const art = [m.art, ...Object.values(m.nodes).map((n) => n.scene?.art), ...Object.values(m.npcs).map((n) => n.portrait)].flatMap(local);
      for (const url of art) expect(existsSync(join(privateDir("missions"), url.slice("/local/missions/".length))), url).toBe(true);
    }
  });
});
