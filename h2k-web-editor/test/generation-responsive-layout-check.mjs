/**
 * Full Generation section responsive layout check (summary + expanded PV form).
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
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads .base-loads-section", { timeout: 90000 });
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation .generation-section", { timeout: 90000 });
  await page.evaluate(() => {
    const input = document.querySelector("#generation-power-mount [data-generation-pv-count]");
    if (!input) throw new Error("PV count input not found");
    input.value = "1";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector('[data-generation-panel="1"] .generation-pv-form', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((viewportWidth) => {
      const section = document.querySelector("#screen-systems-generation .generation-section");
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const countGrid = section?.querySelector(".generation-pv-count-grid");
      const countField = section?.querySelector(".generation-pv-count");
      const capacityField = section?.querySelector(
        '.generation-pv-count-grid .field:not(.generation-pv-count)',
      );
      const windCheck = section?.querySelector(".wind-energy-check");
      const windValue = section?.querySelector(".wind-energy-value");
      const stacks = (a, b) => {
        if (!a || !b || !isVisible(a) || !isVisible(b)) return true;
        return b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 2;
      };
      const countGridOneColumn =
        !countField || !capacityField || !isVisible(countField) || !isVisible(capacityField)
          ? true
          : stacks(countField, capacityField);
      const windOneColumn = stacks(windCheck, windValue);
      const mobileOneColumn = viewportWidth < 768 ? countGridOneColumn && windOneColumn : true;
      const tabletWindSideBySide =
        viewportWidth >= 768
          ? windCheck && windValue && isVisible(windCheck) && isVisible(windValue) && !stacks(windCheck, windValue)
          : true;
      const baseLoads = document.querySelector("#screen-systems-base-loads .base-loads-section.catalog-section");
      let borderMatch = false;
      if (baseLoads && section) {
        const bl = getComputedStyle(baseLoads);
        const gen = getComputedStyle(section);
        borderMatch =
          bl.borderWidth === gen.borderWidth &&
          bl.borderRadius === gen.borderRadius &&
          bl.paddingTop === gen.paddingTop &&
          bl.backgroundColor === gen.backgroundColor;
      }
      const tappable = [...(section?.querySelectorAll("input:not([type='checkbox']), select, .numeric-stepper-btn, .check") || [])]
        .filter(isVisible)
        .every((el) => el.getBoundingClientRect().height >= 39);
      const clippedLabels = [...(section?.querySelectorAll(".field > span, .generation-pv-count > span") || [])]
        .filter(isVisible)
        .some((el) => el.getBoundingClientRect().width < 8);
      return {
        overflow,
        mobileOneColumn,
        tabletWindSideBySide,
        borderMatch,
        tappable,
        clippedLabels,
        pvControlLabel: !!section?.querySelector("#generation-pv-count-label"),
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, width);

    const pass =
      !metrics.overflow &&
      metrics.mobileOneColumn &&
      metrics.tabletWindSideBySide &&
      metrics.borderMatch &&
      metrics.tappable &&
      !metrics.clippedLabels &&
      metrics.pvControlLabel;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ results }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
