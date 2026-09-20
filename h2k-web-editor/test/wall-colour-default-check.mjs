import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const wallColourSelect = '[data-xml-path="/HouseFile/House/Specifications/WallColour"]';
const expectedOptions = [
  "User specified",
  "Flat black",
  "Dark gray",
  "Medium brown",
  "Red",
  "Medium green",
  "Yellow",
  "Blue",
  "Light green",
  "Default",
  "White",
];

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(wallColourSelect, { timeout: 30000 });
  await page.locator(wallColourSelect).scrollIntoViewIfNeeded();

  const optionLabels = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return [...(el?.options || [])].map((opt) => opt.textContent.trim());
  }, wallColourSelect);
  assert(optionLabels.length === 11, `expected 11 options, got ${optionLabels.length}`);
  for (let i = 0; i < expectedOptions.length; i += 1) {
    assert(optionLabels[i] === expectedOptions[i], `option ${i + 1}: expected "${expectedOptions[i]}", got "${optionLabels[i]}"`);
  }
  console.log("TEST 0 PASS: Wall Colour dropdown shows exactly 11 options in capture order");

  const initial = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, wallColourSelect);
  assert(initial.value === "4", `expected code 4, got ${initial.value}`);
  assert(initial.label === "Medium brown", `expected Medium brown default, got ${initial.label}`);
  const initialAbsorptivity = await page.evaluate(
    (sel) => document.querySelector(sel)?.value || "",
    '[data-xml-path="/HouseFile/House/Specifications/WallColour/@value"]',
  );
  assert(initialAbsorptivity === "0.840", `expected Value 0.840, got ${initialAbsorptivity}`);
  console.log("TEST 1 PASS: new/default Wall Colour = Medium brown + Value = 0.840");

  await page.selectOption(wallColourSelect, "11");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(wallColourSelect, { timeout: 5000 });
  const afterNav = await page.evaluate((sel) => document.querySelector(sel)?.value || "", wallColourSelect);
  assert(afterNav === "11", `expected White code 11 after navigation, got ${afterNav}`);
  console.log("TEST 2 PASS: user selection persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(wallColourSelect, { timeout: 30000 });
  const afterRefresh = await page.evaluate((sel) => document.querySelector(sel)?.value || "", wallColourSelect);
  assert(afterRefresh === "11", `expected code 11 after refresh, got ${afterRefresh}`);
  console.log("TEST 3 PASS: Wall Colour persists after refresh");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    /<WallColour code="10" value="0\.4">[\s\S]*?<\/WallColour>/,
    `<WallColour code="11" value="0.22">
                <English>White</English>
                <French>Blanc</French>
            </WallColour>`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-default-wall-colour.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "11",
    wallColourSelect,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(wallColourSelect, { timeout: 5000 });
  const imported = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, wallColourSelect);
  assert(imported.value === "11", `imported code=${imported.value}`);
  assert(imported.label === "White", `imported label=${imported.label}`);
  console.log("TEST 4 PASS: imported Wall Colour preserved");

  console.log("wall-colour-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
