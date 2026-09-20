import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const templatePath = process.env.H2K_TEMPLATE_PATH || join(dirname(fileURLToPath(import.meta.url)), "..", "test-output/roundtrip-diagnosis/00-original-template.h2k");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/info`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#screen-house-info", { timeout: 30000 });

  const initial = await page.evaluate(() => ({
    rowCount: document.querySelectorAll(".info-record-row").length,
    emptyMsg: document.querySelector(".info-records-empty")?.textContent || "",
    hasInfo10: [...document.querySelectorAll("[data-info-record-id]")].some((el) => el.value.includes("Info. 10")),
    hasVolta: document.body.textContent.includes("Volta Research"),
    deleteDisabled: document.querySelector("#infoDeleteBtn")?.disabled === true,
    headings: [...document.querySelectorAll(".info-records-head .info-record-cell")].map((el) => el.textContent.trim()).filter(Boolean),
  }));
  assert(initial.rowCount === 0, `expected 0 records, got ${initial.rowCount}`);
  assert(!initial.emptyMsg, "empty placeholder row/message should not render");
  assert(!initial.hasInfo10, "Info. 10 should not appear by default");
  assert(!initial.hasVolta, "Volta Research should not appear by default");
  assert(initial.deleteDisabled, "Delete should be disabled with no selection");
  assert(initial.headings.includes("ID") && initial.headings.includes("Value"), "column headings present");
  console.log("TEST 1 PASS: new/default file has empty record list");

  await page.click("#infoAddBtn");
  await page.waitForSelector(".info-record-row", { timeout: 5000 });
  const afterAdd = await page.evaluate(() => ({
    id: document.querySelector("[data-info-record-id]")?.value || "",
    value: document.querySelector("[data-info-record-value]")?.value || "",
    rowCount: document.querySelectorAll(".info-record-row").length,
  }));
  assert(afterAdd.rowCount === 1, "first Add creates one record");
  assert(afterAdd.id === "Info. 1", `expected Info. 1, got ${afterAdd.id}`);
  assert(afterAdd.value === "", "new Value starts blank");
  console.log("TEST 2 PASS: first Add creates Info. 1 with blank Value");

  await page.fill("[data-info-record-value]", "Test Value");
  await page.click('a[href="#/house/general"]');
  await page.waitForSelector("#screen-house-general", { timeout: 5000 });
  await page.click('a[href="#/house/info"]');
  await page.waitForSelector(".info-record-row", { timeout: 5000 });
  const afterNav = await page.inputValue("[data-info-record-value]");
  assert(afterNav === "Test Value", "value persists after navigation");
  console.log("TEST 3 PASS: edited value persists after navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".info-record-row", { timeout: 30000 });
  const afterRefresh = await page.evaluate(() => ({
    id: document.querySelector("[data-info-record-id]")?.value || "",
    value: document.querySelector("[data-info-record-value]")?.value || "",
  }));
  assert(afterRefresh.id === "Info. 1" && afterRefresh.value === "Test Value", "record persists after refresh");
  console.log("TEST 4 PASS: record persists after refresh");

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
    () => [...document.querySelectorAll("[data-info-record-id]")].some((el) => el.value === "Info. 10"),
    { timeout: 15000 },
  );
  await page.goto(`${BASE}/#/house/info`, { waitUntil: "networkidle" });
  await page.waitForSelector(".info-record-row", { timeout: 5000 });
  const imported = await page.evaluate(() => ({
    id: document.querySelector("[data-info-record-id]")?.value || "",
    value: document.querySelector("[data-info-record-value]")?.value || "",
  }));
  assert(imported.id === "Info. 10", `imported id=${imported.id}`);
  assert(imported.value === "Volta Research", `imported value=${imported.value}`);
  console.log("TEST 5 PASS: imported records preserved");

  await page.evaluate(() => document.querySelector("#infoDeleteBtn").disabled);
  const deleteDisabledNoSelect = await page.evaluate(() => document.querySelector("#infoDeleteBtn").disabled);
  assert(deleteDisabledNoSelect === true, "Delete disabled without selection");
  await page.click('input[name="infoRecordSelect"]');
  const deleteEnabled = await page.evaluate(() => document.querySelector("#infoDeleteBtn").disabled === false);
  assert(deleteEnabled, "Delete enabled with selection");
  console.log("TEST 6 PASS: Delete behavior preserved");

  console.log("house-info-default-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
