import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const SESSION_KEY = "h2k-web-editor-session-v1";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const selectSel = `${dialogSel} select[name="slopedRoofingMaterial"]`;
const valueSel = `${dialogSel} input[name="slopedRoofingValue"]`;
const exteriorSel = `${dialogSel} select[name="gableExteriorMaterial"]`;
const sheathingSel = `${dialogSel} select[name="slopedSheathingMaterial"]`;

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

const PREDEFINED_MAPPINGS = [
  ["Asphalt shingles", "0.078"],
  ["Asphalt roll roofing", "0.026"],
  ["Built-up membrane", "0.058"],
  ["Clay tile", "0.200"],
  ["Crushed stone (not dried)", "0.150"],
  ["Metal roofing", "0.110"],
  ["Slate", "0.009"],
  ["Wood shingles", "0.165"],
];

const DEFAULT_MATERIAL = "Asphalt shingles";
const DEFAULT_VALUE = "0.078";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openDialog(page) {
  await page.uncheck(defaultRoofCavityPath);
  await page.click(inputsBtn);
  await page.waitForSelector(`${dialogSel}[open]`, { timeout: 5000 });
}

async function readRoofingPair(page) {
  return page.evaluate(({ selectSel, valueSel }) => {
    const material = document.querySelector(selectSel);
    const value = document.querySelector(valueSel);
    return {
      disabled: !!material?.disabled,
      readOnly: material?.ariaReadOnly === "true",
      optionsStatus: material?.dataset.optionsStatus || "",
      mappingStatus: material?.dataset.mappingStatus || "",
      material: material?.value || "",
      value: value?.value ?? "",
      valueDisabled: !!value?.disabled,
      optionLabels: [...(material?.options || [])].map((o) => o.textContent),
    };
  }, { selectSel, valueSel });
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

  const initial = await readRoofingPair(page);
  const exteriorSelected = await page.inputValue(exteriorSel);
  const sheathingSelected = await page.inputValue(sheathingSel);

  assert(!initial.disabled, "Sloped Roof Roofing Material should be enabled");
  assert(!initial.readOnly, "Sloped Roof Roofing Material should not be read-only");
  assert(initial.optionsStatus === "captured", `expected captured options, got ${initial.optionsStatus}`);
  assert(initial.mappingStatus === "mapped", `expected mapped values, got ${initial.mappingStatus}`);
  assert(initial.material === DEFAULT_MATERIAL, `expected default ${DEFAULT_MATERIAL}, got ${initial.material}`);
  assert(initial.value === DEFAULT_VALUE, `expected default Value ${DEFAULT_VALUE}, got ${initial.value}`);
  assert(initial.valueDisabled, "predefined default value should be read-only");
  assert(exteriorSelected === "Hollow metal/vinyl cladding", "Exterior Material should remain unchanged");
  assert(sheathingSelected === "Plywood/Part. bd 12.7 mm (1/2 in)", "Sheathing Material should remain unchanged");
  assert(initial.optionLabels.length === 9, `expected 9 options, got ${initial.optionLabels.length}`);
  for (let i = 0; i < EXPECTED_OPTIONS.length; i += 1) {
    assert(initial.optionLabels[i] === EXPECTED_OPTIONS[i], `option ${i + 1}: expected "${EXPECTED_OPTIONS[i]}", got "${initial.optionLabels[i]}"`);
  }
  console.log("TEST 1 PASS: new-file defaults, 9 options, and read-only predefined value");

  for (const [material, rsi] of PREDEFINED_MAPPINGS) {
    await page.selectOption(selectSel, material);
    await page.waitForFunction(
      ({ valueSel, rsi }) => {
        const value = document.querySelector(valueSel);
        return value?.value === rsi && value?.disabled === true;
      },
      { valueSel, rsi },
      { timeout: 5000 },
    );
    console.log(`TEST PASS: ${material} → ${rsi}`);
  }

  await page.selectOption(selectSel, "User specified");
  await page.waitForFunction(
    ({ valueSel }) => {
      const value = document.querySelector(valueSel);
      return value && value.disabled === false && value.value === "";
    },
    { valueSel },
    { timeout: 5000 },
  );
  console.log("TEST PASS: User specified → blank editable Value");

  await page.fill(valueSel, "0.250");
  await page.selectOption(selectSel, "Slate");
  await page.waitForFunction(
    ({ valueSel }) => document.querySelector(valueSel)?.value === "0.009",
    { valueSel },
    { timeout: 5000 },
  );
  await page.selectOption(selectSel, "User specified");
  await page.waitForFunction(
    ({ valueSel }) => {
      const value = document.querySelector(valueSel);
      return value && value.disabled === false && value.value === "0.250";
    },
    { valueSel },
    { timeout: 5000 },
  );
  console.log("TEST PASS: User specified custom value restored after switching back");

  await page.selectOption(selectSel, "Clay tile");
  await page.waitForFunction(
    ({ valueSel }) => document.querySelector(valueSel)?.value === "0.200",
    { valueSel },
    { timeout: 5000 },
  );
  const sheathingAfterRoofingChange = await page.inputValue(sheathingSel);
  assert(sheathingAfterRoofingChange === "Plywood/Part. bd 12.7 mm (1/2 in)", "Sheathing selection should stay independent from Roofing changes");
  console.log("TEST PASS: Roofing and Sheathing selections remain independent");

  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterSave = await readRoofingPair(page);
  assert(afterSave.material === "Clay tile", "saved roofing material should persist");
  assert(afterSave.value === "0.200", `saved predefined value should persist, got ${afterSave.value}`);
  assert(afterSave.valueDisabled, "saved predefined value should remain read-only");
  console.log("TEST PASS: saved selections and values persist on reopen");

  await page.evaluate(({ key, restoredMaterial, restoredValue, customValue }) => {
    const raw = sessionStorage.getItem(key);
    if (!raw) throw new Error("missing session payload");
    const data = JSON.parse(raw);
    data.roofCavityInputs = data.roofCavityInputs || {};
    data.roofCavityInputs.slopedRoof = data.roofCavityInputs.slopedRoof || {};
    data.roofCavityInputs.slopedRoof.roofingMaterial = restoredMaterial;
    data.roofCavityInputs.slopedRoof.roofingValue = restoredValue;
    data.roofCavityInputs.slopedRoof.roofingUserSpecifiedValue = customValue;
    sessionStorage.setItem(key, JSON.stringify(data));
  }, {
    key: SESSION_KEY,
    restoredMaterial: "User specified",
    restoredValue: "0.333",
    customValue: "0.333",
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);
  const restoredCustom = await readRoofingPair(page);
  assert(restoredCustom.material === "User specified", `expected restored User specified, got ${restoredCustom.material}`);
  assert(restoredCustom.value === "0.333", `expected restored custom value 0.333, got ${restoredCustom.value}`);
  assert(!restoredCustom.valueDisabled, "restored User specified value should be editable");
  console.log("TEST PASS: session-restored User specified value preserved after refresh");

  await page.evaluate(({ key }) => {
    const raw = sessionStorage.getItem(key);
    const data = JSON.parse(raw);
    data.roofCavityInputs.slopedRoof.roofingMaterial = "Metal roofing";
    data.roofCavityInputs.slopedRoof.roofingValue = "0.999";
    sessionStorage.setItem(key, JSON.stringify(data));
  }, { key: SESSION_KEY });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await openDialog(page);
  const normalizedPredefined = await readRoofingPair(page);
  assert(normalizedPredefined.material === "Metal roofing", "restored predefined material should load");
  assert(normalizedPredefined.value === "0.110", `predefined value should normalize to 0.110, got ${normalizedPredefined.value}`);
  assert(normalizedPredefined.valueDisabled, "restored predefined value should be read-only");
  console.log("TEST PASS: saved predefined material normalizes value from mapping");

  console.log("sloped-roof-roofing-material-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
