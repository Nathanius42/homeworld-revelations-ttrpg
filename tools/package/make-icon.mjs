/**
 * Renders the Kushan emblem (apps/web/public/kushan.svg) into the launcher's icon and the app
 * windows' icon, using Playwright's Chromium from tests/e2e:
 *
 *   node tools/package/make-icon.mjs
 *
 * Writes tools/package/launcher/icon-<size>.png; pack-icon.py then joins them into hwr.ico.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = createRequire(join(root, "tests", "e2e", "package.json"))("@playwright/test");
const svg = readFileSync(join(root, "apps", "web", "public", "kushan.svg"), "utf8");
const out = join(root, "tools", "package", "launcher");

const browser = await chromium.launch();
const page = await browser.newPage();
// Each size is drawn at its own resolution so the small ones stay crisp.
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(out, `icon-${size}.png`), omitBackground: true });
}
await browser.close();
console.log("icons written to", out);
