import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || "/workspace/h2k-web-editor/test-output/roundtrip-diagnosis/00-original-template.h2k";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const storeysSelect = '[data-xml-path="/HouseFile/House/Specifications/Storeys"]';

try {
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(storeysSelect, { timeout: 30000 });

  const initial = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, storeysSelect);
  assert(initial.value === "1", `expected code 1, got ${initial.value}`);
  assert(initial.label === "One storey", `expected One storey, got ${initial.label}`);
  console.log("TEST 1 PASS: new/default Storeys = One storey");

  await page.selectOption(storeysSelect, "5");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/specifications"]');
  await page.waitForSelector(storeysSelect, { timeout: 5000 });
  const afterNav = await page.evaluate((sel) => document.querySelector(sel)?.value || "", storeysSelect);
  assert(afterNav === "5", `expected Three storeys code 5 after navigation, got ${afterNav}`);
  console.log("TEST 2 PASS: user selection persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(storeysSelect, { timeout: 30000 });
  const afterRefresh = await page.evaluate((sel) => document.querySelector(sel)?.value || "", storeysSelect);
  assert(afterRefresh === "5", `expected code 5 after refresh, got ${afterRefresh}`);
  console.log("TEST 3 PASS: Storeys persists after refresh");

  const importedXml = readFileSync(templatePath, "utf8");
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(async (xml) => {
    const file = new File([xml], "00-original-template.h2k", { type: "application/xml" });
    const input = document.getElementById("fileInput");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, importedXml);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "3",
    storeysSelect,
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/specifications`, { waitUntil: "networkidle" });
  await page.waitForSelector(storeysSelect, { timeout: 5000 });
  const imported = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const opt = el?.selectedOptions?.[0];
    return { value: el?.value || "", label: opt?.textContent?.trim() || "" };
  }, storeysSelect);
  assert(imported.value === "3", `imported code=${imported.value}`);
  assert(imported.label === "Two storeys", `imported label=${imported.label}`);
  console.log("TEST 4 PASS: imported Storeys preserved");

  console.log("storeys-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
