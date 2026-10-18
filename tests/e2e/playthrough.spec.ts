import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Screenshots land in docs/images so the wiki can show the real UI. */
const SHOTS = join(import.meta.dirname, "..", "..", "docs", "images", "screens");
mkdirSync(SHOTS, { recursive: true });
// Software WebGL makes screenshots slow, so give them longer than the default action timeout.
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), timeout: 30_000 });

/** Every browser context a test opens, closed afterwards so later tests aren't slowed down. */
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

const CREW = ["Saiyuun Paktu", "Kesh Soban", "Teyra S'jet"];

async function seat(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  await context.addInitScript((n) => localStorage.setItem("hwr.name", n), name);
  return context.newPage();
}

/** Replaces the browser's speech engine with a recorder, so tests can see what would be read aloud. */
async function recordSpeech(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    class FakeUtterance {
      text: string;
      voice = null;
      lang = "";
      pitch = 1;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: (u: FakeUtterance) => {
          spoken.push(u.text);
          setTimeout(() => u.onend?.(), 10);
        },
        cancel: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
      },
    });
  });
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.slice());

async function clickIfVisible(page: Page, locator: ReturnType<Page["locator"]>): Promise<boolean> {
  const target = locator.first();
  if ((await target.count()) === 0 || !(await target.isVisible()) || !(await target.isEnabled({ timeout: 1000 }).catch(() => false))) return false;
  // The server can replace the control between our check and the click; that's fine, we'll look again.
  return target.click({ timeout: 3000 }).then(
    () => true,
    () => false,
  );
}

/**
 * Plays whatever the table puts in front of the crew until the debrief: continue, vote,
 * assist, roll, accept, attack. `shots` names the screenshots to take the first time each
 * situation comes up (omit to take none).
 */
async function playToDebrief(pages: Page[], shots: boolean | string[] = false): Promise<void> {
  const host = pages[0]!;
  const taken = new Set<string>();
  const once = async (name: string, page: Page) => {
    if (!shots || (Array.isArray(shots) && !shots.includes(name)) || taken.has(name)) return;
    taken.add(name);
    // The space battle loads 3D ship models; give them a moment.
    await page.waitForTimeout(name === "17-space-battle" ? 6000 : 400);
    await shot(page, name);
  };
  // Long missions with few players (Cold Harbour's ship battle with two) can need several hundred
  // steps, including waits for the dice to settle; the test's own time limit still applies.
  for (let step = 0; step < 1000; step++) {
    if (await host.locator(".end-card").isVisible()) break;
    let acted = false;
    // The rest of the crew lends a hand on any waiting test before someone rolls it.
    for (const page of pages.slice(1)) {
      if (await clickIfVisible(page, page.getByRole("button", { name: "Assist (+1d20)" }))) await page.waitForTimeout(150);
    }
    for (const page of pages) {
      // Continue narration.
      if (await clickIfVisible(page, page.getByRole("button", { name: "Next ▸" }))) {
        acted = true;
        break;
      }
      // Vote: everyone picks the first option they haven't voted for yet.
      const choice = page.locator(".choice-option:not(.voted)");
      if ((await page.locator(".choice-option").count()) > 0 && (await page.locator(".choice-option.voted").count()) === 0) {
        await once("04-vote", page);
        if (await clickIfVisible(page, choice)) {
          acted = true;
          continue;
        }
      }
      // Ship battle: each seat works a different station, falling back to rallying the crew.
      const stations = page.locator(".stations");
      if ((await stations.count()) > 0 && (await stations.isVisible())) {
        await once("17-space-battle", page);
        const plan = ["Fire", "Scan for weakness", "Jam targeting", "Fire", "Evasive action", "Rally the crew"];
        const seatIndex = pages.indexOf(page);
        const wanted = page.locator(".station", { hasText: plan[seatIndex % plan.length]! });
        if (!(await clickIfVisible(page, wanted)) && !(await clickIfVisible(page, page.locator(".station", { hasText: "Rally the crew" })))) continue;
        acted = true;
        break;
      }
      // Combat: attack the first target standing.
      const attack = page.getByRole("button", { name: /^Attack/ });
      if ((await attack.count()) > 0 && (await attack.isVisible())) {
        await once("07-combat", page);
        await page.locator(".npc-card:not(.down)").first().click({ timeout: 3000 }).catch(() => {});
        if (!(await clickIfVisible(page, attack))) continue;
        acted = true;
        break;
      }
      // Roll builder: buy one die when Momentum allows, then roll.
      const roll = page.getByRole("button", { name: /^Roll \dd20$/ });
      if ((await roll.count()) > 0 && (await roll.isVisible())) {
        // Give the rest of the crew a moment to offer help before rolling.
        for (const other of pages.filter((p) => p !== page)) {
          await clickIfVisible(other, other.getByRole("button", { name: "Assist (+1d20)" }));
        }
        await page.locator(".assist-bar", { hasText: "Assisting" }).waitFor({ timeout: 2000 }).catch(() => {});
        if ((await page.locator(".assist-bar", { hasText: "Assisting" }).count()) > 0) await once("05-roll-builder", page);
        if (!(await clickIfVisible(page, roll))) continue;
        acted = true;
        break;
      }
      // Accept the result once the dice settle.
      const accept = page.locator(".dice-result").getByRole("button", { name: /^(Continue|Roll damage|Roll Work)$/ });
      if ((await accept.count()) > 0 && (await accept.isVisible())) {
        if ((await page.locator(".dice-result", { hasText: "help from" }).count()) > 0) await once("06-dice", page);
        if (!(await clickIfVisible(page, accept))) continue;
        acted = true;
        break;
      }
    }
    if (!acted) await host.waitForTimeout(300);
  }

}

