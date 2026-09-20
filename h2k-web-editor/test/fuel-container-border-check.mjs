/**
 * Verify House Fuel Cost has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/fuel`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-fuel .fuel-section.section-card", { timeout: 90000 });
  await page.waitForSelector('[data-group-id="fuel-cost-library"]', { timeout: 90000 });
  await page.waitForSelector('[data-group-id="cost-calculation-settings"]', { timeout: 90000 });
  await page.waitForSelector('[data-group-id="fuel-cost-selection"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-fuel .fuel-section.section-card");
      const layout = section?.querySelector(".fuel-spec-layout");
      const libraryGroup = layout?.querySelector('[data-group-id="fuel-cost-library"]');
      const calculationGroup = layout?.querySelector('[data-group-id="cost-calculation-settings"]');
      const selectionGroup = layout?.querySelector('[data-group-id="fuel-cost-selection"]');
      const actionsGroup = layout?.querySelector('[data-group-id="fuel-actions"]');
      const groupBorderRemoved = (group) => {
        if (!group) return true;
        const s = getComputedStyle(group);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      };
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
      const requiredLabels = [
        "Fuel Cost Library",
        "Change",
        "Annual",
        "Monthly",
        "Include Cost Calculations",
        "Electricity",
      ];
      const text = section?.textContent || "";
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const selectBorder = (() => {
        const select = selectionGroup?.querySelector("select.fuel-profile-select");
        if (!select) return false;
        const s = getComputedStyle(select);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const buttonBorder = (() => {
        const btn = section?.querySelector("#fuelLibraryChangeBtn");
        if (!btn) return false;
        const s = getComputedStyle(btn);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const libraryValueBorder = (() => {
        const value = section?.querySelector(".fuel-library-value");
        if (!value) return false;
        const s = getComputedStyle(value);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const radioControls = (() => {
        const radios = [...(calculationGroup?.querySelectorAll('input[name="fuelRatePeriod"]') || [])];
        return (
          radios.length === 2 &&
          radios.every((radio) => {
            const r = radio.getBoundingClientRect();
            const s = getComputedStyle(radio);
            return r.width >= 16 && r.height >= 16 && s.display !== "none" && s.visibility !== "hidden";
          })
        );
      })();
      const checkboxControl = (() => {
        const checkbox = calculationGroup?.querySelector('input[type="checkbox"]');
        if (!checkbox) return false;
        const r = checkbox.getBoundingClientRect();
        const s = getComputedStyle(checkbox);
        return r.width >= 16 && r.height >= 16 && s.display !== "none" && s.visibility !== "hidden";
      })();
      const sectionHeadings = innerGroups
        .map((el) => el.querySelector(":scope > h4")?.textContent?.trim() || "")
        .filter(Boolean);
      const changeBtn = section?.querySelector("#fuelLibraryChangeBtn");
      const libraryValue = section?.querySelector(".fuel-library-value");
      const libraryControlRow = section?.querySelector(".fuel-library-control-row");
      const libraryLabel = section?.querySelector(".fuel-library-control > span");
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
      const periodBadge = selectionGroup?.querySelector(".fuel-period-badge");
      const hasPeriodBadge = !!periodBadge && /^(Yearly|Monthly)$/.test(periodBadge.textContent.trim());
      return {
        overflow,
        outerHasBorder,
        nestedCardBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        libraryGroupBorder: groupBorderRemoved(libraryGroup),
        calculationGroupBorder: groupBorderRemoved(calculationGroup),
        selectionGroupBorder: groupBorderRemoved(selectionGroup),
        actionsGroupBorder: groupBorderRemoved(actionsGroup),
        missingLabels,
        selectBorder,
        buttonBorder,
        libraryValueBorder,
        radioControls,
        checkboxControl,
        sectionHeadings,
        libraryAligned,
        hasPeriodBadge,
        selectCount: section?.querySelectorAll("select.fuel-profile-select").length || 0,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, width);

    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      !metrics.nestedCardBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount === 4 &&
      metrics.libraryGroupBorder &&
      metrics.calculationGroupBorder &&
      metrics.selectionGroupBorder &&
      metrics.actionsGroupBorder &&
      metrics.missingLabels.length === 0 &&
      metrics.selectBorder &&
      metrics.buttonBorder &&
      metrics.libraryValueBorder &&
      metrics.radioControls &&
      metrics.checkboxControl &&
      metrics.sectionHeadings.includes("Fuel Cost Library") &&
      metrics.sectionHeadings.includes("Cost Calculation Settings") &&
      metrics.sectionHeadings.includes("Fuel Cost Selection") &&
      metrics.libraryAligned &&
      metrics.hasPeriodBadge &&
      metrics.selectCount === 5;
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
