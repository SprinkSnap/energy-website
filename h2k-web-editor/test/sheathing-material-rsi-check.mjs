import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";

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

const PREDEFINED_MAPPINGS = [
  ["Waferboard/OSM 9.5 mm (3/8 in)", "0.105"],
  ["Waferboard/OSM 11.1 mm (7/16 in)", "0.122"],
  ["Waferboard/OSM 15.9 mm (5/8 in)", "0.175"],
  ["Plywood/Part. bd 9.5 mm (3/8 in)", "0.083"],
  ["Plywood/Part. bd 12.7 mm (1/2 in)", "0.111"],
  ["Plywood/Part. bd 15.5 mm (5/8 in)", "0.135"],
  ["Plywood/Part. bd 18.5 mm (3/4 in)", "0.161"],
  ["Fibreboard 9.5 mm (3/8 in)", "0.157"],
  ["Fibreboard 11.1 mm (7/16 in)", "0.183"],
  ["Gypsum sheathing 9.5 mm (3/8 in)", "0.059"],
  ["Gypsum sheathing 12.7 mm (1/2 in)", "0.079"],
];

const GABLE_DEFAULT_MATERIAL = "Plywood/Part. bd 9.5 mm (3/8 in)";
const GABLE_DEFAULT_VALUE = "0.083";
const SLOPED_DEFAULT_MATERIAL = "Plywood/Part. bd 12.7 mm (1/2 in)";
const SLOPED_DEFAULT_VALUE = "0.111";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openDialog(page) {
  await page.uncheck(defaultRoofCavityPath);
  await page.click(inputsBtn);
  await page.waitForSelector(`${dialogSel}[open]`, { timeout: 5000 });
}