// The screenshots are committed to the wiki, so the server under test must never have the family portraits or private missions.
test.beforeAll(async ({ request }) => {
  const health = await (await request.get("/api/health")).json();
  if (health.private?.portraits) throw new Error("The e2e server can see the family portraits; screenshots would capture real faces.");
  if (health.private?.missions) throw new Error("The e2e server can see the private missions; screenshots would capture licensed adaptations.");
});

test("title screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Homeworld" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "01-title");
});

test("three players play The Silent Beacon to the debrief", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Kharsaan's Promise" } })).json()) as { code: string };
  const pages = await Promise.all(["Nathan", "Ash", "Robin"].map((n) => seat(browser, n)));

  for (const [i, page] of pages.entries()) {
    await page.goto(`/t/${code}`);
    await page.locator(".crew-card", { hasText: CREW[i]! }).click();
    await expect(page.locator(".crew-card.mine")).toHaveCount(1);
  }
  const host = pages[0]!;
  await host.waitForTimeout(600);
  await shot(host, "02-lobby");
  await host.getByRole("button", { name: "Begin mission" }).click();
  await expect(host.locator(".panorama")).toBeVisible();
  await host.waitForTimeout(1500);
  await shot(host, "03-briefing");

  await playToDebrief(pages, true);

  await expect(host.locator(".end-card")).toBeVisible();
  await host.waitForTimeout(800);
  await shot(host, "08-debrief");
  await host.locator(".party-card").first().click();
  // The personnel file lists the character's kit with sizes and their load against capacity.
  await expect(host.locator(".inventory .item").first()).toBeVisible();
  await expect(host.getByText(/load \d+ of \d+/)).toBeVisible();
  await host.waitForTimeout(700); // let the file finish fading in
  await expect(host.locator(".kiith-badge")).toHaveCount(0); // the game's badge art stays out of the wiki
  await shot(host, "09-personnel-file");
});

