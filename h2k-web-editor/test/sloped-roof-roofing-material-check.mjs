import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const SESSION_KEY = "h2k-web-editor-session-v1";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const selectSel = `${dialogSel} select[name="slopedRoofingMaterial"]`;
const valueSel = `${dialogSel} input[name="slopedRoofingValue"]`;
const exteriorSel = `${dialogSel} select[name="gableExteriorMaterial"]`;

const EXPECTED_OPTIONS = [
  "User specified",
  "Asphalt shingles",
  "Metal roofing",
  "Built-up membrane",
  "Asphalt roll roofing",
  "Wood shingles",
  "Crushed stone (not dried)",
  "Slate",
  "Clay tile",
];

const DEFAULT_OPTION = "Asphalt shingles";

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

  const initial = await page.evaluate(({ sel, valueSel, exteriorSel }) => {
    const roofing = document.querySelector(sel);
    const value = document.querySelector(valueSel);
    const exterior = document.querySelector(exteriorSel);
    return {
      disabled: !!roofing?.disabled,
      readOnly: roofing?.ariaReadOnly === "true",
      optionsStatus: roofing?.dataset.optionsStatus || "",
      mappingStatus: roofing?.dataset.mappingStatus || "",
      selected: roofing?.value || "",
      optionLabels: [...(roofing?.options || [])].map((o) => o.textContent),
      defaultValue: value?.value ?? "",
      exteriorSelected: exterior?.value || "",
    };
  }, { sel: selectSel, valueSel, exteriorSel });

  assert(!initial.disabled, "Sloped Roof Roofing Material should be enabled");
  assert(!initial.readOnly, "Sloped Roof Roofing Material should not be read-only");
  assert(initial.optionsStatus === "captured", `expected captured options, got ${initial.optionsStatus}`);
  assert(initial.mappingStatus === "unmapped", `expected unmapped stored codes, got ${initial.mappingStatus}`);
  assert(initial.selected === DEFAULT_OPTION, `expected default ${DEFAULT_OPTION}, got ${initial.selected}`);
  assert(initial.defaultValue === "0", `expected default Value 0, got ${initial.defaultValue}`);
  assert(initial.exteriorSelected === "Hollow metal/vinyl cladding", "Exterior Material should remain unchanged");
  assert(initial.optionLabels.length === 9, `expected 9 options, got ${initial.optionLabels.length}`);
  for (let i = 0; i < EXPECTED_OPTIONS.length; i += 1) {
    assert(initial.optionLabels[i] === EXPECTED_OPTIONS[i], `option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${initial.optionLabels[i]}"`);
  }
  console.log("TEST PASS: enabled combobox with exact 9 options and default selection");

  await page.selectOption(selectSel, "Slate");
  const afterChange = await page.inputValue(selectSel);
  assert(afterChange === "Slate", "selection should update immediately");
  console.log("TEST PASS: changing selection works immediately");

  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterSave = await page.inputValue(selectSel);
  assert(afterSave === "Slate", "saved selection should persist on reopen");
  console.log("TEST PASS: persisted user selection preserved");

  await page.evaluate(({ key, restoredMaterial }) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) throw new Error("missing session payload");
    const data = JSON.parse(raw);
    data.roofCavityInputs = data.roofCavityInputs || {};
    data.roofCavityInputs.slopedRoof = data.roofCavityInputs.slopedRoof || {};
    data.roofCavityInputs.slopedRoof.roofingMaterial = restoredMaterial;
    sessionStorage.setItem(key, JSON.stringify(data));
  }, { key: SESSION_KEY, restoredMaterial: "Clay tile" });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);

  const restored = await page.evaluate(({ sel }) => {
    const roofing = document.querySelector(sel);
    return {
      disabled: !!roofing?.disabled,
      selected: roofing?.value || "",
      optionLabels: [...(roofing?.options || [])].map((o) => o.textContent),
    };
  }, { sel: selectSel });

  assert(!restored.disabled, "restored Roofing Material should remain enabled");
  assert(restored.selected === "Clay tile", `expected restored selection Clay tile, got ${restored.selected}`);
  assert(restored.optionLabels.includes("Clay tile"), "restored value should remain in captured option list");
  console.log("TEST PASS: restored Roofing Material value preserved");

  console.log("sloped-roof-roofing-material-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
