import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const yearInput = '[data-xml-path="/HouseFile/House/Specifications/YearBuilt/@value"]';
const expectedCurrentYear = String(new Date().getFullYear());

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(yearInput, { timeout: 30000 });
  await page.locator(yearInput).scrollIntoViewIfNeeded();

  const initial = await page.inputValue(yearInput);
  assert(initial === expectedCurrentYear, `expected Year=${expectedCurrentYear}, got ${initial}`);
  console.log(`TEST 1 PASS: new/default Year = ${expectedCurrentYear}`);

  await page.fill(yearInput, "2024");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(yearInput, { timeout: 5000 });
  const afterNav = await page.inputValue(yearInput);
  assert(afterNav === "2024", `expected Year=2024 after navigation, got ${afterNav}`);
  console.log("TEST 2 PASS: user-selected Year persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(yearInput, { timeout: 30000 });
  const afterRefresh = await page.inputValue(yearInput);
  assert(afterRefresh === "2024", `expected Year=2024 after refresh, got ${afterRefresh}`);
  console.log("TEST 3 PASS: Year persists after refresh");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    /<YearBuilt code="1" value="2026">[\s\S]*?<\/YearBuilt>/,
    `<YearBuilt code="1" value="1999">
                <English>User specified</English>
                <French>Spécifié par l'util.</French>
            </YearBuilt>`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-year-1999.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "1999",
    yearInput,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(yearInput, { timeout: 5000 });
  const imported = await page.inputValue(yearInput);
  assert(imported === "1999", `imported Year=${imported}, expected 1999`);
  console.log("TEST 4 PASS: imported Year preserved");

  console.log("year-built-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
