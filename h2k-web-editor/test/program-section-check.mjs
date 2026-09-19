/**
 * Verify Program section for EnerGuide Rating System 2020 NBC inventory,
 * canonical program synchronization, and responsive layout.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];
const REQUIRED_LABELS = [
  "Apply Household Operating Conditions",
  "Atypical Energy Loads",
  "Water Conservation",
  "Apply Reduced Operating Conditions And ENERGY STAR for New Homes",
  "Reference House",
  "Greener Homes",
  "Indicate presence of Vermiculite:",
  "Remote communities",
  "Evaluation cost:",
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
  ".mjs": "text/javascript",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = join(root, rel === "/" ? "index.html" : rel.replace(/^\//, ""));
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function setProgramMode(page, modeId) {
  await page.evaluate((id) => {
    const sel = document.getElementById("programMode");
    if (!sel) return;
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, modeId);
  await page.waitForFunction(
    (id) => {
      const prog = document.getElementById("programMode");
      return prog?.value === id;
    },
    { timeout: 30000 },
    modeId,
  );
  await new Promise((r) => setTimeout(r, 300));
}

async function run() {
  const puppeteerPaths = [
    "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  ];
  let puppeteer;
  for (const p of puppeteerPaths) {
    if (!existsSync(p)) continue;
    puppeteer = await import(pathToFileURL(p).href);
    break;
  }
  if (!puppeteer) throw new Error("Install puppeteer-core to run responsive checks");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await setProgramMode(page, "ers2020nbc");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(".program-ers2020nbc-layout", { timeout: 90000 });

  await page.goto(`${base}/index.html#/house/unit-mode`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("[data-unit-mode-programs]", { timeout: 90000 });

  const sync = await page.evaluate(async () => {
    const readIds = () => ({
      toolbar: document.getElementById("programMode")?.value || "",
      menu: document.getElementById("programModeMenu")?.value || "",
      unitMode: document.querySelector("[data-unit-mode-programs]")?.value || "",
    });
    const before = readIds();
    const toolbar = document.getElementById("programMode");
    toolbar.value = "ontarioRef";
    toolbar.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const afterToolbar = readIds();
    const unitSel = document.querySelector("[data-unit-mode-programs]");
    unitSel.value = "ers2020nbc";
    unitSel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const afterUnitMode = readIds();
    return { before, afterToolbar, afterUnitMode };
  });

  const syncPass =
    sync.before.toolbar === "ers2020nbc" &&
    sync.before.unitMode === "ers2020nbc" &&
    sync.afterToolbar.toolbar === "ontarioRef" &&
    sync.afterToolbar.menu === "ontarioRef" &&
    sync.afterToolbar.unitMode === "ontarioRef" &&
    sync.afterUnitMode.toolbar === "ers2020nbc" &&
    sync.afterUnitMode.menu === "ers2020nbc" &&
    sync.afterUnitMode.unitMode === "ers2020nbc";

  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(".program-ers2020nbc-layout", { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));

    const metrics = await page.evaluate((labelsRequired) => {
      const doc = document.documentElement;
      const viewportWidth = window.innerWidth;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-systems-program");
      const layout = section?.querySelector(".program-ers2020nbc-layout");
      const text = layout?.textContent || "";
      const missingLabels = labelsRequired.filter((label) => !text.includes(label));
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const groups = layout?.querySelectorAll(".program-ers2020nbc-layout > .spec-group").length || 0;
      const controls = [
        ...(layout?.querySelectorAll(".check") || []),
        ...(layout?.querySelectorAll(".field select") || []),
        ...(layout?.querySelectorAll(".program-evaluation-cost-row input") || []),
      ].filter(isVisible);
      const tappableControls = controls.every((el) => el.getBoundingClientRect().height >= 39);
      const clippedLabels = [...(layout?.querySelectorAll(".field > span, .check") || [])]
        .filter(isVisible)
        .some((el) => el.getBoundingClientRect().width < 8);
      const clippedInputs = controls.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 2 || r.width < 20;
      });
      const stackItems = [
        ...(layout?.querySelectorAll(".program-options-grid .check") || []),
        ...(layout?.querySelectorAll(".program-vermiculite-grid .field") || []),
        ...(layout?.querySelectorAll(".program-remote-grid .check") || []),
        ...(layout?.querySelectorAll(".program-evaluation-grid .field") || []),
      ].filter(isVisible);
      const oneColumn =
        viewportWidth >= 768
          ? true
          : stackItems.length < 2
            ? true
            : stackItems.every((el, i) => {
                if (i === 0) return true;
                const prev = stackItems[i - 1].getBoundingClientRect();
                const cur = el.getBoundingClientRect();
                return cur.top >= prev.bottom - 2;
              });
      const checks = [...(layout?.querySelectorAll(".check") || [])].filter(isVisible);
      const tappableChecks = checks.every((el) => el.getBoundingClientRect().height >= 39);
      const vermSelect = layout?.querySelector('[data-xml-path="/HouseFile/Program/Options/Main/Vermiculite"]');
      const vermOptions = vermSelect ? [...vermSelect.options].map((o) => o.textContent.trim()) : [];
      const inventedVermOptions = vermOptions.length > 1;
      const evalPrefix = layout?.querySelector(".program-evaluation-cost-prefix")?.textContent?.trim() === "$";
      const evalInput = layout?.querySelector(".program-evaluation-cost-row input");
      const evalInputOk = evalInput && isVisible(evalInput);
      const legacyResiliency = (section?.textContent || "").includes("Smart thermostats");
      const toolbar = document.getElementById("programMode")?.value || "";
      const unitMode = document.querySelector("[data-unit-mode-programs]")?.value || "";
      return {
        overflow,
        missingLabels,
        groups,
        tappableControls,
        tappableChecks,
        clippedLabels,
        clippedInputs,
        oneColumn,
        vermOptions,
        inventedVermOptions,
        evalPrefix,
        evalInputOk,
        legacyResiliency,
        toolbar,
        unitMode,
        synced: toolbar === unitMode && toolbar === "ers2020nbc",
      };
    }, REQUIRED_LABELS);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      metrics.missingLabels.length === 0 &&
      metrics.groups === 4 &&
      metrics.tappableControls &&
      metrics.tappableChecks &&
      !metrics.clippedLabels &&
      !metrics.clippedInputs &&
      metrics.oneColumn &&
      !metrics.inventedVermOptions &&
      metrics.evalPrefix &&
      metrics.evalInputOk &&
      !metrics.legacyResiliency &&
      metrics.synced;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ sync, syncPass, results, horizontalOverflow }, null, 2));
  if (!syncPass || !WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
