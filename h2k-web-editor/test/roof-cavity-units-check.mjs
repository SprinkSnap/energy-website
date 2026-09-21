import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const unitModeSel = "#unitMode";

const FIELD_NAMES = [
  "gableTotalArea",
  "gableSheathingValue",
  "gableExteriorValue",
  "slopedTotalArea",
  "slopedSheathingValue",
  "slopedRoofingValue",
  "slopedCavityVolume",
  "slopedVentilationRate",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setUnitMode(page, mode) {
  await page.selectOption(unitModeSel, mode);
  await page.waitForFunction(
    (expected) => {
      const toolbar = document.getElementById("unitMode");
      return toolbar?.value === expected;
    },
    mode,
    { timeout: 5000 },
  );
}

async function openDialog(page) {
  await page.uncheck(defaultRoofCavityPath);
  await page.click(inputsBtn);
  await page.waitForSelector(`${dialogSel}[open]`, { timeout: 5000 });
}

async function readUnitLabels(page) {
  return page.evaluate(({ dialogSel, fieldNames }) => {
    const labels = {};
    for (const name of fieldNames) {
      const input = document.querySelector(`${dialogSel} input[name="${name}"]`);
      labels[name] = input?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    }
    return labels;
  }, { dialogSel, fieldNames: FIELD_NAMES });
}

function expectMetricLabels(labels) {
  assert(labels.gableTotalArea === "Total Area (m²)", `expected gable Total Area (m²), got ${labels.gableTotalArea}`);
  assert(labels.slopedTotalArea === "Total Area (m²)", `expected sloped Total Area (m²), got ${labels.slopedTotalArea}`);
  assert(labels.gableSheathingValue === "Value (RSI)", `expected gable sheathing Value (RSI), got ${labels.gableSheathingValue}`);
  assert(labels.gableExteriorValue === "Value (RSI)", `expected gable exterior Value (RSI), got ${labels.gableExteriorValue}`);
  assert(labels.slopedSheathingValue === "Value (RSI)", `expected sloped sheathing Value (RSI), got ${labels.slopedSheathingValue}`);
  assert(labels.slopedRoofingValue === "Value (RSI)", `expected sloped roofing Value (RSI), got ${labels.slopedRoofingValue}`);
  assert(labels.slopedCavityVolume === "Cavity Volume (m³)", `expected Cavity Volume (m³), got ${labels.slopedCavityVolume}`);
  assert(labels.slopedVentilationRate === "Ventilation Rate (ACH)", `expected Ventilation Rate (ACH), got ${labels.slopedVentilationRate}`);
}

function expectImperialLabels(labels) {
  assert(labels.gableTotalArea === "Total Area (ft²)", `expected gable Total Area (ft²), got ${labels.gableTotalArea}`);
  assert(labels.slopedTotalArea === "Total Area (ft²)", `expected sloped Total Area (ft²), got ${labels.slopedTotalArea}`);
  assert(labels.gableSheathingValue === "Value (R)", `expected gable sheathing Value (R), got ${labels.gableSheathingValue}`);
  assert(labels.gableExteriorValue === "Value (R)", `expected gable exterior Value (R), got ${labels.gableExteriorValue}`);
  assert(labels.slopedSheathingValue === "Value (R)", `expected sloped sheathing Value (R), got ${labels.slopedSheathingValue}`);
  assert(labels.slopedRoofingValue === "Value (R)", `expected sloped roofing Value (R), got ${labels.slopedRoofingValue}`);
  assert(labels.slopedCavityVolume === "Cavity Volume (ft³)", `expected Cavity Volume (ft³), got ${labels.slopedCavityVolume}`);
  assert(labels.slopedVentilationRate === "Ventilation Rate (ACH)", `expected Ventilation Rate (ACH), got ${labels.slopedVentilationRate}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });

  await setUnitMode(page, "metric");
  await openDialog(page);
  const metricLabels = await readUnitLabels(page);
  expectMetricLabels(metricLabels);
  console.log("TEST 1 PASS: Metric unit labels in Roof Cavity Inputs");

  await page.click(`${dialogSel} [data-close-roof-cavity-inputs]`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });

  await setUnitMode(page, "imperial");
  await openDialog(page);
  const imperialLabels = await readUnitLabels(page);
  expectImperialLabels(imperialLabels);
  console.log("TEST 2 PASS: Imperial unit labels in Roof Cavity Inputs");

  await setUnitMode(page, "metric");
  let liveLabels = await readUnitLabels(page);
  expectMetricLabels(liveLabels);
  assert(await page.evaluate((sel) => !!document.querySelector(sel)?.open, dialogSel), "dialog should remain open during live unit switch");
  console.log("TEST 4 PASS: Imperial → Metric live label update without closing dialog");

  await setUnitMode(page, "imperial");
  liveLabels = await readUnitLabels(page);
  expectImperialLabels(liveLabels);
  assert(await page.evaluate((sel) => !!document.querySelector(sel)?.open, dialogSel), "dialog should remain open during live unit switch");
  console.log("TEST 3 PASS: Metric → Imperial live label update without closing dialog");

  console.log("TEST 5 PASS: Gable Ends and Sloped Roof both use correct units");
  console.log("roof-cavity-units-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
