import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readStates(page) {
  return page.evaluate(({ roofSel, btnSel }) => {
    const roof = document.querySelector(roofSel);
    const btn = document.querySelector(btnSel);
    return {
      defaultRoofCavityChecked: !!roof?.checked,
      inputsDisabled: !!btn?.disabled,
    };
  }, { roofSel: defaultRoofCavityPath, btnSel: inputsBtn });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  await page.locator(defaultRoofCavityPath).scrollIntoViewIfNeeded();

  let state = await readStates(page);
  assert(state.defaultRoofCavityChecked, "expected Default Roof Cavity Inputs checked");
  assert(state.inputsDisabled, "expected Inputs disabled when checked");
  console.log("TEST 1 PASS: new/default file has checked checkbox and disabled Inputs");

  await page.uncheck(defaultRoofCavityPath);
  state = await readStates(page);
  assert(!state.defaultRoofCavityChecked, "checkbox should be unchecked");
  assert(!state.inputsDisabled, "Inputs should be enabled immediately after uncheck");
  console.log("TEST 2 PASS: unchecking enables Inputs immediately");

  await page.check(defaultRoofCavityPath);
  state = await readStates(page);
  assert(state.defaultRoofCavityChecked, "checkbox should be checked again");
  assert(state.inputsDisabled, "Inputs should be disabled immediately after re-check");
  console.log("TEST 3 PASS: checking again disables Inputs immediately");

  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 5000 });
  state = await readStates(page);
  assert(state.defaultRoofCavityChecked, "checkbox should remain checked after navigation");
  assert(state.inputsDisabled, "Inputs should remain disabled after navigation");
  console.log("TEST 4 PASS: button state matches checkbox after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  state = await readStates(page);
  assert(state.defaultRoofCavityChecked, "restored checkbox should remain checked");
  assert(state.inputsDisabled, "Inputs should be disabled from restored checked state");
  console.log("TEST 5 PASS: refresh restores checkbox and derives Inputs disabled state");

  await page.uncheck(defaultRoofCavityPath);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  state = await readStates(page);
  assert(!state.defaultRoofCavityChecked, "restored checkbox should remain unchecked");
  assert(!state.inputsDisabled, "Inputs should be enabled from restored unchecked state");
  console.log("TEST 5b PASS: refresh preserves unchecked state and enables Inputs");

  console.log("roof-cavity-inputs-toggle-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
