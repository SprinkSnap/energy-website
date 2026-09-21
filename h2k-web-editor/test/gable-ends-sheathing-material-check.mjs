import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const selectSel = `${dialogSel} select[name="gableSheathingMaterial"]`;

const EXPECTED_OPTIONS = [
  "User specified",
  "Waferboard/OSM 9.5 mm (3/8 in)",
  "Waferboard/OSM 11.1 mm (7/16 in)",
  "Waferboard/OSM 15.9 mm (5/8 in)",
  "Plywood/Part. bd 9.5 mm (3/8 in)",
  "Plywood/Part. bd 12.7 mm (1/2 in)",
  "Plywood/Part. bd 15.5 mm (5/8 in)",
  "Plywood/Part. bd 18.5 mm (3/4 in)",
  "Fibreboard 9.5 mm (3/8 in)",
  "Fibreboard 11.1 mm (7/16 in)",
  "Gypsum sheathing 9.5 mm (3/8 in)",
  "Gypsum sheathing 12.7 mm (1/2 in)",
];

const DEFAULT_OPTION = "Plywood/Part. bd 9.5 mm (3/8 in)";
const SLOPED_DEFAULT = "Plywood/Part. bd 12.7 mm (1/2 in)";

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

  const initial = await page.evaluate(({ sel, slopedSel }) => {
    const gable = document.querySelector(sel);
    const sloped = document.querySelector(slopedSel);
    return {
      disabled: !!gable?.disabled,
      optionsStatus: gable?.dataset.optionsStatus || "",
      mappingStatus: gable?.dataset.mappingStatus || "",
      selected: gable?.value || "",
      optionLabels: [...(gable?.options || [])].map((o) => o.textContent),
      slopedSelected: sloped?.value || "",
      slopedDisabled: !!sloped?.disabled,
      slopedOptionsStatus: sloped?.dataset.optionsStatus || "",
    };
  }, { sel: selectSel, slopedSel: `${dialogSel} select[name="slopedSheathingMaterial"]` });

  assert(!initial.disabled, "Gable Ends Sheathing Material should be enabled");
  assert(initial.optionsStatus === "captured", `expected captured options, got ${initial.optionsStatus}`);
  assert(initial.mappingStatus === "unmapped", `expected unmapped stored codes, got ${initial.mappingStatus}`);
  assert(initial.selected === DEFAULT_OPTION, `expected default ${DEFAULT_OPTION}, got ${initial.selected}`);
  assert(initial.optionLabels.length === 12, `expected 12 options, got ${initial.optionLabels.length}`);
  for (let i = 0; i < EXPECTED_OPTIONS.length; i += 1) {
    assert(initial.optionLabels[i] === EXPECTED_OPTIONS[i], `option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${initial.optionLabels[i]}"`);
  }
  assert(initial.slopedSelected === SLOPED_DEFAULT, "Sloped Roof Sheathing default should remain unchanged");
  assert(initial.slopedDisabled === false, "Sloped Roof Sheathing should be enabled with captured options");
  assert(initial.slopedOptionsStatus === "captured", `expected sloped captured options, got ${initial.slopedOptionsStatus}`);
  console.log("TEST PASS: enabled combobox with exact 12 options and default selection");

  await page.selectOption(selectSel, "Waferboard/OSM 11.1 mm (7/16 in)");
  const afterChange = await page.inputValue(selectSel);
  assert(afterChange === "Waferboard/OSM 11.1 mm (7/16 in)", "selection should update immediately");
  console.log("TEST PASS: changing selection works immediately");

  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterSave = await page.inputValue(selectSel);
  assert(afterSave === "Waferboard/OSM 11.1 mm (7/16 in)", "saved selection should persist on reopen");
  console.log("TEST PASS: persisted user selection preserved");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);
  const afterRefresh = await page.inputValue(selectSel);
  assert(afterRefresh === "Waferboard/OSM 11.1 mm (7/16 in)", "selection should persist after refresh");
  console.log("TEST PASS: selection preserved after refresh");

  console.log("gable-ends-sheathing-material-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
