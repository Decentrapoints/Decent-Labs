import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app.mjs";

const d = mkdtempSync(join(tmpdir(), "dls-browser-")),
  output = resolve("test-results");
mkdirSync(output, { recursive: true });
const app = await createApp({ dataDir: d, bridgeDir: join(d, "bridge") });
app.store.addUser("browser-owner", "browser-test-password-123");
await app.listen({ host: "127.0.0.1", port: 0 });
const url = `http://127.0.0.1:${app.server.address().port}`;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : existsSync(chrome)
      ? { executablePath: chrome }
      : {}),
});
const errors = [],
  page = await browser.newPage({ viewport: { width: 1540, height: 1020 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (process.env.DLS_BROWSER_DEBUG) console.log(m.type(), m.text());
});
page.on("requestfailed", (r) => {
  if (process.env.DLS_BROWSER_DEBUG)
    console.log("Request failed", r.url(), r.failure());
});
const nav = async (label) =>
  page
    .locator(".sidebar nav")
    .getByRole("button", { name: new RegExp("^" + label) })
    .click();
const screenshot = async (name) =>
  page.screenshot({ path: join(output, name + ".png"), fullPage: true });
const overflow = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `Overflow at ${(await page.viewportSize()).width}px`,
  );
try {
  await page.goto(url);
  await page.getByLabel("Username", { exact: true }).fill("browser-owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await page
    .getByRole("heading", { name: "Keep the good ideas close." })
    .waitFor();
  await screenshot("tabs-songbook");
  await page
    .getByRole("button", { name: "Favorite Glass", exact: true })
    .click();
  await page
    .locator(".pinned-list")
    .getByRole("button", { name: "Glass" })
    .waitFor();
  await page.getByRole("button", { name: "Glass", exact: true }).last().click();
  await page
    .getByRole("button", { name: "Play score", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Play score"]')?.disabled === false,
    { timeout: 30000 },
  );
  await page.locator(".notation svg").first().waitFor();
  await screenshot("tabs-score");
  await page.getByRole("button", { name: "Play score", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause playback", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  await page.getByLabel("Score tempo", { exact: true }).fill("88");
  await page
    .getByRole("button", { name: "Review tempo change", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Review action" }).waitFor();
  await page.getByRole("button", { name: "Apply reviewed action" }).click();
  await page
    .locator(".score-title-row .revision")
    .filter({ hasText: "r2" })
    .waitFor();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Score history" })
    .getByRole("button", { name: "Restore" })
    .last()
    .click();
  await page
    .locator(".score-title-row .revision")
    .filter({ hasText: "r3" })
    .waitFor();
  await page
    .locator(".notation svg text")
    .filter({ hasText: /^0$/ })
    .first()
    .click();
  await page.getByLabel("Fret", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Review note edit" }).click();
  await page.getByRole("button", { name: "Apply reviewed action" }).click();
  await page
    .locator(".score-title-row .revision")
    .filter({ hasText: "r4" })
    .waitFor();
  await page
    .getByPlaceholder("A fingering idea, a tricky transition…")
    .fill("Keep the first phrase relaxed.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await nav("Practice");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByRole("button", { name: "Save session" }).click();
  await page
    .locator(".practice-history")
    .getByText("Glass", { exact: true })
    .waitFor();
  await screenshot("tabs-practice");
  await nav("Imports");
  await page.locator(".import-drop input[type=file]").setInputFiles({
    name: "original.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(
      '\\title "Fresh idea" \\tempo 84 . 0.6.4 2.5.4 4.4.4 2.5.4',
    ),
  });
  await page.getByRole("heading", { name: "Fresh idea" }).waitFor();
  await page.getByRole("button", { name: "Add to songbook" }).click();
  await page
    .locator(".score-title-row")
    .getByRole("heading", { name: "Fresh idea" })
    .waitFor();
  await page
    .getByRole("button", { name: "Plan a 15-minute practice session" })
    .click();
  await page
    .locator(".advice")
    .getByText("LOCAL PLANNING TEMPLATE", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send to Studio" }).click();
  await page
    .locator(".handoff-panel")
    .getByRole("heading", { name: "Fresh idea" })
    .waitFor();
  assert.equal(
    await page.locator(".advice").count(),
    0,
    "Tabs advice must not appear as current Studio advice.",
  );
  const midiDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download MIDI" }).first().click(),
  ]);
  assert.ok(midiDownload[0].suggestedFilename().endsWith(".mid"));
  await page
    .getByRole("heading", { name: "A little more headroom." })
    .waitFor();
  await screenshot("studio");
  const wav = Buffer.alloc(44 + 16000);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(16000, 40);
  await page
    .locator(".audio-analysis input[type=file]")
    .setInputFiles({ name: "silence.wav", mimeType: "audio/wav", buffer: wav });
  await page
    .locator(".audio-results")
    .getByRole("heading", { name: "silence.wav" })
    .waitFor();
  await nav("Connections");
  await page
    .getByRole("heading", { name: "Everything has a place." })
    .waitFor();
  await screenshot("connections");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await screenshot("connections-light");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  for (const width of [1024, 768, 480, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await overflow();
    await nav("Songbook");
    await overflow();
    await screenshot(`studio-${width}`);
    await page
      .locator(".app-switch")
      .getByRole("button", { name: "Tabs", exact: true })
      .click();
    await nav("Songbook");
    await overflow();
    await nav("Score editor");
    await page.locator(".notation svg").first().waitFor();
    await overflow();
    await screenshot(`tabs-${width}`);
    await page
      .locator(".app-switch")
      .getByRole("button", { name: "Studio", exact: true })
      .click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: sign-in, persistent favorites, notation, audio playback, reviewed tempo, restore, practice, imports, Satsu templates, both apps, themes, and 320–1540px layouts.",
  );
} catch (e) {
  await screenshot("failure");
  console.error("Browser errors:", errors);
  if (process.env.DLS_BROWSER_DEBUG)
    console.log(
      await page.evaluate(() => ({
        alpha: typeof window.alphaTab,
        scripts: [...document.scripts].map((s) => s.src),
        notation: document.querySelector(".notation")?.innerHTML.slice(0, 500),
        resources: performance.getEntriesByType("resource").map((e) => e.name),
      })),
    );
  throw e;
} finally {
  await browser.close();
  await app.close();
  rmSync(d, { recursive: true, force: true });
}
