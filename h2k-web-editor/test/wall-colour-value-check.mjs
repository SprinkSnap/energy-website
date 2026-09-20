import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wallColourSelect = '[data-xml-path="/HouseFile/House/Specifications/WallColour"]';
const wallValueInput = '[data-xml-path="/HouseFile/House/Specifications/WallColour/@value"]';

const colourMappings = [
  ["2", "Flat black", "0.950"],
  ["3", "Dark gray", "0.910"],
  ["4", "Medium brown", "0.840"],
  ["5", "Red", "0.740"],
  ["6", "Medium green", "0.590"],
  ["7", "Yellow", "0.570"],
  ["8", "Blue", "0.510"],
  ["9", "Light green", "0.470"],
  ["10", "Default", "0.400"],
  ["11", "White", "0.250"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function readWallControls() {
  return page.evaluate(({ colourSel, valueSel }) => {
    const colour = document.querySelector(colourSel);
    const value = document.querySelector(valueSel);
    const valueLabel = value?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    const colourLabel = colour?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    return {
      colourCode: colour?.value || "",
      colourLabel: colour?.selectedOptions?.[0]?.textContent?.trim() || "",
      value: value?.value ?? "",
      valueDisabled: !!value?.disabled,
      valueLabel,
      wallColourFieldLabel: colourLabel,
    };
  }, { colourSel: wallColourSelect, valueSel: wallValueInput });
}

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(wallColourSelect, { timeout: 30000 });
  await page.locator(wallColourSelect).scrollIntoViewIfNeeded();

  const labels = await readWallControls();
  assert(labels.valueLabel === "Value", `expected Value label, got "${labels.valueLabel}"`);
  assert(labels.valueLabel !== "Wall absorptivity", "Wall absorptivity label should not remain");
  console.log('TEST 0 PASS: visible label is "Value"');

  const initial = await readWallControls();
  assert(initial.colourCode === "4", `expected Medium brown code 4, got ${initial.colourCode}`);
  assert(initial.colourLabel === "Medium brown", `expected Medium brown, got ${initial.colourLabel}`);
  assert(initial.value === "0.840", `expected 0.840, got ${initial.value}`);
  assert(initial.valueDisabled === true, "predefined default Value should be disabled");
  console.log("TEST 1 PASS: new/default file = Medium brown + 0.840");

  for (const [code, label, expectedValue] of colourMappings) {
    await page.selectOption(wallColourSelect, code);
    await page.waitForFunction(
      ({ valueSel, expected }) => {
        const el = document.querySelector(valueSel);
        return el?.value === expected && el.disabled === true;
      },
      { valueSel: wallValueInput, expected: expectedValue },
      { timeout: 5000 },
    );
    const state = await readWallControls();
    assert(state.colourLabel === label, `${label}: colour label mismatch`);
    assert(state.value === expectedValue, `${label}: expected ${expectedValue}, got ${state.value}`);
    assert(state.valueDisabled === true, `${label}: Value should be disabled`);
    console.log(`TEST MAP PASS: ${label} → ${expectedValue}`);
  }

  await page.selectOption(wallColourSelect, "1");
  await page.waitForFunction(
    (valueSel) => {
      const el = document.querySelector(valueSel);
      return el && el.disabled === false;
    },
    wallValueInput,
    { timeout: 5000 },
  );
  await page.fill(wallValueInput, "0.675");
  await page.dispatchEvent(wallValueInput, "input");
  await page.dispatchEvent(wallValueInput, "change");

  let userState = await readWallControls();
  assert(userState.colourLabel === "User specified", "expected User specified");
  assert(userState.value === "0.675", `expected custom 0.675, got ${userState.value}`);
  assert(userState.valueDisabled === false, "User specified Value should be enabled");
  console.log("TEST 2 PASS: User specified Value editable");

  await page.selectOption(wallColourSelect, "4");
  await page.waitForFunction(
    ({ valueSel }) => {
      const el = document.querySelector(valueSel);
      return el?.value === "0.840" && el.disabled === true;
    },
    { valueSel: wallValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 3 PASS: predefined colour updates Value immediately");

  await page.selectOption(wallColourSelect, "1");
  await page.waitForFunction(
    ({ valueSel }) => {
      const el = document.querySelector(valueSel);
      return el?.value === "0.675" && el.disabled === false;
    },
    { valueSel: wallValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 4 PASS: User specified custom value restored after switching back");

  await page.selectOption(wallColourSelect, "11");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(wallColourSelect, { timeout: 5000 });
  const afterNav = await readWallControls();
  assert(afterNav.colourCode === "11", `expected White after navigation, got ${afterNav.colourCode}`);
  assert(afterNav.value === "0.250", `expected 0.250 after navigation, got ${afterNav.value}`);
  console.log("TEST 5 PASS: user selection persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(wallColourSelect, { timeout: 30000 });
  const afterRefresh = await readWallControls();
  assert(afterRefresh.colourCode === "11", `expected White after refresh, got ${afterRefresh.colourCode}`);
  assert(afterRefresh.value === "0.250", `expected 0.250 after refresh, got ${afterRefresh.value}`);
  console.log("TEST 6 PASS: Wall Colour + Value persist after refresh");

  const importedXml = readFileSync(templatePath, "utf8")
    .replace(
      /<WallColour code="10" value="0\.4">[\s\S]*?<\/WallColour>/,
      `<WallColour code="1" value="0.655">
                <English>User specified</English>
                <French>Spécifié par l'util.</French>
            </WallColour>`,
    );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-user-wall-colour.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    ({ colourSel, valueSel }) => {
      const colour = document.querySelector(colourSel);
      const value = document.querySelector(valueSel);
      return colour?.value === "1" && value?.value === "0.655" && value?.disabled === false;
    },
    { colourSel: wallColourSelect, valueSel: wallValueInput },
    { timeout: 15000 },
  );
  console.log("TEST 7 PASS: imported User specified value preserved");

  console.log("wall-colour-value-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
