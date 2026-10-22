/**
 * Verify Systems > Program re-renders immediately when canonical Program changes.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];

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

async function setProgramMode(page, modeId, via = "toolbar") {
  if (via === "toolbar") {
    await page.evaluate((id) => {
      const sel = document.getElementById("programMode");
      sel.value = id;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, modeId);
  } else {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/index.html#/house/unit-mode`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("[data-unit-mode-programs]", { timeout: 90000 });
    await page.evaluate((id) => {
      const sel = document.querySelector("[data-unit-mode-programs]");
      sel.value = id;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, modeId);
  }
  await page.waitForFunction(
    (id) => document.getElementById("programMode")?.value === id,
    { timeout: 30000 },
    modeId,
  );
  await new Promise((r) => setTimeout(r, 200));
}

function readLayouts(page) {
  return page.evaluate(() => ({
    toolbar: document.getElementById("programMode")?.value || "",
    unitMode: document.querySelector("[data-unit-mode-programs]")?.value || "",
    hash: location.hash,
    hasErs: !!document.querySelector('.program-ers-layout[data-program-mode="ers"]'),
    hasErs2020: !!document.querySelector('.program-ers2020nbc-layout[data-program-mode="ers2020nbc"]'),
    hasOntario: !!document.querySelector('.program-ontario-ref-layout[data-program-mode="ontarioRef"]'),
    ontarioLeak: (document.querySelector("#screen-systems-program")?.textContent || "").includes("Resiliency Measures"),
    ers2020GroupLeak: (document.querySelector("#screen-systems-program")?.textContent || "").includes("Program Options"),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
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
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );

  await setProgramMode(page, "ers");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('.program-ers-layout[data-program-mode="ers"]', { timeout: 90000 });

  await setProgramMode(page, "ontarioRef");
  const ersToOntario = await readLayouts(page);
  const testErsToOntario =
    ersToOntario.toolbar === "ontarioRef" &&
    ersToOntario.hasOntario &&
    !ersToOntario.hasErs &&
    !ersToOntario.hasErs2020 &&
    !ersToOntario.hash.includes("refresh");

  await setProgramMode(page, "ers2020nbc");
  const ontarioToErs2020 = await readLayouts(page);
  const testOntarioToErs2020 =
    ontarioToErs2020.toolbar === "ers2020nbc" &&
    ontarioToErs2020.hasErs2020 &&
    !ontarioToErs2020.hasOntario &&
    !ontarioToErs2020.ontarioLeak;

  await setProgramMode(page, "ers");
  const ers2020ToErs = await readLayouts(page);
  const testErs2020ToErs =
    ers2020ToErs.toolbar === "ers" &&
    ers2020ToErs.hasErs &&
    !ers2020ToErs.hasErs2020 &&
    !ers2020ToErs.ers2020GroupLeak;

  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await setProgramMode(page, "ontarioRef");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  const deferredOpen = await readLayouts(page);
  const testDeferredOpen =
    deferredOpen.toolbar === "ontarioRef" &&
    deferredOpen.hasOntario &&
    !deferredOpen.hasErs;

  await setProgramMode(page, "ers", "unit-mode");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('.program-ers-layout[data-program-mode="ers"]', { timeout: 90000 });
  await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await page.waitForSelector('.program-ers-layout[data-program-mode="ers"]', { timeout: 90000 });
  const refresh = await readLayouts(page);
  const testRefresh = refresh.toolbar === "ers" && refresh.hasErs && !refresh.hasOntario;

  const widthResults = {};
  let horizontalOverflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    await setProgramMode(page, "ontarioRef");
    const afterOntario = await readLayouts(page);
    await setProgramMode(page, "ers");
    const afterErs = await readLayouts(page);
    if (afterErs.overflow || afterOntario.overflow) horizontalOverflow = true;
    widthResults[width] = {
      pass:
        !afterOntario.overflow &&
        !afterErs.overflow &&
        afterOntario.hasOntario &&
        !afterOntario.hasErs &&
        afterErs.hasErs &&
        !afterErs.hasOntario,
    };
  }

  await browser.close();
  server.close();

  const report = {
    testErsToOntario,
    testOntarioToErs2020,
    testErs2020ToErs,
    testDeferredOpen,
    testRefresh,
    ersToOntario,
    ontarioToErs2020,
    ers2020ToErs,
    deferredOpen,
    refresh,
    widthResults,
    horizontalOverflow,
  };
  console.log(JSON.stringify(report, null, 2));

  const allPass =
    testErsToOntario &&
    testOntarioToErs2020 &&
    testErs2020ToErs &&
    testDeferredOpen &&
    testRefresh &&
    !horizontalOverflow &&
    WIDTHS.every((w) => widthResults[w].pass);
  if (!allPass) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