test("phone layout has no sideways scrolling", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Pocket table" } })).json()) as { code: string };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  contexts.push(context);
  await context.addInitScript(() => localStorage.setItem("hwr.name", "Phone"));
  const page = await context.newPage();
  const noSideScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await page.goto("/");
  await noSideScroll();
  await shot(page, "10-phone-title");
  await page.goto(`/t/${code}`);
  await page.locator(".crew-card").first().click();
  await noSideScroll();
  await shot(page, "11-phone-lobby");
  await page.getByRole("button", { name: "Begin mission" }).click();
  // Continue through the briefing until the first vote appears.
  await expect(async () => {
    await clickIfVisible(page, page.getByRole("button", { name: "Next ▸" }));
    await expect(page.locator(".choice-option").first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.locator(".choice-option").first().click();
  await expect(page.getByRole("button", { name: /^Roll \dd20$/ })).toBeVisible();
  await noSideScroll();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "12-phone-roll.png"), fullPage: true, timeout: 30_000 });
});

test("fleet archive shows the real ship models when they're on this PC", async ({ page, request }) => {
  const health = (await (await request.get("/api/health")).json()) as { localShips?: boolean };
  test.skip(!health.localShips, "the licensed ship models aren't on this machine");
  await page.goto("/");
  await page.getByRole("button", { name: "Fleet archive" }).click();
  await expect(page.locator(".fleet-loading")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  // A direct render of licensed models: kept out of the wiki, in git-ignored test output.
  await page.screenshot({ path: join(import.meta.dirname, "test-results", "fleet-mothership.png"), timeout: 30_000 });
  await page.locator(".fleet-item", { hasText: "Kharsaan's Promise" }).click();
  await expect(page.locator(".fleet-loading")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(import.meta.dirname, "test-results", "fleet-corvette.png"), timeout: 30_000 });
});

test("a player who drops out rejoins their seat and character", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Flaky link" } })).json()) as { code: string };
  const host = await seat(browser, "Host");
  const guest = await seat(browser, "Guest");
  await host.goto(`/t/${code}`);
  await host.locator(".crew-card", { hasText: "Kesh Soban" }).click();
  await guest.goto(`/t/${code}`);
  await guest.locator(".crew-card", { hasText: "Mira Naabal" }).click();
  await host.getByRole("button", { name: "Begin mission" }).click();
  await expect(guest.locator(".panorama")).toBeVisible();

  // The guest's tab closes and comes back: same seat, same character, game still running.
  await guest.reload();
  await expect(guest.locator(".party-card.mine")).toContainText("Mira Naabal");
  await expect(host.locator(".party-card", { hasText: "Mira Naabal" }).locator(".dot.on")).toBeVisible();
  const seats = await host.evaluate(() => document.querySelectorAll(".party-card").length);
  expect(seats).toBe(2);
});

test("two players pick Cold Harbour in the lobby and play it to the debrief", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Second watch" } })).json()) as { code: string };
  const pages = await Promise.all(["Sam", "Kit"].map((n) => seat(browser, n)));
  for (const [i, page] of pages.entries()) {
    await page.goto(`/t/${code}`);
    await page.locator(".crew-card").nth(i + 2).click();
  }
  const host = pages[0]!;
  await host.locator(".mission-card", { hasText: "Cold Harbour" }).click();
  await expect(pages[1]!.locator(".mission-card.selected")).toContainText("Cold Harbour");
  await expect(host.locator(".mission-banner h2")).toHaveText("Cold Harbour");
  await host.waitForTimeout(500);
  await shot(host, "13-mission-picker");
  await host.getByRole("button", { name: "Begin mission" }).click();
  await playToDebrief(pages, ["17-space-battle"]);
  await expect(host.locator(".end-card")).toBeVisible();
  await expect(host.locator(".panorama h2")).toHaveText(/Forty Lives|Home in Pieces/);

  // The campaign carries on: both phones move to the next table with their crew, and the story so far.
  const sheetName = (await pages[1]!.locator(".crew-card.mine .name, .crew-card.mine h3").first().textContent().catch(() => null)) ?? "";
  await host.getByRole("button", { name: "Continue the campaign" }).click();
  for (const page of pages) {
    await expect(page).not.toHaveURL(new RegExp(`/t/${code}$`));
    await expect(page.getByRole("region", { name: "Before you begin" })).toContainText("The story so far");
    await expect(page.getByRole("region", { name: "Before you begin" })).toContainText("Cold Harbour.");
  }
  const between = pages[1]!.getByRole("region", { name: "Between missions" });
  await expect(between).toContainText("'s advance");
  if (sheetName) await expect(between).toContainText(sheetName.trim().split(" ")[0]!);
  await between.scrollIntoViewIfNeeded();
  await shot(pages[1]!, "20-between-missions");
  await between.locator(".chip").filter({ hasNotText: /max/ }).first().click();
  await expect(between).toContainText("No advance to spend");
});

