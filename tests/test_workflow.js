const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8765";
const ARTIFACTS = "/tmp/workflow-site-test";
fs.mkdirSync(ARTIFACTS, { recursive: true });

function assertNoConsoleErrors(errors) {
  assert.equal(errors.length, 0, `Browser console errors:\n${errors.join("\n")}`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(BASE_URL);
  await page.waitForLoadState("networkidle");

  assert.equal(await page.title(), "论文写作工作流");
  assert.equal(await page.locator(".stage-section").count(), 6);
  assert.equal(await page.locator(".sheet").count(), 17);
  assert.equal(await page.locator(".content-card").count(), 313);
  assert.equal(await page.locator(".copy-button").count(), 313);
  assert.equal(await page.locator(".nav-stage").count(), 6);
  assert.equal(await page.locator(".nav-sheet-link").count(), 17);

  // Spreadsheet scaffolding is visually subordinate to the actual writing content.
  const bodyStructure = page.locator("#stage-3-sheet-1");
  assert.equal(await bodyStructure.locator(".field-index").getAttribute("open"), null);
  assert.equal(await bodyStructure.locator(".group-heading").filter({ hasText: /^Abstract/ }).first().locator("span").first().textContent(), "Abstract");
  assert.equal(await bodyStructure.locator(".source-context .structural-card").count() > 0, true);
  assert.equal(await bodyStructure.getByText("Abstract｜Abstract", { exact: true }).count(), 0);

  // Every rendered card must preserve its source value byte-for-byte.
  const browserData = await page.evaluate(() => window.WORKFLOW_DATA);
  for (const stage of browserData.stages) {
    for (const sheet of stage.sheets) {
      const renderedPairs = await page.locator(`#${sheet.id} .content-card`).evaluateAll((cards) =>
        cards.map((card) => [card.dataset.cellRef, card.querySelector(".card-text").textContent]),
      );
      const rendered = Object.fromEntries(renderedPairs);
      const source = Object.fromEntries(sheet.cells.map((cell) => [cell.ref, cell.value]));
      assert.deepEqual(rendered, source, `Rendered text changed in ${sheet.book}/${sheet.name}`);
    }
  }

  await page.screenshot({ path: path.join(ARTIFACTS, "desktop.png"), fullPage: false });

  const firstCard = page.locator(".content-card").first();
  const expected = await firstCard.locator(".card-text").textContent();
  await firstCard.locator(".copy-button").click();
  const actual = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(actual, expected);
  assert.equal(await firstCard.locator(".copy-button span").textContent(), "已复制");

  const search = page.locator("#workflow-search");
  await search.fill("Nano Banana");
  await page.waitForTimeout(100);
  const visibleCards = page.locator(".content-card:visible");
  const visibleCount = await visibleCards.count();
  assert.ok(visibleCount > 0);
  assert.match(await page.locator("#search-status").textContent(), /找到/);
  for (let index = 0; index < visibleCount; index += 1) {
    assert.match((await visibleCards.nth(index).innerText()).toLowerCase(), /nano banana/);
  }
  await search.fill("");
  assert.equal(await page.locator(".content-card[hidden]").count(), 0);

  await page.locator("#toggle-all").click();
  assert.equal(await page.locator(".sheet[open]").count(), 0);
  await page.locator("#toggle-all").click();
  assert.equal(await page.locator(".sheet[open]").count(), 17);

  await page.locator(".nav-stage-link[href='#stage-6']").click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => location.hash), "#stage-6");
  assert.ok(await page.locator("#stage-6").isVisible());
  await page.locator(".nav-sheet-link[href='#stage-6-sheet-2']").click();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => location.hash), "#stage-6-sheet-2");
  assert.notEqual(await page.locator("#stage-6-sheet-2").getAttribute("open"), null);

  assertNoConsoleErrors(consoleErrors);
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on("console", (message) => {
    if (message.type() === "error") mobileErrors.push(message.text());
  });
  mobilePage.on("pageerror", (error) => mobileErrors.push(String(error)));
  await mobilePage.goto(BASE_URL);
  await mobilePage.waitForLoadState("networkidle");
  assert.ok(await mobilePage.locator("#menu-button").isVisible());
  await mobilePage.locator("#menu-button").click();
  assert.ok(await mobilePage.locator("body").evaluate((node) => node.classList.contains("nav-open")));
  await mobilePage.waitForTimeout(260);
  const sidebarBox = await mobilePage.locator("#sidebar").boundingBox();
  assert.ok(sidebarBox && sidebarBox.width >= 300, `Unexpected mobile sidebar width: ${JSON.stringify(sidebarBox)}`);
  await mobilePage.screenshot({ path: path.join(ARTIFACTS, "mobile-menu.png"), fullPage: false });
  await mobilePage.locator("#sidebar-close").click();
  assert.ok(!(await mobilePage.locator("body").evaluate((node) => node.classList.contains("nav-open"))));
  assert.ok(await mobilePage.locator(".copy-button").first().isVisible());
  await mobilePage.goto(`${BASE_URL}/#stage-3-sheet-1`);
  await mobilePage.waitForLoadState("networkidle");
  await mobilePage.locator("#stage-3-sheet-1").scrollIntoViewIfNeeded();
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "Stage 3 layout must not overflow horizontally on mobile",
  );
  assertNoConsoleErrors(mobileErrors);
  await mobileContext.close();

  // The no-install, double-click/file:// opening path must also render correctly.
  const fileContext = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const filePage = await fileContext.newPage();
  const fileErrors = [];
  filePage.on("console", (message) => {
    if (message.type() === "error") fileErrors.push(message.text());
  });
  filePage.on("pageerror", (error) => fileErrors.push(String(error)));
  await filePage.goto(pathToFileURL(path.resolve("index.html")).href);
  await filePage.waitForLoadState("load");
  assert.equal(await filePage.locator(".content-card").count(), 313);
  assertNoConsoleErrors(fileErrors);
  await fileContext.close();
  await browser.close();

  console.log("PASS: 6 stages, 17 sheets, 313 exact-copy blocks; search, navigation, collapse, clipboard, mobile UI");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
