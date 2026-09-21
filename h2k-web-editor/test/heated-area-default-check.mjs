import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

const aboveInput = '[data-xml-path="/HouseFile/House/Specifications/HeatedFloorArea/@aboveGrade"]';
const belowInput = '[data-xml-path="/HouseFile/House/Specifications/HeatedFloorArea/@belowGrade"]';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickValidate(page) {
  await page.click("#validateBtn");
  await page.waitForSelector("#validationResult.validation", { timeout: 5000 });
}

async function validationText(page) {
  return page.locator("#validationResult").innerText();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(aboveInput, { timeout: 30000 });
  await page.locator(aboveInput).scrollIntoViewIfNeeded();

  const initialAbove = await page.inputValue(aboveInput);
  const initialBelow = await page.inputValue(belowInput);
  assert(initialAbove === "", `expected blank above-grade, got "${initialAbove}"`);
  assert(initialBelow === "", `expected blank below-grade, got "${initialBelow}"`);
  console.log("TEST 1 PASS: new/default heated areas are blank");

  await clickValidate(page);
  const blankValidation = await validationText(page);
  assert(blankValidation.includes("Above-grade heated area is required."), "missing above-grade required error");
  assert(blankValidation.includes("Below-grade heated area is required."), "missing below-grade required error");
  assert(blankValidation.includes("blocking issue"), "expected validation failure");
  console.log("TEST 2 PASS: validation fails with both required errors when blank");

  await page.fill(aboveInput, "1800");
  await page.locator(aboveInput).dispatchEvent("change");
  await clickValidate(page);
  const partialValidation = await validationText(page);
  assert(partialValidation.includes("Below-grade heated area is required."), "missing below-grade required error");
  assert(!partialValidation.includes("Above-grade heated area is required."), "above-grade should not be required once filled");
  console.log("TEST 3 PASS: below-grade remains required when only above-grade is filled");

  await page.fill(belowInput, "900");
  await page.locator(belowInput).dispatchEvent("change");
  await clickValidate(page);
  const fullValidation = await validationText(page);
  assert(!fullValidation.includes("Above-grade heated area is required."), fullValidation);
  assert(!fullValidation.includes("Below-grade heated area is required."), fullValidation);
  console.log("TEST 4 PASS: required validation passes when both fields are filled");

  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(aboveInput, { timeout: 5000 });
  const afterNavAbove = await page.inputValue(aboveInput);
  const afterNavBelow = await page.inputValue(belowInput);
  assert(afterNavAbove === "1800", `expected above=1800 after navigation, got ${afterNavAbove}`);
  assert(afterNavBelow === "900", `expected below=900 after navigation, got ${afterNavBelow}`);
  console.log("TEST 5 PASS: entered heated-area values persist after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(aboveInput, { timeout: 30000 });
  const afterRefreshAbove = await page.inputValue(aboveInput);
  const afterRefreshBelow = await page.inputValue(belowInput);
  assert(afterRefreshAbove === "1800", `expected above=1800 after refresh, got ${afterRefreshAbove}`);
  assert(afterRefreshBelow === "900", `expected below=900 after refresh, got ${afterRefreshBelow}`);
  console.log("TEST 6 PASS: entered heated-area values persist after refresh");

  const importedXml = readFileSync(templatePath, "utf8").replace(
    /<HeatedFloorArea aboveGrade="158\.6" belowGrade="77\.3"\s*\/>/,
    `<HeatedFloorArea aboveGrade="200" belowGrade="100"/>`,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "import-heated-area.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => {
      const value = document.querySelector(sel)?.value || "";
      return value !== "" && value !== "1800";
    },
    aboveInput,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(aboveInput, { timeout: 5000 });
  const importedAbove = await page.inputValue(aboveInput);
  const importedBelow = await page.inputValue(belowInput);
  assert(importedAbove !== "", "imported above-grade should not be blank");
  assert(importedBelow !== "", "imported below-grade should not be blank");
  assert(importedAbove !== "1800", "imported above-grade should not be overwritten by session values");
  assert(importedBelow !== "900", "imported below-grade should not be overwritten by session values");
  console.log(`TEST 7 PASS: imported heated-area values preserved (above=${importedAbove}, below=${importedBelow})`);

  console.log("heated-area-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