test("a player designs their own crew member in the lobby", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "New blood" } })).json()) as { code: string };
  const page = await seat(browser, "Designer");
  await page.goto(`/t/${code}`);
  await page.getByRole("button", { name: /Design your own/ }).click();
  await page.locator("#dn").fill("Arin Kaalel");
  await page.locator("#dk").selectOption("Kaalel");
  await page.locator("#dr").selectOption("Pilot");
  await page.locator(".portrait-pick").nth(2).click();
  // Move a point of Will into Coordination, keeping the total at 54.
  const row = (label: string) => page.locator(".score-row", { hasText: label });
  await row("Will").getByRole("button", { name: "Lower" }).click();
  await row("Coordination").getByRole("button", { name: "Raise" }).click();
  for (const chip of await page.locator(".chip").all().then((c) => c.slice(0, 3))) await chip.click();
  await page.locator("#da").fill("Flies first, asks later");
  await page.waitForTimeout(500);
  await expect(page.locator(".kiith-badge")).toHaveCount(0);
  await shot(page, "14-character-designer");
  await page.getByRole("button", { name: "Sign on" }).click();
  await expect(page.locator(".crew-card.mine")).toContainText("Arin Kaalel");
  await expect(page.locator(".crew-card.mine")).toContainText("Pilot");
});

