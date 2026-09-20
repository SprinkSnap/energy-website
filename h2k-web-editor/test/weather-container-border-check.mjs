/**
 * Verify House Weather has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/weather`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-weather .weather-section.section-card", { timeout: 90000 });
  await page.waitForSelector('[data-group-id="weather-library-selection"]', { timeout: 90000 });
  await page.waitForSelector('[data-group-id="regional-location"]', { timeout: 90000 });
  await page.waitForSelector('[data-group-id="site-specific-data"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-weather .weather-section.section-card");
      const layout = section?.querySelector(".weather-spec-layout");
      const libraryGroup = layout?.querySelector('[data-group-id="weather-library-selection"]');
      const regionalGroup = layout?.querySelector('[data-group-id="regional-location"]');
      const siteGroup = layout?.querySelector('[data-group-id="site-specific-data"]');
      const outerHasBorder = (() => {
        if (!section) return false;
        const s = getComputedStyle(section);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const nestedCards = [...(section?.querySelectorAll(".section-card") || [])].filter((el) => el !== section);
      const nestedCardBorder = nestedCards.some((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      });
      const innerGroups = [...(layout?.querySelectorAll(".spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const groupBorderRemoved = (group) => {
        if (!group) return true;
        const s = getComputedStyle(group);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      };
      const libraryHeading = libraryGroup?.querySelector("h4")?.textContent?.trim() || "";
      const regionalHeading = regionalGroup?.querySelector("h4")?.textContent?.trim() || "";
      const siteHeading = siteGroup?.querySelector("h4")?.textContent?.trim() || "";
      const requiredLabels = [
        "Weather Library",
        "Change",
        "Region",
        "Location",
        "Depth of frostline",
        "Heating Degree Days from Weather File :",
      ];
      const text = section?.textContent || "";
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const inputBorder = (() => {
        const input = regionalGroup?.querySelector("select, .weather-combo-control input");
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const buttonBorder = (() => {
        const btn = section?.querySelector("#weatherLibraryChangeBtn");
        if (!btn) return false;
        const s = getComputedStyle(btn);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const libraryValueBorder = (() => {
        const value = section?.querySelector(".weather-library-value");
        if (!value) return false;
        const s = getComputedStyle(value);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const sectionHeadings = innerGroups
        .map((el) => el.querySelector(":scope > h4")?.textContent?.trim() || "")
        .filter(Boolean);
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
      return {
        overflow,
        outerHasBorder,
        nestedCardBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        libraryGroupBorder: groupBorderRemoved(libraryGroup),
        regionalGroupBorder: groupBorderRemoved(regionalGroup),
        siteGroupBorder: groupBorderRemoved(siteGroup),
        libraryHeading,
        regionalHeading,
        siteHeading,
        missingLabels,
        inputBorder,
        buttonBorder,
        libraryValueBorder,
        sectionHeadings,
        libraryAligned,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, width);

    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      !metrics.nestedCardBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount === 3 &&
      metrics.libraryGroupBorder &&
      metrics.regionalGroupBorder &&
      metrics.siteGroupBorder &&
      metrics.libraryHeading === "Weather Library Selection" &&
      metrics.regionalHeading === "Regional Location" &&
      metrics.siteHeading === "Site Specific Data" &&
      metrics.missingLabels.length === 0 &&
      metrics.inputBorder &&
      metrics.buttonBorder &&
      metrics.libraryValueBorder &&
      metrics.sectionHeadings.includes("Weather Library Selection") &&
      metrics.sectionHeadings.includes("Regional Location") &&
      metrics.sectionHeadings.includes("Site Specific Data") &&
      metrics.libraryAligned;
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
