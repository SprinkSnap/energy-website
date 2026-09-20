import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const waterLevelSelect = '[data-xml-path="/HouseFile/House/Specifications/WaterLevel"]';
const expectedOptions = [
  "Shallow (5-7m/16-23ft)",
  "Normal (7-10m/23-33ft)",
  "Deep (>10M/>33ft)",
];

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(waterLevelSelect, { timeout: 30000 });
  await page.locator(waterLevelSelect).scrollIntoViewIfNeeded();

  const optionLabels = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return [...(el?.options || [])].map((opt) => opt.textContent.trim());
  }, waterLevelSelect);
  assert(optionLabels.length === 3, `expected 3 options, got ${optionLabels.length}`);
  for (let i = 0; i < expectedOptions.length; i += 1) {
    assert(optionLabels[i] === expectedOptions[i], `option ${i + 1}: expected "${expectedOptions[i]}", got "${optionLabels[i]}"`);
  }
  console.log("TEST 0 PASS: Water Table Level dropdown shows exactly 3 options in capture order");

  const initial = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, waterLevelSelect);
  assert(initial.value === "2", `expected code 2, got ${initial.value}`);
  assert(initial.label === "Normal (7-10m/23-33ft)", `expected Normal default, got ${initial.label}`);
  console.log("TEST 1 PASS: new/default Water Table Level = Normal (7-10m/23-33ft)");

  await page.selectOption(waterLevelSelect, "3");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(waterLevelSelect, { timeout: 5000 });
  const afterNav = await page.evaluate((sel) => document.querySelector(sel)?.value || "", waterLevelSelect);
  assert(afterNav === "3", `expected Deep code 3 after navigation, got ${afterNav}`);
  console.log("TEST 2 PASS: user selection persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(waterLevelSelect, { timeout: 30000 });
  const afterRefresh = await page.evaluate((sel) => document.querySelector(sel)?.value || "", waterLevelSelect);
  assert(afterRefresh === "3", `expected code 3 after refresh, got ${afterRefresh}`);
  console.log("TEST 3 PASS: Water Table Level persists after refresh");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    /<WaterLevel code="2">[\s\S]*?<\/WaterLevel>/,
    `<WaterLevel code="1">
                <English>Shallow (5-7m/16-23ft)</English>
                <French>Peu profond (5-7m/16-23pi)</French>
            </WaterLevel>`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-shallow-water-level.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "1",
    waterLevelSelect,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(waterLevelSelect, { timeout: 5000 });
  const imported = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, waterLevelSelect);
  assert(imported.value === "1", `imported code=${imported.value}`);
  assert(imported.label === "Shallow (5-7m/16-23ft)", `imported label=${imported.label}`);
  console.log("TEST 4 PASS: imported Water Table Level preserved");

  console.log("water-level-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
