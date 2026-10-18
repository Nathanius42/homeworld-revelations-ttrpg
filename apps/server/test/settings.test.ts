import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Settings, keyHint, looksLikeClaudeKey } from "../src/settings.js";

const FAKE = "sk-ant-api03-" + "x".repeat(40) + "AbCd";

describe("Settings", () => {
  it("keeps the Claude key beside the saves, and removes the file when nothing is left", () => {
    const dir = mkdtempSync(join(tmpdir(), "hwr-settings-"));
    const settings = new Settings(join(dir, "hwr.sqlite"));
    expect(settings.claudeKey).toBeUndefined();
    settings.claudeKey = FAKE;
    expect(new Settings(join(dir, "hwr.sqlite")).claudeKey).toBe(FAKE);
    settings.claudeKey = undefined;
    expect(settings.claudeKey).toBeUndefined();
    expect(existsSync(join(dir, "config.json"))).toBe(false);
  });

  it("treats a damaged file as empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "hwr-settings-"));
    writeFileSync(join(dir, "config.json"), "{ not json");
    const settings = new Settings(join(dir, "hwr.sqlite"));
    expect(settings.claudeKey).toBeUndefined();
    settings.claudeKey = FAKE;
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8"))).toEqual({ claudeKey: FAKE });
  });
});

describe("keys", () => {
  it("recognises an Anthropic key and nothing else", () => {
    expect(looksLikeClaudeKey(FAKE)).toBe(true);
    expect(looksLikeClaudeKey("sk-proj-abc")).toBe(false);
    expect(looksLikeClaudeKey("sk-ant-short")).toBe(false);
    expect(looksLikeClaudeKey(FAKE + " ")).toBe(false);
  });

  it("shows only the last four characters", () => {
    expect(keyHint(FAKE)).toBe("…AbCd");
    expect(keyHint(undefined)).toBe("");
  });
});
