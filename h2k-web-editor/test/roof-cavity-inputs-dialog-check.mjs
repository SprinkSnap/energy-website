import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const defaultRoofCavityPath = '[data-xml-path="/HouseFile/House/Specifications/@defaultRoofCavity"]';
const inputsBtn = ".specifications-roof-cavity-inputs-btn";
const dialogSel = "#roofCavityInputsDialog";
const WIDTHS = [375, 430, 768, 1024, 1440];

const EXPECTED_LABELS = [
  "Gable Ends",
  "Sloped Roof",
  "Total Area",
  "Sheathing Material",
  "Exterior Material",
  "Roofing Material",
  "Cavity Volume",
  "Ventilation Rate",
  "Value",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readBtnDisabled(page) {
  return page.evaluate((sel) => !!document.querySelector(sel)?.disabled, inputsBtn);
}

async function openDialog(page) {
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

  assert(await readBtnDisabled(page), "expected Inputs disabled when checked");
  console.log("TEST 1 PASS: Default Roof Cavity Inputs checked → Inputs disabled");

  await page.uncheck(defaultRoofCavityPath);
  assert(!(await readBtnDisabled(page)), "expected Inputs enabled after uncheck");
  console.log("TEST 2 PASS: unchecking enables Inputs immediately");

  await openDialog(page);
  const dialogText = await page.locator(dialogSel).innerText();
  const normalized = dialogText.toLowerCase();
  for (const label of EXPECTED_LABELS) {
    assert(normalized.includes(label.toLowerCase()), `dialog missing label: ${label}`);
  }
  assert((await page.locator(`${dialogSel} select[data-options-status="not-captured"]`).count()) >= 2, "expected remaining not-captured material selects");
  console.log("TEST 3/4 PASS: Inputs opens Roof Cavity Inputs dialog with required groups/fields");

  await page.fill(`${dialogSel} input[name="gableTotalArea"]`, "12.34");
  await page.click(`${dialogSel} [data-close-roof-cavity-inputs]`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterCancel = await page.inputValue(`${dialogSel} input[name="gableTotalArea"]`);
  assert(afterCancel === "0.00", `Cancel should discard edits, got ${afterCancel}`);
  console.log("TEST 5 PASS: Cancel closes without committing edits");

  await page.fill(`${dialogSel} input[name="gableTotalArea"]`, "15.50");
  await page.click(`${dialogSel} #saveRoofCavityInputsBtn`);
  await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
  await openDialog(page);
  const afterOk = await page.inputValue(`${dialogSel} input[name="gableTotalArea"]`);
  assert(afterOk === "15.50", `OK should persist edits, got ${afterOk}`);
  await page.click(`${dialogSel} [data-close-roof-cavity-inputs]`);
  console.log("TEST 6 PASS: OK commits edits to editor state");

  await page.check(defaultRoofCavityPath);
  assert(await readBtnDisabled(page), "expected Inputs disabled after re-check");
  console.log("TEST 3 (re-check) PASS: checking again disables Inputs immediately");

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.uncheck(defaultRoofCavityPath);
    await openDialog(page);
    const metrics = await page.evaluate((sel) => {
      const dialog = document.querySelector(sel);
      const body = dialog?.querySelector(".roof-cavity-inputs-fields");
      return {
        dialogOpen: !!dialog?.open,
        overflowX: body ? body.scrollWidth > body.clientWidth + 1 : false,
        minTouch: [...(dialog?.querySelectorAll("input,select,button") || [])].every((el) => {
          const h = el.getBoundingClientRect().height;
          return h === 0 || h >= 40;
        }),
      };
    }, dialogSel);
    assert(metrics.dialogOpen, `${width}px dialog should open`);
    assert(!metrics.overflowX, `${width}px horizontal overflow detected`);
    assert(metrics.minTouch, `${width}px touch targets too small`);
    await page.click(`${dialogSel} [data-close-roof-cavity-inputs]`);
    await page.waitForFunction(() => !document.getElementById("roofCavityInputsDialog")?.open, { timeout: 5000 });
    console.log(`Responsive ${width}px PASS`);
  }

  console.log("roof-cavity-inputs-dialog-check.mjs: all assertions passed");
} finally {
  await browser.close();
}
