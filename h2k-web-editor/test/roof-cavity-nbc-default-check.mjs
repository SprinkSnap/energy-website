import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const eligibleNbcPath = '[data-xml-path="/HouseFile/House/Specifications/@eligibleForNBC"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

  const initial = await page.evaluate((roofSel, nbcSel, btnSel) => {
    const roof = document.querySelector(roofSel);
    const nbc = document.querySelector(nbcSel);
    const btn = document.querySelector(btnSel);
    return {
      defaultRoofCavityChecked: !!roof?.checked,
      defaultRoofCavityDisabled: !!roof?.disabled,
      eligibleNbcChecked: !!nbc?.checked,
      eligibleNbcDisabled: !!nbc?.disabled,
      inputsDisabled: !!btn?.disabled,
    };
  }, defaultRoofCavityPath, eligibleNbcPath, inputsBtn);

  assert(initial.defaultRoofCavityChecked, "expected Default Roof Cavity Inputs checked");
  assert(!initial.defaultRoofCavityDisabled, "expected Default Roof Cavity Inputs enabled");
  assert(!initial.eligibleNbcChecked, "expected Eligible for NBC Compliance unchecked");
  assert(!initial.eligibleNbcDisabled, "expected Eligible for NBC Compliance enabled");
  assert(initial.inputsDisabled, "expected Inputs button disabled");
  console.log("TEST 1 PASS: new/default roof cavity and NBC controls match HOT2000 screenshot");

  await page.uncheck(defaultRoofCavityPath);
  await page.locator(defaultRoofCavityPath).dispatchEvent("change");
  await page.check(eligibleNbcPath);
  await page.locator(eligibleNbcPath).dispatchEvent("change");

  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 5000 });

  const afterNav = await page.evaluate((roofSel, nbcSel) => ({
    defaultRoofCavityChecked: document.querySelector(roofSel)?.checked,
    eligibleNbcChecked: document.querySelector(nbcSel)?.checked,
  }), defaultRoofCavityPath, eligibleNbcPath);
  assert(afterNav.defaultRoofCavityChecked === false, "default roof cavity should stay unchecked after navigation");
  assert(afterNav.eligibleNbcChecked === true, "eligible NBC should stay checked after navigation");
  console.log("TEST 2 PASS: current state preserved after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 30000 });
  const afterRefresh = await page.evaluate((roofSel, nbcSel) => ({
    defaultRoofCavityChecked: document.querySelector(roofSel)?.checked,
    eligibleNbcChecked: document.querySelector(nbcSel)?.checked,
  }), defaultRoofCavityPath, eligibleNbcPath);
  assert(afterRefresh.defaultRoofCavityChecked === false, "default roof cavity should stay unchecked after refresh");
  assert(afterRefresh.eligibleNbcChecked === true, "eligible NBC should stay checked after refresh");
  console.log("TEST 3 PASS: current state preserved after refresh");

  const importedXml = readFileSync(templatePath, "utf8")
    .replace(/defaultRoofCavity="true"/, 'defaultRoofCavity="false"')
    .replace(/eligibleForNBC="false"/, 'eligibleForNBC="true"');
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-roof-cavity-nbc.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.checked === true,
    eligibleNbcPath,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(defaultRoofCavityPath, { timeout: 5000 });
  const imported = await page.evaluate((roofSel, nbcSel) => ({
    defaultRoofCavityChecked: document.querySelector(roofSel)?.checked,
    eligibleNbcChecked: document.querySelector(nbcSel)?.checked,
  }), defaultRoofCavityPath, eligibleNbcPath);
  assert(imported.defaultRoofCavityChecked === false, "imported defaultRoofCavity=false should be preserved");
  assert(imported.eligibleNbcChecked === true, "imported eligibleForNBC=true should be preserved");
  console.log("TEST 4 PASS: imported roof cavity / NBC values preserved");

  console.log("roof-cavity-nbc-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
