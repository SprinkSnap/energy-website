/**
 * Headless responsiveness check for House Weather section.
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
  "Weather Library",
  "Change",
  "Region",
  "Location",
  "Depth of frostline",
  "Heating Degree Days from Weather File :",
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
  await page.goto(`${base}/index.html#/house/weather`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-weather .weather-section", { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(
      (viewportWidth, labelsRequired) => {
        const section = document.querySelector("#screen-house-weather .weather-section");
        const doc = document.documentElement;
        const overflow = doc.scrollWidth > doc.clientWidth + 1;
        const text = section?.textContent || "";
        const missingLabels = labelsRequired.filter((label) => !text.includes(label));
        const isVisible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const clippedLabels = [...(section?.querySelectorAll(".field span, .field-readonly span") || [])]
          .filter(isVisible)
          .some((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 8 && el.textContent.trim().length > 0;
          });
        const clippedInputs = [...(section?.querySelectorAll("input:not([type='checkbox']), select, .readonly-value") || [])]
          .filter(isVisible)
          .some((el) => {
            const r = el.getBoundingClientRect();
            return r.right > doc.clientWidth + 2 || r.width < 20 || r.height < 40;
          });
        const tappableControls = [...(section?.querySelectorAll(".button, .weather-combo-toggle, select, input:not([type='checkbox'])") || [])]
          .filter(isVisible)
          .every((el) => el.getBoundingClientRect().height >= 40);
        const regionalFields = [...(section?.querySelectorAll(".weather-regional-row .field, .weather-regional-row .weather-location-search") || [])].filter(isVisible);
        const regionalOneColumnMobile =
          viewportWidth < 768
            ? regionalFields.every((el, i) => {
                if (i === 0) return true;
                const prev = regionalFields[i - 1].getBoundingClientRect();
                const cur = el.getBoundingClientRect();
                return cur.top >= prev.bottom - 2;
              })
            : true;
        const siteFields = [...(section?.querySelectorAll(".weather-site-row .field") || [])].filter(isVisible);
        const siteOneColumnMobile =
          viewportWidth < 640
            ? siteFields.every((el, i) => {
                if (i === 0) return true;
                const prev = siteFields[i - 1].getBoundingClientRect();
                const cur = el.getBoundingClientRect();
                return cur.top >= prev.bottom - 2;
              })
            : true;
        const changeBtn = section?.querySelector("#weatherLibraryChangeBtn");
        const libraryValue = section?.querySelector(".weather-library-value");
        const libraryControlRow = section?.querySelector(".weather-library-control-row");
        const libraryLabel = section?.querySelector(".weather-library-control > span");
        const libraryAligned =
          Boolean(changeBtn && libraryValue && libraryControlRow) &&
          (() => {
            const valueRect = libraryValue.getBoundingClientRect();
            const btnRect = changeBtn.getBoundingClientRect();
            const rowRect = libraryControlRow.getBoundingClientRect();
            const labelRect = libraryLabel?.getBoundingClientRect();
            const sameRow = viewportWidth >= 360
              ? Math.abs(valueRect.top - btnRect.top) <= 4 && btnRect.left >= valueRect.right - 2
              : btnRect.top >= valueRect.bottom - 2;
            const labelAbove = labelRect ? labelRect.bottom <= rowRect.top + 2 : true;
            const verticallyAligned = Math.abs((valueRect.top + valueRect.height / 2) - (btnRect.top + btnRect.height / 2)) <= 24;
            const noOverlap =
              valueRect.right <= btnRect.left + 1 ||
              btnRect.top >= valueRect.bottom - 2 ||
              viewportWidth < 360;
            const buttonNotStretched = btnRect.width <= rowRect.width * 0.45;
            return sameRow && labelAbove && verticallyAligned && noOverlap && buttonNotStretched;
          })();
        const regionalSideBySide =
          viewportWidth >= 768 && regionalFields.length >= 2
            ? regionalFields[1].getBoundingClientRect().top <= regionalFields[0].getBoundingClientRect().top + 4
            : true;
        return {
          overflow,
          clippedLabels,
          clippedInputs,
          missingLabels,
          tappableControls,
          regionalOneColumnMobile,
          siteOneColumnMobile,
          changeBtn: Boolean(changeBtn),
          libraryAligned,
          regionalSideBySide,
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
        };
      },
      width,
      REQUIRED_LABELS,
    );

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.clippedLabels &&
      !metrics.clippedInputs &&
      metrics.missingLabels.length === 0 &&
      metrics.tappableControls &&
      metrics.regionalOneColumnMobile &&
      metrics.siteOneColumnMobile &&
      metrics.changeBtn &&
      metrics.libraryAligned &&
      metrics.regionalSideBySide;
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
