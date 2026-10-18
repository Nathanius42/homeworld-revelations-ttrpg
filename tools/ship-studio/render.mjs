/**
 * Renders the shots listed in shots.json to reference/renders/<name>.png (transparent background).
 * Start the studio first (`corepack pnpm --filter @hwr/ship-studio dev`), then:
 *   node tools/ship-studio/render.mjs [--shots <file>] [name ...]
 * A private mission keeps its own shot list (e.g. reference/missions/shots.json) and passes it with --shots.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const out = join(here, "..", "..", "reference", "renders");
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shotsFile = shotsAt >= 0 ? resolve(args.splice(shotsAt, 2)[1]) : join(here, "shots.json");
const shots = JSON.parse(readFileSync(shotsFile, "utf8"));
const only = args;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const shot of shots.filter((s) => !only.length || only.includes(s.name))) {
  const { name, w = 1536, h = 640, ...params } = shot;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const started = Date.now();
  await page.goto(`http://localhost:5180/?${query}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300_000 });
  const error = await page.evaluate(() => window.__error);
  if (error) console.log("FAILED", name, error);
  else {
    await page.screenshot({ path: join(out, `${name}.png`), omitBackground: true });
    console.log(name, `${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  await page.close();
}
await browser.close();
