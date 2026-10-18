import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MISSIONS, type Mission } from "@hwr/content";
import { loadMissionPacks } from "../src/mission-packs.js";

const tiny = (id: string): Mission => ({
  id,
  title: "Tiny",
  blurb: "A test mission.",
  recommendedPlayers: "1 player",
  art: `/packs/test-pack/tiny.webp`,
  startNode: "start",
  nodes: {
    start: { id: "start", type: "narration", speaker: "Narrator", text: "Hello.", next: "end" },
    end: { id: "end", type: "end", text: "Goodbye.", ru: 1 },
  },
  npcs: {},
  gmNotes: "",
});

/** A packs folder: { packName: { file: body } }, each pack's files in its missions/ folder. */
function packs(contents: Record<string, Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), "hwr-packs-"));
  for (const [name, files] of Object.entries(contents)) {
    mkdirSync(join(root, name, "missions"), { recursive: true });
    for (const [file, body] of Object.entries(files)) writeFileSync(join(root, name, "missions", file), JSON.stringify(body));
  }
  return root;
}

describe("mission packs", () => {
  it("loads nothing when there's no packs folder", () => {
    expect(loadMissionPacks(join(tmpdir(), "hwr-no-packs-here"))).toEqual([]);
  });

  it("loads each pack's missions into MISSIONS and says where its art is served from", () => {
    const root = packs({ "test-pack": { "index.json": { missions: ["a.json"] }, "a.json": tiny("pack-a") } });
    const [pack] = loadMissionPacks(root);
    expect(pack).toMatchObject({ name: "test-pack", loaded: ["pack-a"], skipped: [], dir: join(root, "test-pack", "missions") });
    expect(MISSIONS["pack-a"]?.title).toBe("Tiny");
  });

  it("skips a broken mission with a reason and keeps the rest", () => {
    const broken = { ...tiny("pack-broken"), startNode: "nowhere" };
    const root = packs({ "test-pack": { "index.json": { missions: ["ok.json", "bad.json"] }, "ok.json": tiny("pack-ok"), "bad.json": broken } });
    const [pack] = loadMissionPacks(root);
    expect(pack!.loaded).toEqual(["pack-ok"]);
    expect(pack!.skipped[0]).toMatch(/^bad\.json: /);
  });
});
