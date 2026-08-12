const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:8765";
const OUTPUT = "/tmp/workflow-site-test";
fs.mkdirSync(OUTPUT, { recursive: true });

async function capture(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE_URL}/#stage-3-sheet-1`);
  await page.waitForLoadState("networkidle");
  await page.locator("#stage-3-sheet-1").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewport, `${name} overflows: ${JSON.stringify(dimensions)}`);
  await page.screenshot({ path: path.join(OUTPUT, name), fullPage: false });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  await capture(browser, { width: 1440, height: 1000 }, "stage3-desktop.png");
  await capture(browser, { width: 390, height: 844 }, "stage3-narrow.png");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
