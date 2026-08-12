const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8765";
const OUTPUT = "/tmp/workflow-site-test";
fs.mkdirSync(OUTPUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE_URL}/#stage-5-sheet-1-item-4`);
  await page.waitForLoadState("networkidle");
  await page.locator("#stage-5-sheet-1-item-4").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#stage-5-sheet-1-item-4 .prompt-jump-link").count(), 2);
  await page.screenshot({ path: path.join(OUTPUT, "stage5-prompt-links.png"), fullPage: false });

  await page.goto(`${BASE_URL}/#stage-2-sheet-1-item-B`);
  await page.waitForLoadState("networkidle");
  await page.locator(".nav-sheet[data-nav-sheet='stage-2-sheet-1']").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".nav-sheet[data-nav-sheet='stage-2-sheet-1'] .nav-outline-link").count(), 6);
  await page.screenshot({ path: path.join(OUTPUT, "stage2-anonymous-cases.png"), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
