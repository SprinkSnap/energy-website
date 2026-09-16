/**
 * Headless responsiveness check for Heating/Cooling System Baseboards section.
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
  await page.goto(`${base}/index.html#/systems/heating-cooling`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-heating-cooling .heating-cooling-section", { timeout: 90000 });
  await page.click('[data-heating-tab="main"]');
  await page.click('input[data-heating-radio="heating-type1"][value="baseboards"]');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-heating-tab="type1"]');
  await page.waitForSelector("#heating-cooling-system-baseboards-mount .heating-cooling-system-baseboards-section", { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const labelsRequired = [
        "Output capacity",
        "Sizing factor",
        "Efficiency",
        "Manufacturer",
        "Model",
        "Number of electronic thermostats",
        "Specifications",
        "Equipment Information",
      ];
      const viewportWidth = window.innerWidth;
      const section = document.querySelector("#heating-cooling-system-baseboards-mount .heating-cooling-system-baseboards-section");
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const text = section?.textContent || "";
      const missingLabels = labelsRequired.filter((label) => !text.includes(label));
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const clippedLabels = [...(section?.querySelectorAll(".heating-cooling-system-baseboards-stack .field > span") || [])]
        .filter(isVisible)
        .some((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 8;
        });
      const tapTargets = [
        ...(section?.querySelectorAll(".heating-cooling-system-baseboards-stack .field select") || []),
        ...(section?.querySelectorAll(".heating-cooling-system-baseboards-stack .field input") || []),
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
      const groups = section?.querySelectorAll(".heating-cooling-system-baseboards-stack .spec-group").length || 0;
      const fields = [...(section?.querySelectorAll(".heating-cooling-system-baseboards-stack .field") || [])].filter(isVisible);
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
      metrics.groups >= 2;
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
