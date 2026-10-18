import { defineConfig } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8790;
const ROOT = join(import.meta.dirname, "..", "..");

/**
 * The server's save file, seeded with a finished campaign chapter (a scarred, wounded crew member,
 * a countdown and banked RU) for the campaign test. Done once: test workers load this config again
 * but inherit these variables, so they see the same file and seed.
 */
if (!process.env.HWR_E2E_DATA) {
  process.env.HWR_E2E_DATA = join(tmpdir(), `hwr-e2e-${Date.now()}.sqlite`);
  const out = execSync(`corepack pnpm --filter @hwr/server exec tsx test/seed-campaign.ts "${process.env.HWR_E2E_DATA}"`, { cwd: ROOT, encoding: "utf8" });
  process.env.HWR_E2E_CAMPAIGN = out.trim().split("\n").at(-1)!;
}

/**
 * The e2e server gets its own private folder: links to this PC's ships, music and sound, but never
 * the family portraits, private missions or kiith badges. The tests write the wiki's screenshots,
 * which are committed: real people's likenesses and licensed adaptations must never reach git.
 */
function e2ePrivateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hwr-e2e-private-"));
  for (const kind of ["ships", "music", "sfx"]) {
    const src = join(ROOT, "reference", kind);
    if (existsSync(src)) symlinkSync(src, join(dir, kind), "junction");
  }
  return dir;
}

export default defineConfig({
  testDir: ".",
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5000,
    // SwiftShader gives headless Chromium a software WebGL so the 3D dice render.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: "corepack pnpm --filter @hwr/web build && corepack pnpm --filter @hwr/server start",
    cwd: ROOT,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT), HWR_DATA: process.env.HWR_E2E_DATA, ANTHROPIC_API_KEY: "", HWR_PRIVATE_DIR: e2ePrivateDir() },
  },
});