test("the TV view follows the game without taking a seat", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Couch fleet" } })).json()) as { code: string };
  const tvContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  contexts.push(tvContext);
  await recordSpeech(tvContext);
  const tv = await tvContext.newPage();
  await tv.goto(`/t/${code}/tv`);
  await expect(tv.locator(".tv-code")).toHaveText(code);

  // Browsing at localhost, the QR code must still point other devices at a LAN address.
  const { addresses } = (await (await request.get("/api/host-info")).json()) as { addresses: { address: string }[] };
  const qr = tv.locator(".tv-join-card .qr");
  await expect(qr).toBeVisible();
  if (addresses[0]) await expect(qr).toHaveAttribute("data-url", `http://${addresses[0].address}:${new URL(tv.url()).port}/t/${code}`);
  await expect(tv.locator(".tv-join-card")).not.toContainText("localhost");

  const player = await seat(browser, "Couch");
  await player.goto(`/t/${code}`);
  await player.locator(".crew-card", { hasText: "Jaal Manaan" }).click();
  await expect(tv.locator(".tv-aboard-face")).toHaveCount(1);
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: join(SHOTS, "15-tv-lobby.png"), timeout: 30_000 });

  await player.getByRole("button", { name: "Begin mission" }).click();
  await expect(tv.locator(".tv .panorama")).toBeVisible();
  // Both screens say what the game is waiting for.
  await expect(tv.locator(".turn-banner")).toBeVisible();
  await expect(player.locator(".turn-banner")).toBeVisible();
  // The TV reads narration aloud by default; the player's phone stays quiet.
  await expect.poll(async () => (await spoken(tv)).length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect((await spoken(tv)).join(" ")).not.toMatch(/[*_`]/);
  await expect(player.getByRole("button", { name: "Voice off" })).toBeVisible();
  await expect(tv.locator(".tv-crew-card")).toHaveCount(1);
  // The TV is a spectator: it never claims a character or gets controls.
  await expect(tv.getByRole("button", { name: "Next ▸" })).toHaveCount(0);
  await expect(async () => {
    await clickIfVisible(player, player.getByRole("button", { name: "Next ▸" }));
    await expect(tv.locator(".choice-option").first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await tv.waitForTimeout(1200);
  await tv.screenshot({ path: join(SHOTS, "16-tv-table.png"), timeout: 30_000 });
});

test("plays the lobby's mood music when this PC has the soundtrack", async ({ browser, request }) => {
  const music = await request.get("/api/music");
  test.skip(!music.ok(), "No private music folder on this machine");
  const { code } = (await (await request.post("/api/tables", { data: { name: "Music check" } })).json()) as { code: string };
  const page = await seat(browser, "Listener");
  await page.addInitScript(() => localStorage.setItem("hwr.music", "1"));
  const track = page.waitForRequest((r) => /\/local\/music\/(lobby|briefing)\//.test(decodeURIComponent(r.url())), { timeout: 15_000 });
  await page.goto(`/t/${code}`);
  await page.locator(".crew-card").first().click(); // the first click lets the browser play audio
  await track;
  await expect(page.getByRole("button", { name: "Music on" })).toBeVisible();
});

test("the host console shows the join code, the tables and who has connected", async ({ browser, page }) => {
  await page.goto("/host");
  await expect(page.getByRole("heading", { name: "Host console" })).toBeVisible();
  await page.locator("#hn").fill("Console check");
  await page.getByRole("button", { name: "Start a table" }).click();
  // Wait for the console to switch to the new table before reading its code.
  await expect(page.locator(".host-join .panel-title")).toContainText("Console check");
  const code = (await page.locator(".host-join .tv-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  await expect(page.locator(".host-join .qr")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open TV view" })).toBeVisible();

  // The TV page follows the table started here, and shows new players what they're in for.
  const tvPage = await page.context().newPage();
  await tvPage.goto("/tv");
  await expect(tvPage.locator(".tv-code")).toHaveText(code);
  await expect(tvPage.getByRole("region", { name: "Before you begin" })).toContainText("How a turn works");
  await tvPage.close();

  const player = await seat(browser, "Robin");
  await player.goto(`/t/${code}`);
  await expect(page.locator(".panel-title", { hasText: "Connected" }).locator("..")).toContainText(`Robin · player at ${code}`, { timeout: 10_000 });
  await shot(page, "18-host-console");

  // Network help opens on request with the firewall and hotspot steps.
  await page.getByRole("button", { name: "Network help" }).click();
  const help = page.getByRole("region", { name: "Network help" });
  await expect(help).toContainText("Windows Firewall");
  await expect(help).toContainText("Mobile hotspot");
  await expect(help).toContainText("/api/health");
  await shot(page, "19-network-help");
  await help.getByRole("button", { name: "Hide" }).click();
  await expect(help).toBeHidden();

  // The Claude key is pasted here; a paste of the wrong thing is refused before anything is sent to Anthropic.
  const claude = page.getByRole("region", { name: "Claude GM" });
  await expect(claude).toContainText("Off: the Director runs the game");
  await claude.getByLabel("Claude API key").fill("not-a-key");
  await claude.getByRole("button", { name: "Check and save" }).click();
  await expect(claude).toContainText("doesn't look like a Claude API key");
});

/** A tenth of a second of silence as a WAV file, standing in for a Kokoro line. */
test("a saved campaign reopens from the host console, with its scars, wounds, countdown and refits", async ({ browser, page }) => {
  // Seeded by playwright.config.ts: a finished Cold Harbour chapter in which one crew member went down.
  const seed = JSON.parse(process.env.HWR_E2E_CAMPAIGN!) as { campaignName: string; playerId: string; characterName: string; scar: string };
  await page.goto("/host");
  const row = page.getByRole("region", { name: "Campaigns" }).locator(".host-campaign", { hasText: seed.campaignName });
  await expect(row).toContainText("1 chapter, last Cold Harbour");
  await row.getByRole("button", { name: "Start the next chapter" }).click();
  await expect(page.locator(".host-join .panel-title")).toContainText(seed.campaignName);
  const code = (await page.locator(".host-join .tv-code").textContent())!.trim();
  // The new chapter is now the campaign's latest table, so the list offers to resume it.
  await expect(row.getByRole("button", { name: /^Resume / })).toBeVisible();

  // The scarred crew member's player comes back to the same seat on the new chapter.
  const context = await browser.newContext();
  contexts.push(context);
  await context.addInitScript(
    ([key, id]) => {
      localStorage.setItem(key!, id!);
      localStorage.setItem("hwr.name", "Sam");
    },
    [`hwr.player.${code}`, seed.playerId],
  );
  const player = await context.newPage();
  await player.goto(`/t/${code}`);
  const between = player.getByRole("region", { name: "Between missions" });
  await expect(between.locator(".panel-title")).toContainText("10 RU banked");
  await expect(between).toContainText("Dreadnought awakening");
  await expect(between).toContainText(seed.scar);
  await expect(between).toContainText(`${seed.characterName} is still wounded`);
  await between.scrollIntoViewIfNeeded();
  await between.screenshot({ path: join(SHOTS, "21-campaign-scars.png"), timeout: 30_000 });

  await between.getByRole("button", { name: /Treat the wound/ }).click();
  await expect(between).not.toContainText("is still wounded");
  const armour = between.locator("li", { hasText: "Ablative armour plating" });
  await armour.getByRole("button", { name: "4 RU" }).click();
  await expect(armour.getByRole("button", { name: "Fitted" })).toBeDisabled();
  await expect(between.locator(".panel-title")).toContainText("5 RU banked");
});

function silentWav(): Buffer {
  const samples = 2400;
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

test("the TV speaks with Kokoro voices when the game PC has them", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Kokoro check" } })).json()) as { code: string };
  const tvContext = await browser.newContext();
  contexts.push(tvContext);
  await recordSpeech(tvContext);
  // Pretend this PC has the model, and answer each line with a short silence.
  const asked: { text: string; voice: string }[] = [];
  await tvContext.route("**/api/health", async (route) => {
    const health = await (await route.fetch()).json();
    await route.fulfill({ json: { ...health, private: { ...health.private, tts: true } } });
  });
  await tvContext.route("**/api/tts", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ body: silentWav(), contentType: "audio/wav" });
  });
  const tv = await tvContext.newPage();
  await tv.goto(`/t/${code}/tv`);
  await expect(tv.locator(".tv-code")).toHaveText(code);

  const player = await seat(browser, "Kokoro");
  await player.goto(`/t/${code}`);
  await player.locator(".crew-card").first().click();
  await player.getByRole("button", { name: "Begin mission" }).click();
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  // Fleet Command opens The Silent Beacon in Emma's voice; nothing goes to the browser's own voices.
  expect(asked[0]!.voice).toBe("bf_emma");
  expect(asked.every((a) => a.text.length <= 600)).toBe(true);
  expect(await spoken(tv)).toEqual([]);
});

test("a player rolls real dice at the table and types them in", async ({ browser, request }) => {
  const { code } = (await (await request.post("/api/tables", { data: { name: "Dice night" } })).json()) as { code: string };
  const page = await seat(browser, "Roller");
  await page.addInitScript(() => localStorage.setItem("hwr.realdice", "1"));
  await page.goto(`/t/${code}`);
  await page.locator(".crew-card").first().click();
  await page.getByRole("button", { name: "Begin mission" }).click();
  // Move the story on until the first test.
  await expect(async () => {
    await clickIfVisible(page, page.getByRole("button", { name: "Next ▸" }));
    await clickIfVisible(page, page.locator(".choice-option:not(.voted)"));
    await expect(page.getByRole("button", { name: "Enter dice" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("Die 1").fill("1");
  await page.getByLabel("Die 2").fill("20");
  await page.getByRole("button", { name: "Enter dice" }).click();
  // The dice settle showing what was rolled; once accepted, the log says they were real.
  await page.locator(".dice-result").getByRole("button", { name: /^(Continue|Roll damage|Roll Work)$/ }).click();
  await expect(page.locator(".log")).toContainText("real dice");
});

