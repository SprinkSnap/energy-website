import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const SESSION_KEY = "h2k-web-editor-session-v1";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const selectSel = `${dialogSel} select[name="gableExteriorMaterial"]`;
const valueSel = `${dialogSel} input[name="gableExteriorValue"]`;

const EXPECTED_OPTIONS = [
  "User specified",
  "Wood (lapped)",
  "Hollow metal/vinyl cladding",
  "Insul. metal/vinyl cladding",
  "Brick",
  "Mortar",
  "Stucco",
];

const DEFAULT_OPTION = "Hollow metal/vinyl cladding";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openDialog(page) {
  await page.uncheck(defaultRoofCavityPath);
  await page.click(inputsBtn);
  await page.waitForSelector(`${dialogSel}[open]`, { timeout: 5000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });

  await openDialog(page);

  const initial = await page.evaluate(({ sel, valueSel }) => {
    const exterior = document.querySelector(sel);
    const value = document.querySelector(valueSel);
    return {
      disabled: !!exterior?.disabled,
      readOnly: exterior?.ariaReadOnly === "true",
      optionsStatus: exterior?.dataset.optionsStatus || "",
      mappingStatus: exterior?.dataset.mappingStatus || "",
      selected: exterior?.value || "",
      optionLabels: [...(exterior?.options || [])].map((o) => o.textContent),
      defaultValue: value?.value ?? "",
    };
  }, { sel: selectSel, valueSel });

  assert(!initial.disabled, "Gable Ends Exterior Material should be enabled");
  assert(!initial.readOnly, "Gable Ends Exterior Material should not be read-only");
  assert(initial.optionsStatus === "captured", `expected captured options, got ${initial.optionsStatus}`);
  assert(initial.mappingStatus === "unmapped", `expected unmapped stored codes, got ${initial.mappingStatus}`);
  assert(initial.selected === DEFAULT_OPTION, `expected default ${DEFAULT_OPTION}, got ${initial.selected}`);
  assert(initial.defaultValue === "0", `expected default Value 0, got ${initial.defaultValue}`);
  assert(initial.optionLabels.length === 7, `expected 7 options, got ${initial.optionLabels.length}`);
  for (let i = 0; i < EXPECTED_OPTIONS.length; i += 1) {
    assert(initial.optionLabels[i] === EXPECTED_OPTIONS[i], `option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${initial.optionLabels[i]}"`);
  }
  console.log("TEST PASS: enabled combobox with exact 7 options and default selection");

  await page.selectOption(selectSel, "Brick");
  const afterChange = await page.inputValue(selectSel);
  assert(afterChange === "Brick", "selection should update immediately");
  console.log("TEST PASS: changing selection works immediately");

  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterSave = await page.inputValue(selectSel);
  assert(afterSave === "Brick", "saved selection should persist on reopen");
  console.log("TEST PASS: persisted user selection preserved");

  await page.evaluate(({ key, restoredMaterial }) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) throw new Error("missing session payload");
    const data = JSON.parse(raw);
    data.roofCavityInputs = data.roofCavityInputs || {};
    data.roofCavityInputs.gableEnds = data.roofCavityInputs.gableEnds || {};
    data.roofCavityInputs.gableEnds.exteriorMaterial = restoredMaterial;
    sessionStorage.setItem(key, JSON.stringify(data));
  }, { key: SESSION_KEY, restoredMaterial: "Mortar" });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);

  const restored = await page.evaluate(({ sel }) => {
    const exterior = document.querySelector(sel);
    return {
      disabled: !!exterior?.disabled,
      selected: exterior?.value || "",
      optionLabels: [...(exterior?.options || [])].map((o) => o.textContent),
    };
  }, { sel: selectSel });

  assert(!restored.disabled, "restored Exterior Material should remain enabled");
  assert(restored.selected === "Mortar", `expected restored selection Mortar, got ${restored.selected}`);
  assert(restored.optionLabels.includes("Mortar"), "restored value should remain in captured option list");
  console.log("TEST PASS: restored Exterior Material value preserved");

  console.log("gable-ends-exterior-material-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
