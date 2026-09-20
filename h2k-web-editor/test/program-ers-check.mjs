/**
 * Verify EnerGuide Rating System Program inventory UI, synchronization,
 * program switching, and responsive layout.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];
const ERS_REQUIRED_LABELS = [
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
const ERS_GROUP_TITLES = [
  "Operating & Program Conditions",
  "Hazardous Materials",
  "Site & Administrative",
];
const ERS2020NBC_GROUP_MARKERS = ["Program Options", "Remote Communities", "Evaluation Cost"];
const ONTARIO_LEAK_MARKERS = ["Smart thermostats", "RUR comments", "Resiliency Measures"];

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

function layoutSelector(modeId) {
  if (modeId === "ers2020nbc") return '.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]';
  if (modeId === "ontarioRef") return '.program-ontario-ref-layout[data-program-mode="ontarioRef"]';
  return `.program-ers-layout[data-program-mode="${modeId}"]`;
}

async function waitForProgramLayout(page, modeId) {
  await page.waitForSelector(layoutSelector(modeId), { timeout: 90000 });
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

  await setProgramMode(page, "ers");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers");

  await setProgramMode(page, "ers2020nbc");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers2020nbc");
  const switchToErs2020 = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers-layout[data-program-mode="ers"]'),
    hasErs2020: !!document.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'),
  }));

  await setProgramMode(page, "ers");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers");
  const switchBackErs = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers-layout[data-program-mode="ers"]'),
    hasErs2020: !!document.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'),
  }));

  await setProgramMode(page, "ontarioRef");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ontarioRef");
  const switchToOntario = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers-layout[data-program-mode="ers"]'),
    hasOntario: !!document.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]'),
  }));

  await setProgramMode(page, "ers");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers");
  const switchBackFromOntario = await page.evaluate(() => ({
    hasErs: !!document.querySelector('.program-ers-layout[data-program-mode="ers"]'),
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
    unitSel.value = "ers";
    unitSel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const afterUnitMode = readIds();
    return { before, afterUnitMode };
  });

  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await waitForProgramLayout(page, "ers");

  await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await waitForProgramLayout(page, "ers");

  const refresh = await page.evaluate(() => ({
    toolbar: document.getElementById("programMode")?.value || "",
    unitMode: document.querySelector("[data-unit-mode-programs]")?.value || "",
    modeAttr: document.querySelector(".program-ers-layout")?.dataset?.programMode || "",
  }));

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));

    const metrics = await page.evaluate((requiredLabels, groupTitles, ers2020Groups, ontarioMarkers, viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-systems-program");
      const layout = section?.querySelector('.program-ers-layout[data-program-mode="ers"]');
      const text = section?.textContent || "";
      const hasErs2020Layout = !!section?.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]');
      const hasOntarioLayout = !!section?.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]');
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const groups = layout?.querySelectorAll(".spec-group h4")?.length || 0;
      const groupTitlesFound = groupTitles.every((title) => text.includes(title));
      const ers2020GroupLeak = ers2020Groups.some((title) => text.includes(title));
      const ontarioLeak = ontarioMarkers.some((label) => text.includes(label));
      const toolbar = document.getElementById("programMode")?.value || "";
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const checks = [...(layout?.querySelectorAll(".check") || [])].filter(isVisible);
      const tappableChecks = checks.length > 0 && checks.every((el) => el.getBoundingClientRect().height >= 39);
      const selects = [...(layout?.querySelectorAll("select") || [])].filter(isVisible);
      const selectsOk = selects.length > 0 && selects.every((el) => el.getBoundingClientRect().height >= 39);
      const evalPrefix = !!layout?.querySelector(".program-evaluation-cost-prefix");
      const oneColumn = viewportWidth < 768
        ? [...(layout?.querySelectorAll(".form-grid") || [])].every((grid) => {
            const style = window.getComputedStyle(grid);
            return !style.gridTemplateColumns.includes("repeat(2")
              && !style.gridTemplateColumns.includes("repeat(3");
          })
        : true;
      return {
        overflow,
        hasErs2020Layout,
        hasOntarioLayout,
        missingLabels,
        groups,
        groupTitlesFound,
        ers2020GroupLeak,
        ontarioLeak,
        tappableChecks,
        selectsOk,
        evalPrefix,
        oneColumn,
        toolbar,
        toolbarErs: toolbar === "ers",
      };
    }, ERS_REQUIRED_LABELS, ERS_GROUP_TITLES, ERS2020NBC_GROUP_MARKERS, ONTARIO_LEAK_MARKERS, width);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.hasErs2020Layout &&
      !metrics.hasOntarioLayout &&
      metrics.missingLabels.length === 0 &&
      metrics.groups === 3 &&
      metrics.groupTitlesFound &&
      !metrics.ers2020GroupLeak &&
      !metrics.ontarioLeak &&
      metrics.tappableChecks &&
      metrics.selectsOk &&
      metrics.evalPrefix &&
      metrics.oneColumn &&
      metrics.toolbarErs;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  const switchErsToErs2020Pass =
    !switchToErs2020.hasErs && switchToErs2020.hasErs2020;
  const switchErs2020ToErsPass =
    switchBackErs.hasErs && !switchBackErs.hasErs2020;
  const switchErsToOntarioPass =
    !switchToOntario.hasErs && switchToOntario.hasOntario;
  const switchOntarioToErsPass =
    switchBackFromOntario.hasErs && !switchBackFromOntario.hasOntario;
  const syncPass =
    sync.afterUnitMode.toolbar === "ers" &&
    sync.afterUnitMode.menu === "ers" &&
    sync.afterUnitMode.unitMode === "ers";
  const refreshPass = refresh.toolbar === "ers" && refresh.modeAttr === "ers";

  console.log(JSON.stringify({
    switchToErs2020,
    switchBackErs,
    switchToOntario,
    switchBackFromOntario,
    switchErsToErs2020Pass,
    switchErs2020ToErsPass,
    switchErsToOntarioPass,
    switchOntarioToErsPass,
    sync,
    syncPass,
    refresh,
    refreshPass,
    results,
    horizontalOverflow,
    fieldCount: ERS_REQUIRED_LABELS.length,
    inventorySource: "catalog/capture/hot2000-11.13/screens/program.json",
  }, null, 2));

  const allPass =
    switchErsToErs2020Pass &&
    switchErs2020ToErsPass &&
    switchErsToOntarioPass &&
    switchOntarioToErsPass &&
    syncPass &&
    refreshPass &&
    WIDTHS.every((w) => results[w].pass);
  if (!allPass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
