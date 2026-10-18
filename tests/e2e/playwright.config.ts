import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8790;
const ROOT = join(import.meta.dirname, "..", "..");

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
    env: { PORT: String(PORT), HWR_DATA: join(tmpdir(), `hwr-e2e-${Date.now()}.sqlite`), ANTHROPIC_API_KEY: "", HWR_PRIVATE_DIR: e2ePrivateDir() },
  },
});
