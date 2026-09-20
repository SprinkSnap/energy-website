/**
 * Verify Specifications has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/specifications`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-specifications .specifications-section", { timeout: 90000 });
  await page.waitForSelector('#screen-house-specifications [data-group-id="building-description"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-specifications .specifications-section.section-card");
      const layout = section?.querySelector(".specifications-spec-layout");
      const buildingGroup = layout?.querySelector('[data-group-id="building-description"]');
      const constructionGroup = layout?.querySelector('[data-group-id="construction-site-conditions"]');
      const outerHasBorder = (() => {
        if (!section) return false;
        const s = getComputedStyle(section);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const innerGroups = [...(layout?.querySelectorAll(".spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const buildingGroupBorder = (() => {
        if (!buildingGroup) return true;
        const s = getComputedStyle(buildingGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const constructionGroupBorder = (() => {
        if (!constructionGroup) return true;
        const s = getComputedStyle(constructionGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const buildingHeading = buildingGroup?.querySelector("h4")?.textContent?.trim() || "";
      const constructionHeading = constructionGroup?.querySelector("h4")?.textContent?.trim() || "";
      const requiredLabels = [
        "Building type",
        "House type",
        "Plan shape",
        "Storeys",
        "Front orientation",
        "Thermal mass",
        "Effective mass fraction",
      ];
      const text = section?.textContent || "";
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const selectBorder = (() => {
        const select = buildingGroup?.querySelector("select");
        if (!select) return false;
        const s = getComputedStyle(select);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const inputBorder = (() => {
        const input = constructionGroup?.querySelector('input[data-xml-path*="@effectiveMassFraction"]');
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const sectionHeadings = innerGroups
        .map((el) => el.querySelector(":scope > h4")?.textContent?.trim() || "")
        .filter(Boolean);
      const pairRowCols = (() => {
        const row = section?.querySelector(".specifications-pair-row");
        if (!row || viewportWidth < 768) return true;
        const cols = getComputedStyle(row).gridTemplateColumns.split(" ").filter(Boolean).length;
        return cols >= 2;
      })();
      return {
        overflow,
        outerHasBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        buildingGroupBorder,
        constructionGroupBorder,
        buildingHeading,
        constructionHeading,
        missingLabels,
        selectBorder,
        inputBorder,
        sectionHeadings,
        pairRowCols,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, width);

    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount >= 3 &&
      metrics.buildingGroupBorder &&
      metrics.constructionGroupBorder &&
      metrics.buildingHeading === "Building description" &&
      metrics.constructionHeading === "Construction & site conditions" &&
      metrics.missingLabels.length === 0 &&
      metrics.selectBorder &&
      metrics.inputBorder &&
      metrics.sectionHeadings.includes("Compliance & heated floor area") &&
      metrics.pairRowCols;
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
