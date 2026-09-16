/**
 * Headless responsiveness check for Domestic Hot Water Primary section.
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
  await page.goto(`${base}/index.html#/systems/domestic-hot-water`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#domestic-hot-water-primary-mount .domestic-hot-water-primary-section", { timeout: 90000 });
  await page.click('input[data-dhw-performance-method][value="uef"]');
  await page.waitForSelector('.dhw-draw-pattern select', { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const labelsRequired = [
        "Performance method",
        "System",
        "Equipment Information",
        "Tank / flue",
        "Energy Factor",
        "Uniform Energy Factor",
        "Energy source",
        "Tank type",
        "Tank volume",
        "Value (L)",
        "Uniform Energy Factor draw pattern",
        "Tank location",
        "Drain Water Heat Recovery",
        "Standby heat loss",
        "BTU/hr",
        "%/hr",
        "Thermal efficiency",
        "Input capacity",
        "Manufacturer",
        "Model",
        "ENERGY STAR",
        "ecoEnergy",
        "Insulating blanket",
        "Pilot energy",
        "Flue combined with Furnace/Boiler flue",
        "Flue diameter",
        "Fraction of tank",
        "Edit DWHR data",
      ];
      const viewportWidth = window.innerWidth;
      const section = document.querySelector("#domestic-hot-water-primary-mount .domestic-hot-water-primary-section");
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const text = section?.textContent || "";
      const missingLabels = labelsRequired.filter((label) => !text.includes(label));
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const clippedLabels = [...(section?.querySelectorAll(".domestic-hot-water-primary-stack .field > span, .domestic-hot-water-primary-stack .dhw-metric-field > span, .domestic-hot-water-primary-stack .dhw-performance-method legend") || [])]
        .filter(isVisible)
        .some((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 8;
        });
      const tapTargets = [
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .field select") || []),
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .field input:not([type=checkbox]):not([type=radio])") || []),
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .dhw-edit-dwhr") || []),
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .dhw-radio-check") || []),
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .dhw-unit-check") || []),
        ...(section?.querySelectorAll(".domestic-hot-water-primary-stack .dhw-dwhr-check") || []),
      ];
      const clippedInputs = tapTargets
        .filter(isVisible)
        .some((el) => {
          const r = el.getBoundingClientRect();
          return r.right > doc.clientWidth + 2 || r.width < 20 || r.height < 39;
        });
      const tappableControls = tapTargets
        .filter(isVisible)
        .every((el) => el.getBoundingClientRect().height >= 39);
      const groups = section?.querySelectorAll(".domestic-hot-water-primary-stack .spec-group, .domestic-hot-water-primary-stack .dhw-performance-method").length || 0;
      const fields = [...(section?.querySelectorAll(".domestic-hot-water-primary-stack .field") || [])].filter(isVisible);
      const oneColumn =
        viewportWidth >= 640
          ? true
          : fields.length < 2
            ? true
            : fields.every((el, i) => {
                if (i === 0) return true;
                const prev = fields[i - 1].getBoundingClientRect();
                const cur = el.getBoundingClientRect();
                return cur.top >= prev.bottom - 2;
              });
      return {
        overflow,
        clippedLabels,
        clippedInputs,
        missingLabels,
        tappableControls,
        oneColumn,
        groups,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.clippedLabels &&
      !metrics.clippedInputs &&
      metrics.missingLabels.length === 0 &&
      metrics.tappableControls &&
      metrics.oneColumn &&
      metrics.groups >= 4;
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
