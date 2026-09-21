import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const SESSION_KEY = "h2k-web-editor-session-v1";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const selectSel = `${dialogSel} select[name="gableExteriorMaterial"]`;

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

  const initial = await page.evaluate(({ sel }) => {
    const exterior = document.querySelector(sel);
    return {
      disabled: !!exterior?.disabled,
      readOnly: exterior?.ariaReadOnly === "true",
      optionsStatus: exterior?.dataset.optionsStatus || "",
      mappingStatus: exterior?.dataset.mappingStatus || "",
      selected: exterior?.value || "",
      optionLabels: [...(exterior?.options || [])].map((o) => o.textContent),
    };
  }, { sel: selectSel });

  assert(!initial.disabled, "Gable Ends Exterior Material should be enabled");
  assert(!initial.readOnly, "Gable Ends Exterior Material should not be read-only");
  assert(initial.optionsStatus === "not-captured", `expected not-captured options, got ${initial.optionsStatus}`);
  assert(initial.mappingStatus === "unmapped", `expected unmapped stored codes, got ${initial.mappingStatus}`);
  assert(initial.selected === DEFAULT_OPTION, `expected default ${DEFAULT_OPTION}, got ${initial.selected}`);
  assert(initial.optionLabels.length === 1, `expected only current captured option, got ${initial.optionLabels.length}`);
  assert(initial.optionLabels[0] === DEFAULT_OPTION, `expected captured option ${DEFAULT_OPTION}, got ${initial.optionLabels[0]}`);
  console.log("TEST PASS: enabled editable combobox with captured default selection");

  await page.evaluate(({ key, restoredMaterial }) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) throw new Error("missing session payload");
    const data = JSON.parse(raw);
    data.roofCavityInputs = data.roofCavityInputs || {};
    data.roofCavityInputs.gableEnds = data.roofCavityInputs.gableEnds || {};
    data.roofCavityInputs.gableEnds.exteriorMaterial = restoredMaterial;
    sessionStorage.setItem(key, JSON.stringify(data));
  }, { key: SESSION_KEY, restoredMaterial: "Brick" });

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
  assert(restored.selected === "Brick", `expected restored selection Brick, got ${restored.selected}`);
  assert(restored.optionLabels.length === 1, "restored value should render as single preserved option");
  assert(restored.optionLabels[0] === "Brick", "restored option label should match persisted value");
  console.log("TEST PASS: restored Exterior Material value preserved");

  console.log("gable-ends-exterior-material-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
