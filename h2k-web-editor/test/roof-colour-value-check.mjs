import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const roofColourSelect = '[data-xml-path="/HouseFile/House/Specifications/RoofColour"]';
const roofValueInput = '[data-xml-path="/HouseFile/House/Specifications/RoofColour/@value"]';
const wallColourSelect = '[data-xml-path="/HouseFile/House/Specifications/WallColour"]';
const wallValueInput = '[data-xml-path="/HouseFile/House/Specifications/WallColour/@value"]';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function readRoofControls() {
  return page.evaluate(({ colourSel, valueSel }) => {
    const colour = document.querySelector(colourSel);
    const value = document.querySelector(valueSel);
    const valueLabel = value?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    return {
      colourCode: colour?.value || "",
      colourLabel: colour?.selectedOptions?.[0]?.textContent?.trim() || "",
      value: value?.value ?? "",
      valueDisabled: !!value?.disabled,
      valueLabel,
    };
  }, { colourSel: roofColourSelect, valueSel: roofValueInput });
}

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(roofColourSelect, { timeout: 30000 });
  await page.locator(roofColourSelect).scrollIntoViewIfNeeded();

  const labels = await readRoofControls();
  assert(labels.valueLabel === "Value", `expected Value label, got "${labels.valueLabel}"`);
  console.log('TEST 0 PASS: Roof visible label is "Value"');

  const initial = await readRoofControls();
  assert(initial.colourCode === "10", `expected Default code 10, got ${initial.colourCode}`);
  assert(initial.colourLabel === "Default", `expected Default, got ${initial.colourLabel}`);
  assert(initial.value === "0.400", `expected 0.400, got ${initial.value}`);
  console.log("TEST 1 PASS: new/default Roof Colour = Default + 0.400");

  await page.selectOption(roofColourSelect, "2");
  await page.waitForFunction(
    ({ valueSel }) => document.querySelector(valueSel)?.value === "0.950",
    { valueSel: roofValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 2 PASS: Flat black → 0.950");

  await page.selectOption(roofColourSelect, "11");
  await page.waitForFunction(
    ({ valueSel }) => document.querySelector(valueSel)?.value === "0.250",
    { valueSel: roofValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 3 PASS: White → 0.250");

  await page.selectOption(roofColourSelect, "1");
  await page.waitForFunction(
    ({ valueSel }) => {
      const el = document.querySelector(valueSel);
      return el && el.disabled === false && el.value === "";
    },
    { valueSel: roofValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 4 PASS: User specified → blank editable Value");

  const wallInitial = await page.evaluate(({ colourSel, valueSel }) => ({
    colourCode: document.querySelector(colourSel)?.value || "",
    colourLabel: document.querySelector(colourSel)?.selectedOptions?.[0]?.textContent?.trim() || "",
    value: document.querySelector(valueSel)?.value || "",
  }), { colourSel: wallColourSelect, valueSel: wallValueInput });
  assert(wallInitial.colourCode === "10", `expected Wall Default, got ${wallInitial.colourCode}`);
  assert(wallInitial.value === "0.400", `expected Wall 0.400, got ${wallInitial.value}`);
  console.log("TEST 5 PASS: Wall new/default = Default + 0.400");

  await page.selectOption(wallColourSelect, "4");
  await page.waitForFunction(
    ({ valueSel }) => document.querySelector(valueSel)?.value === "0.840",
    { valueSel: wallValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 6 PASS: Wall Medium brown → 0.840");

  await page.selectOption(wallColourSelect, "1");
  await page.waitForFunction(
    ({ valueSel }) => {
      const el = document.querySelector(valueSel);
      return el && el.disabled === false && el.value === "";
    },
    { valueSel: wallValueInput },
    { timeout: 5000 },
  );
  console.log("TEST 7 PASS: Wall User specified → blank editable Value");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    /<RoofColour code="10" value="0\.4">[\s\S]*?<\/RoofColour>/,
    `<RoofColour code="1" value="0.655">
                <English>User specified</English>
                <French>Spécifié par l'util.</French>
            </RoofColour>`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-user-roof-colour.h2k", { type: "application/xml" });
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
    { colourSel: roofColourSelect, valueSel: roofValueInput },
    { timeout: 15000 },
  );
  console.log("TEST 8 PASS: imported Roof User specified value preserved");

  console.log("roof-colour-value-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
