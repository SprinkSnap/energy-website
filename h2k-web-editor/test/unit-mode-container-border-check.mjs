/**
 * Verify House Units & Mode has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/unit-mode`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-unit-mode .unit-mode-section.section-card", { timeout: 90000 });
  await page.waitForSelector('[data-group-id="display-units"]', { timeout: 90000 });
  await page.waitForSelector('[data-group-id="programs"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-unit-mode .unit-mode-section.section-card");
      const layout = section?.querySelector(".unit-mode-spec-layout");
      const displayGroup = layout?.querySelector('[data-group-id="display-units"]');
      const programsGroup = layout?.querySelector('[data-group-id="programs"]');
      const cardStyle = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          borderWidth: s.borderWidth,
          borderRadius: s.borderRadius,
          paddingTop: s.paddingTop,
          backgroundColor: s.backgroundColor,
        };
      };
      const outer = cardStyle(section);
      const outerHasBorder = outer
        ? outer.borderWidth !== "0px" && getComputedStyle(section).borderTopStyle !== "none"
        : false;
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
      const displayGroupBorder = (() => {
        if (!displayGroup) return true;
        const s = getComputedStyle(displayGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const programsGroupBorder = (() => {
        if (!programsGroup) return true;
        const s = getComputedStyle(programsGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const displayHeading = displayGroup?.querySelector("h4")?.textContent?.trim() || "";
      const programsHeading = programsGroup?.querySelector("h4")?.textContent?.trim() || "";
      const requiredLabels = ["Metric", "Imperial", "US", "Programs"];
      const text = section?.textContent || "";
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const radioControls = (() => {
        const radios = [...(displayGroup?.querySelectorAll('input[name="unitModeDisplayUnits"]') || [])];
        return (
          radios.length === 3 &&
          radios.every((radio) => {
            const r = radio.getBoundingClientRect();
            const s = getComputedStyle(radio);
            return r.width >= 16 && r.height >= 16 && s.display !== "none" && s.visibility !== "hidden";
          })
        );
      })();
      const selectBorder = (() => {
        const select = section?.querySelector("[data-unit-mode-programs]");
        if (!select) return false;
        const s = getComputedStyle(select);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const sectionHeadings = innerGroups
        .map((el) => el.querySelector(":scope > h4")?.textContent?.trim() || "")
        .filter(Boolean);
      const unitRadios = [...(section?.querySelectorAll('input[name="unitModeDisplayUnits"]') || [])].length;
      const programsSelect = Boolean(section?.querySelector("[data-unit-mode-programs]"));
      const prevBtn = document.querySelector('[data-section-stepper-prev="house"]');
      const nextBtn = document.querySelector('[data-section-stepper-next="house"]');
      const navVisible = Boolean(prevBtn && nextBtn && nextBtn.getBoundingClientRect().height >= 40);
      return {
        overflow,
        outerHasBorder,
        nestedCardBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        displayGroupBorder,
        programsGroupBorder,
        displayHeading,
        programsHeading,
        missingLabels,
        radioControls,
        selectBorder,
        sectionHeadings,
        unitRadios,
        programsSelect,
        navVisible,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      !metrics.nestedCardBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount === 2 &&
      metrics.displayGroupBorder &&
      metrics.programsGroupBorder &&
      metrics.displayHeading === "Display Units" &&
      metrics.programsHeading === "Programs" &&
      metrics.missingLabels.length === 0 &&
      metrics.radioControls &&
      metrics.selectBorder &&
      metrics.sectionHeadings.includes("Display Units") &&
      metrics.sectionHeadings.includes("Programs") &&
      metrics.unitRadios === 3 &&
      metrics.programsSelect &&
      metrics.navVisible;
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
