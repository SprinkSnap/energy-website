/**
 * Headless responsiveness check for General section.
 * Requires: npm install puppeteer-core (in repo root or /tmp)
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
  "File ID",
  "Prev. File ID",
  "House ID",
  "Application Identifier",
  "Homeowner Authorization ID",
  "Ownership",
  "Property Tax Roll #",
  "Builder Name",
  "Owner Occupied",
  "Evaluation Date",
  "User Name (Entered by)",
  "User Company",
  "Client First Name",
  "Client Last Name",
  "Street Address",
  "Mailing Address Name",
  "Mailing Address",
  "Mixed Use",
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
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
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
  await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-general .general-section", { timeout: 90000 });

  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(
      (viewportWidth, labelsRequired) => {
        const section = document.querySelector("#screen-house-general .general-section");
        const doc = document.documentElement;
        const overflow = doc.scrollWidth > doc.clientWidth + 1;
        const text = section?.textContent || "";
        const missingLabels = labelsRequired.filter((label) => !text.includes(label));
        const clippedLabels = [...(section?.querySelectorAll(".field span") || [])].some((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 8 && el.textContent.trim().length > 0;
        });
        const clippedInputs = [...(section?.querySelectorAll("input:not([type='checkbox']), select, button.button") || [])].some((el) => {
          const r = el.getBoundingClientRect();
          return r.right > doc.clientWidth + 2 || r.width < 20 || r.height < 40;
        });
        const tappableControls = [...(section?.querySelectorAll(".check, button.button") || [])].every((el) => {
          const r = el.getBoundingClientRect();
          return r.height >= 40;
        });
        const localityFields = [...(section?.querySelectorAll(".general-address-locality .field") || [])];
        const oneColumn =
          viewportWidth < 640
            ? localityFields.every((el, i) => {
                if (i === 0) return true;
                const prev = localityFields[i - 1].getBoundingClientRect();
                const cur = el.getBoundingClientRect();
                return cur.top >= prev.bottom - 2;
              })
            : true;
        const hasSameAsAbove = Boolean(section?.querySelector("#sameAsAboveBtn"));
        const hasJustifications = Boolean(section?.querySelector("#justificationsBtn"));
        const xmlFields = section?.querySelectorAll("[data-xml-path]").length || 0;
        return {
          overflow,
          clippedLabels,
          clippedInputs,
          oneColumn,
          missingLabels,
          hasSameAsAbove,
          hasJustifications,
          tappableControls,
          xmlFields,
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
      metrics.oneColumn &&
      metrics.missingLabels.length === 0 &&
      metrics.hasSameAsAbove &&
      metrics.hasJustifications &&
      metrics.tappableControls &&
      metrics.xmlFields >= 29;
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
