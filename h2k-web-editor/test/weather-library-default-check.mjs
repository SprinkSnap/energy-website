import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";
const DEFAULT_PATH = "C:\\HOT2000 v11.13b13\\Dat\\Wth2020.dir";
const CUSTOM_PATH = "C:\\Custom\\Weather\\Wth2020.dir";

const libraryValueSel = "#screen-house-weather .weather-library-value";
const changeBtnSel = "#weatherLibraryChangeBtn";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readLibraryPath(page) {
  return page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || "", libraryValueSel);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/weather`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(libraryValueSel, { timeout: 30000 });
  await page.locator(libraryValueSel).scrollIntoViewIfNeeded();

  const initial = await readLibraryPath(page);
  assert(initial === DEFAULT_PATH, `expected default path ${DEFAULT_PATH}, got ${initial}`);
  console.log("TEST 1 PASS: new/default house uses HOT2000 Weather Library path");

  page.once("dialog", async (dialog) => {
    assert(dialog.type() === "prompt", "Change should open a prompt dialog");
    await dialog.accept(CUSTOM_PATH);
  });
  await page.click(changeBtnSel);
  await page.waitForFunction(
    ({ sel, custom }) => document.querySelector(sel)?.textContent?.trim() === custom,
    { sel: libraryValueSel, custom: CUSTOM_PATH },
    { timeout: 5000 },
  );
  console.log("TEST 2 PASS: Change updates Weather Library path");

  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/weather"]');
  await page.waitForSelector(libraryValueSel, { timeout: 5000 });
  const afterNav = await readLibraryPath(page);
  assert(afterNav === CUSTOM_PATH, `expected custom path after navigation, got ${afterNav}`);
  console.log("TEST 3 PASS: selected path persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(libraryValueSel, { timeout: 30000 });
  const afterRefresh = await readLibraryPath(page);
  assert(afterRefresh === CUSTOM_PATH, `expected custom path after refresh, got ${afterRefresh}`);
  console.log("TEST 4 PASS: selected path persists after refresh");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    'library="Wth2020.dir"',
    `library="${CUSTOM_PATH}"`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-custom-weather-library.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    () => document.getElementById("exportName")?.value === "import-custom-weather-library.h2k",
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/weather`, { waitUntil: "networkidle" });
  await page.waitForSelector(libraryValueSel, { timeout: 30000 });
  const imported = await readLibraryPath(page);
  assert(imported === CUSTOM_PATH, `imported path expected ${CUSTOM_PATH}, got ${imported}`);
  console.log("TEST 5 PASS: imported saved Weather Library path restored instead of default");

  const freshXml = readFileSync(templatePath, "utf8");
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-template-weather-library.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, freshXml);
  await page.waitForFunction(
    () => document.getElementById("exportName")?.value === "import-template-weather-library.h2k",
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/weather`, { waitUntil: "networkidle" });
  await page.waitForSelector(libraryValueSel, { timeout: 30000 });
  const legacyNormalized = await readLibraryPath(page);
  assert(legacyNormalized === DEFAULT_PATH, `legacy Wth2020.dir should normalize to default, got ${legacyNormalized}`);
  console.log("TEST 6 PASS: legacy template library value normalizes to default display path");

  console.log("weather-library-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