async function readSheathingPair(page, materialName) {
  return page.evaluate(({ dialogSel, materialName }) => {
    const material = document.querySelector(`${dialogSel} select[name="${materialName}"]`);
    const valueName = materialName === "gableSheathingMaterial" ? "gableSheathingValue" : "slopedSheathingValue";
    const value = document.querySelector(`${dialogSel} input[name="${valueName}"]`);
    return {
      material: material?.value || "",
      value: value?.value ?? "",
      valueDisabled: !!value?.disabled,
      optionLabels: [...(material?.options || [])].map((o) => o.textContent),
    };
  }, { dialogSel, materialName });
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

  const gableInitial = await readSheathingPair(page, "gableSheathingMaterial");
  const slopedInitial = await readSheathingPair(page, "slopedSheathingMaterial");

  assert(gableInitial.material === GABLE_DEFAULT_MATERIAL, `Gable default material expected ${GABLE_DEFAULT_MATERIAL}, got ${gableInitial.material}`);
  assert(gableInitial.value === GABLE_DEFAULT_VALUE, `Gable default value expected ${GABLE_DEFAULT_VALUE}, got ${gableInitial.value}`);
  assert(gableInitial.valueDisabled, "Gable predefined default value should be protected");
  assert(slopedInitial.material === SLOPED_DEFAULT_MATERIAL, `Sloped default material expected ${SLOPED_DEFAULT_MATERIAL}, got ${slopedInitial.material}`);
  assert(slopedInitial.value === SLOPED_DEFAULT_VALUE, `Sloped default value expected ${SLOPED_DEFAULT_VALUE}, got ${slopedInitial.value}`);
  assert(slopedInitial.valueDisabled, "Sloped predefined default value should be protected");
  assert(gableInitial.optionLabels.length === 12, `expected 12 gable options, got ${gableInitial.optionLabels.length}`);
  assert(slopedInitial.optionLabels.length === 12, `expected 12 sloped options, got ${slopedInitial.optionLabels.length}`);
  for (let i = 0; i < EXPECTED_OPTIONS.length; i += 1) {
    assert(gableInitial.optionLabels[i] === EXPECTED_OPTIONS[i], `gable option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${gableInitial.optionLabels[i]}"`);
    assert(slopedInitial.optionLabels[i] === EXPECTED_OPTIONS[i], `sloped option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${slopedInitial.optionLabels[i]}"`);
  }
  console.log("TEST 1 PASS: new-file defaults and exact 12-option order for both sections");

  for (const [material, rsi] of PREDEFINED_MAPPINGS) {
    await page.selectOption(`${dialogSel} select[name="gableSheathingMaterial"]`, material);
    await page.waitForFunction(
      ({ dialogSel, material, rsi }) => {
        const value = document.querySelector(`${dialogSel} input[name="gableSheathingValue"]`);
        return value?.value === rsi && value?.disabled === true;
      },
      { dialogSel, material, rsi },
      { timeout: 5000 },
    );
    console.log(`TEST PASS: Gable ${material} → ${rsi}`);
  }

  await page.selectOption(`${dialogSel} select[name="gableSheathingMaterial"]`, "User specified");
  await page.waitForFunction(
    ({ dialogSel }) => {
      const value = document.querySelector(`${dialogSel} input[name="gableSheathingValue"]`);
      return value && value.disabled === false && value.value === "";
    },
    { dialogSel },
    { timeout: 5000 },
  );
  console.log("TEST PASS: Gable User specified → blank editable Value");

  await page.fill(`${dialogSel} input[name="gableSheathingValue"]`, "0.200");
  await page.selectOption(`${dialogSel} select[name="gableSheathingMaterial"]`, "Plywood/Part. bd 9.5 mm (3/8 in)");
  await page.waitForFunction(
    ({ dialogSel }) => document.querySelector(`${dialogSel} input[name="gableSheathingValue"]`)?.value === "0.083",
    { dialogSel },
    { timeout: 5000 },
  );
  await page.selectOption(`${dialogSel} select[name="gableSheathingMaterial"]`, "User specified");
  await page.waitForFunction(
    ({ dialogSel }) => {
      const value = document.querySelector(`${dialogSel} input[name="gableSheathingValue"]`);
      return value && value.disabled === false && value.value === "0.200";
    },
    { dialogSel },
    { timeout: 5000 },
  );
  console.log("TEST PASS: Gable User specified custom value restored after switching back");

  await page.selectOption(`${dialogSel} select[name="slopedSheathingMaterial"]`, "Gypsum sheathing 12.7 mm (1/2 in)");
  await page.waitForFunction(
    ({ dialogSel }) => document.querySelector(`${dialogSel} input[name="slopedSheathingValue"]`)?.value === "0.079",
    { dialogSel },
    { timeout: 5000 },
  );
  const gableAfterSlopedChange = await page.inputValue(`${dialogSel} select[name="gableSheathingMaterial"]`);
  assert(gableAfterSlopedChange === "User specified", "Gable selection should stay independent from Sloped changes");
  console.log("TEST PASS: Gable and Sloped selections remain independent");

  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterSave = await readSheathingPair(page, "gableSheathingMaterial");
  assert(afterSave.material === "User specified", "saved gable material should persist");
  assert(afterSave.value === "0.200", `saved gable custom value should persist, got ${afterSave.value}`);
  const afterSaveSloped = await readSheathingPair(page, "slopedSheathingMaterial");
  assert(afterSaveSloped.material === "Gypsum sheathing 12.7 mm (1/2 in)", "saved sloped material should persist");
  assert(afterSaveSloped.value === "0.079", "saved sloped RSI should persist");
  console.log("TEST PASS: saved selections and values persist on reopen");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);
  const afterRefresh = await readSheathingPair(page, "gableSheathingMaterial");
  assert(afterRefresh.material === "User specified", "selection should persist after refresh");
  assert(afterRefresh.value === "0.200", "custom value should persist after refresh");
  console.log("TEST PASS: session-restored values preserved after refresh");

  console.log("sheathing-material-rsi-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
