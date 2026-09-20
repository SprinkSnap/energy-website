import { chromium } from "playwright";

const BASE = process.env.H2K_BASE_URL || "http://localhost:8765";
const EXPECTED_CHECKS = [
  "Efficiency from nameplate",
  "Efficiency from combustion test",
  "Heating system correction",
  "Possession date:",
  "Heating volume decrease:",
  "Corrected insulation value in ceilings",
  "Corrected insulation value in walls",
  "Corrected insulation value in basement",
  "ACH correction",
  "Two blower doors used",
  "Other:",
  "18 months+",
  "ENERGY STAR:",
];
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitDialogClosed(page) {
  await page.waitForFunction(() => !document.getElementById("justificationsDialog").open);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${BASE}/#/house/general`, { waitUntil: "networkidle" });
  await page.waitForSelector("#editor-app:not([hidden])", { timeout: 30000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#justificationsBtn", { timeout: 30000 });

  await page.click("#justificationsBtn");
  await page.waitForSelector("#justificationsDialog[open]", { timeout: 5000 });

  const title = await page.textContent("#justificationsDialogTitle");
  assert(title.trim() === "Justifications", `title=${title}`);

  const cancelText = await page.textContent('[data-close-justifications].button.secondary');
  const okText = await page.textContent("#saveJustificationsBtn");
  assert(cancelText.trim() === "Cancel", "Cancel button");
  assert(okText.trim() === "OK", "OK button");

  const labels = await page.$$eval("#justificationsFields .check", (nodes) =>
    nodes.map((n) => n.textContent.replace(/\s+/g, " ").trim()),
  );
  assert(labels.length === 12, `expected 12 checkbox labels, got ${labels.length}`);
  for (let i = 0; i < EXPECTED_CHECKS.length - 1; i += 1) {
    assert(labels[i] === EXPECTED_CHECKS[i], `checkbox ${i + 1}: ${labels[i]}`);
  }

  const energyStarLabel = await page.textContent(".just-energystar > span");
  assert(energyStarLabel.trim() === "ENERGY STAR:", `energy star label=${energyStarLabel}`);

  const checkedCount = await page.locator('#justificationsFields input[type="checkbox"]:checked').count();
  assert(checkedCount === 0, "all checkboxes unchecked by default");

  const fieldValues = await page.$$eval(
    '#justificationsFields input:not([type="checkbox"])',
    (nodes) => nodes.map((n) => n.value),
  );
  assert(fieldValues.every((v) => v === ""), "associated fields blank by default");

  const disabledFields = await page.$$eval(
    '#justificationsFields input:not([type="checkbox"]), #justificationsFields select',
    (nodes) => nodes.map((n) => n.disabled),
  );
  assert(disabledFields.every(Boolean), "associated fields disabled by default");

  const optionCount = await page.locator('#justificationsFields select[name="energyStar"] option').count();
  assert(optionCount === 1, "ENERGY STAR has no invented options");

  await page.click('[data-close-justifications].button.secondary');
  await waitDialogClosed(page);

  await page.click("#justificationsBtn");
  await page.waitForSelector("#justificationsDialog[open]");
  await page.check('input[name="other"]');
  await page.fill('input[name="otherText"]', "Test note");
  await page.click("#saveJustificationsBtn");
  await waitDialogClosed(page);

  await page.click("#justificationsBtn");
  await page.waitForSelector("#justificationsDialog[open]");
  assert(await page.isChecked('input[name="other"]'), "OK persisted checkbox");
  assert((await page.inputValue('input[name="otherText"]')) === "Test note", "OK persisted text");

  const responsive = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    if (!(await page.evaluate(() => document.getElementById("justificationsDialog").open))) {
      await page.click("#justificationsBtn");
      await page.waitForSelector("#justificationsDialog[open]");
    }
    const metrics = await page.evaluate(() => {
      const dialog = document.getElementById("justificationsDialog");
      const rect = dialog.getBoundingClientRect();
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
      const actionsVisible = Boolean(dialog.querySelector(".dialog-actions")?.checkVisibility?.() ?? dialog.querySelector(".dialog-actions"));
      return {
        dialogWidth: rect.width,
        fitsViewport: rect.width <= window.innerWidth + 1,
        overflowX,
        actionsVisible,
      };
    });
    responsive[width] = metrics;
    assert(metrics.fitsViewport && !metrics.overflowX, `${width}px horizontal overflow`);
    assert(metrics.actionsVisible, `${width}px actions visible`);
    await page.click('[data-close-justifications].button.secondary');
    await waitDialogClosed(page);
  }

  console.log("justifications-dialog-check.mjs: all assertions passed");
  console.log(JSON.stringify({ responsive }, null, 2));
} finally {
  await browser.close();
}
