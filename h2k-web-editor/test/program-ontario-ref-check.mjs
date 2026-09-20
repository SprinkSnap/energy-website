/**
 * Verify Ontario Reference House Program mobile-first inventory UI,
 * synchronization, program switching, and responsive layout.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];
const ONTARIO_REQUIRED_LABELS = [
  "Apply household operating conditions",
  "Apply reduced operating conditions",
  "Atypical electrical loads",
  "Water conservation",
  "Reference house",
  "Greener Homes",
  "Remote communities",
  "Evaluation cost",
  "Vermiculite",
  "Smart thermostats",
  "Basement slab insulated",
  "Moisture-proof crawl space",
  "Waterproofing",
  "Backwater valve",
  "Sump pump",
  "Electrical panel upgraded",
  "RUR comments",
];
const ONTARIO_GROUP_TITLES = [
  "Program Options",
];
const ERS2020_ONLY_MARKERS = [
  "Apply Household Operating Conditions",
  "Indicate presence of Vermiculite:",
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
    (id) => document.getElementById("programMode")?.value === id,
    { timeout: 30000 },
    modeId,
  );
  await new Promise((r) => setTimeout(r, 350));
}

async function waitForProgramLayout(page, modeId) {
  const selector = modeId === "ers2020nbc"
    ? '.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'
    : `.program-ontario-ref-layout[data-program-mode="${modeId}"]`;
  await page.waitForSelector(selector, { timeout: 90000 });
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

  await setProgramMode(page, "ontarioRef");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ontarioRef");

  await setProgramMode(page, "ers2020nbc");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers2020nbc");
  const switchToErs = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'),
    hasOntario: !!document.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]'),
  }));

  await setProgramMode(page, "ontarioRef");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ontarioRef");
  const switchBackOntario = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'),
    hasOntario: !!document.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]'),
  }));

  await page.goto(`${base}/index.html#/house/unit-mode`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("[data-unit-mode-programs]", { timeout: 90000 });
  const sync = await page.evaluate(async () => {
    const readIds = () => ({
      toolbar: document.getElementById("programMode")?.value || "",
      menu: document.getElementById("programModeMenu")?.value || "",
      unitMode: document.querySelector("[data-unit-mode-programs]")?.value || "",
    });
    const before = readIds();
    const unitSel = document.querySelector("[data-unit-mode-programs]");
    unitSel.value = "ontarioRef";
    unitSel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const afterUnitMode = readIds();
    return { before, afterUnitMode };
  });

  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ontarioRef");

  await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await waitForProgramLayout(page, "ontarioRef");

  const refresh = await page.evaluate(() => ({
    toolbar: document.getElementById("programMode")?.value || "",
    unitMode: document.querySelector("[data-unit-mode-programs]")?.value || "",
    modeAttr: document.querySelector(".program-ontario-ref-layout")?.dataset?.programMode || "",
  }));

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));

    const metrics = await page.evaluate((requiredLabels, groupTitles, ersOnlyMarkers, viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-systems-program");
      const layout = section?.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]');
      const text = section?.textContent || "";
      const hasErsLayout = !!section?.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]');
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const groups = layout?.querySelectorAll(".spec-group h4")?.length || 0;
      const groupTitlesFound = groupTitles.every((title) => text.includes(title));
      const ersLeak = ersOnlyMarkers.some((label) => text.includes(label));
      const toolbar = document.getElementById("programMode")?.value || "";
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const checks = [...(layout?.querySelectorAll(".check") || [])].filter(isVisible);
      const tappableChecks = checks.length > 0 && checks.every((el) => el.getBoundingClientRect().height >= 39);
      const selects = [...(layout?.querySelectorAll("select") || [])].filter(isVisible);
      const selectsOk = selects.length > 0 && selects.every((el) => el.getBoundingClientRect().height >= 39);
      const labels = [...(layout?.querySelectorAll(".field>span") || [])].filter(isVisible);
      const clippedLabels = labels.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 1;
      });
      const inputs = [...(layout?.querySelectorAll('input[type="text"]') || [])].filter(isVisible);
      const clippedInputs = inputs.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 1;
      });
      const oneColumn = viewportWidth < 768
        ? [...(layout?.querySelectorAll(".form-grid") || [])].every((grid) => {
            const style = window.getComputedStyle(grid);
            return style.gridTemplateColumns.split(" ").length <= 1
              || style.gridTemplateColumns === "none"
              || !style.gridTemplateColumns.includes("repeat(2");
          })
        : true;
      return {
        overflow,
        hasErsLayout,
        missingLabels,
        groups,
        groupTitlesFound,
        ersLeak,
        tappableChecks,
        selectsOk,
        clippedLabels,
        clippedInputs,
        oneColumn,
        toolbar,
        toolbarOntario: toolbar === "ontarioRef",
      };
    }, ONTARIO_REQUIRED_LABELS, ONTARIO_GROUP_TITLES, ERS2020_ONLY_MARKERS, width);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.hasErsLayout &&
      metrics.missingLabels.length === 0 &&
      metrics.groups === 1 &&
      metrics.groupTitlesFound &&
      !metrics.ersLeak &&
      metrics.tappableChecks &&
      metrics.selectsOk &&
      !metrics.clippedLabels &&
      !metrics.clippedInputs &&
      metrics.oneColumn &&
      metrics.toolbarOntario;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  const switchPass =
    switchToErs.hasErs &&
    !switchToErs.hasOntario &&
    switchBackOntario.hasOntario &&
    !switchBackOntario.hasErs;
  const syncPass =
    sync.afterUnitMode.toolbar === "ontarioRef" &&
    sync.afterUnitMode.menu === "ontarioRef" &&
    sync.afterUnitMode.unitMode === "ontarioRef";
  const refreshPass = refresh.toolbar === "ontarioRef" && refresh.modeAttr === "ontarioRef";

  console.log(JSON.stringify({
    switchToErs,
    switchBackOntario,
    switchPass,
    sync,
    syncPass,
    refresh,
    refreshPass,
    results,
    horizontalOverflow,
    fieldCount: ONTARIO_REQUIRED_LABELS.length,
    inventorySource: "catalog/capture/hot2000-11.13/screens/program-ontario-reference-house.json",
  }, null, 2));

  if (!switchPass || !syncPass || !refreshPass || !WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
