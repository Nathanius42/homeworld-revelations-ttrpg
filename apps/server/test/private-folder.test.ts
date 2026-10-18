import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privateStatus } from "../src/private-assets.js";

const repo = join(import.meta.dirname, "..", "..", "..");

describe("private folder", () => {
  it("never has anything committed", () => {
    const tracked = execFileSync("git", ["ls-files", "--", "reference", "*.pdf", "*.mp3"], { cwd: repo, encoding: "utf8" }).trim();
    expect(tracked).toBe("");
  });

  it("reports only the kinds that are present", () => {
    const root = mkdtempSync(join(tmpdir(), "hwr-private-"));
    expect(privateStatus(root)).toEqual({ ships: false, portraits: false, music: false, sfx: false, missions: false, tts: false, badges: false });
    mkdirSync(join(root, "music"));
    writeFileSync(join(root, "music", "playlist.json"), "{}");
    expect(privateStatus(root)).toMatchObject({ music: true, ships: false });
  });
});
