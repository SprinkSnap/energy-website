/**
 * Headless responsiveness check for Generation Power Generation summary (6 controls at PV count 0).
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

const REQUIRED_LABELS = [
  "Photovoltaic Systems:",
  "Capacity of photovoltaic system",
  "Other Energy Systems",
  "Battery Storage",
  "Wind energy contribution",
  "Solar Ready",
];

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
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation .generation-section", { timeout: 90000 });
  await page.waitForSelector("#generation-power-mount .generation-pv-systems-group", { timeout: 90000 });
  await page.waitForSelector("#generation-other-mount .generation-other-section", { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((labelsRequired) => {
      const section = document.querySelector("#screen-systems-generation .generation-section");
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const text = section?.textContent || "";
      const missingLabels = labelsRequired.filter((label) => !text.includes(label));
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const pvCount = Number(document.querySelector("[data-generation-pv-count]")?.value || 0);
      const capacityInput = section?.querySelector('[data-xml-path$="/@PhotovoltaicCapacity"]');
      const capacityDisabled = capacityInput?.disabled === true;
      const windToggle = section?.querySelector("[data-wind-toggle]");
      const windValue = section?.querySelector(".wind-energy-value input");
      const windDisabled = windValue?.disabled === true;
      const clippedInputs = [...(section?.querySelectorAll("input:not([type='checkbox']), select, .numeric-stepper-btn") || [])]
        .filter(isVisible)
        .some((el) => {
          const r = el.getBoundingClientRect();
          return r.right > doc.clientWidth + 2 || r.width < 20 || r.height < 39;
        });
      const tappableControls = [...(section?.querySelectorAll(".check, .numeric-stepper-btn, input:not([type='checkbox'])") || [])]
        .filter(isVisible)
        .every((el) => el.getBoundingClientRect().height >= 39);
      const capacityField = section?.querySelector(
        '.generation-pv-count-grid .field:not(.generation-pv-count)',
      );
      const windRow = section?.querySelector(".wind-energy-row");
      const windCheck = windRow?.querySelector(".check");
      const windInput = windRow?.querySelector(".wind-energy-value");
      const capacityBeforeWind =
        !capacityField || !windRow
          ? true
          : windRow.getBoundingClientRect().top >= capacityField.getBoundingClientRect().bottom - 2;
      const windStacksOnMobile =
        window.innerWidth >= 640 || !windCheck || !windInput
          ? true
          : windInput.getBoundingClientRect().top >= windCheck.getBoundingClientRect().bottom - 2;
      const oneColumn = capacityBeforeWind && windStacksOnMobile;
      const xmlFields = section?.querySelectorAll("[data-xml-path]").length || 0;
      return {
        overflow,
        missingLabels,
        clippedInputs,
        tappableControls,
        oneColumn,
        pvCount,
        capacityDisabled,
        windDisabled,
        xmlFields,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, REQUIRED_LABELS);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      metrics.missingLabels.length === 0 &&
      !metrics.clippedInputs &&
      metrics.tappableControls &&
      metrics.oneColumn &&
      metrics.pvCount === 0 &&
      metrics.capacityDisabled &&
      metrics.windDisabled &&
      metrics.xmlFields >= 5;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ results, horizontalOverflow }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
