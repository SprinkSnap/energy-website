import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const weather = JSON.parse(readFileSync(join(root, "catalog/sections/weather.json"), "utf8"));
const regions = JSON.parse(readFileSync(join(root, "catalog/options/weather-regions.json"), "utf8"));
const locations = JSON.parse(readFileSync(join(root, "catalog/options/weather-locations.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const match = re.exec(source);
  assert(match, `${name} not found`);
  const start = match.index;
  let depth = 0;
  let started = false;
  for (let i = start + match[0].length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const renderWeather = extractFunction(appJs, "renderWeatherTab");
assert(renderWeather.includes("H2kCatalog.renderSection"), "renderWeatherTab delegates to catalog renderer");
assert(renderWeather.includes('getSection?.("weather")'), "renderWeatherTab checks catalog section");

const flatPaths = weather.groups.flatMap((g) => g.fields).flatMap((f) => (f.path ? [f.path] : []));
for (const path of [
  "/HouseFile/ProgramInformation/Weather/@library",
  "/HouseFile/ProgramInformation/Weather/Region",
  "/HouseFile/ProgramInformation/Weather/Location",
  "/HouseFile/ProgramInformation/Weather/@depthOfFrost",
  "/HouseFile/ProgramInformation/Weather/@heatingDegreeDay",
]) {
  assert(flatPaths.includes(path), `weather catalog must bind ${path}`);
}

const ontario = locations.recordsByRegion["5"].find((r) => r.name === "OTTAWA INTL");
assert(ontario?.code === "260" && ontario.heatingDegreeDays === 4354, "Ottawa Intl HDD preserved in catalog");

const region5 = regions.options["5"];
assert(region5.en === "ONTARIO", "Ontario region label preserved");

const template = readFileSync(join(root, "template.h2k"), "utf8");
assert(template.includes("<Weather"), "template has Weather element");

assert(appJs.includes("weatherLibraryControlHTML"), "weather library control renderer exists");
assert(stylesCss.includes(".weather-section .weather-library-control-row"), "weather library control row responsive rules");
assert(stylesCss.includes(".weather-section .weather-regional-row"), "weather regional row responsive rules");
assert(stylesCss.includes(".weather-section .weather-site-row"), "weather site row responsive rules");
assert(appJs.includes("applyCatalogWeatherData"), "app applies catalog weather options");
assert(readFileSync(join(root, "index.html"), "utf8").includes("h2k-catalog.js"), "index loads catalog runtime");

assert(weather.hot2000?.controlCount === 6, "weather hot2000 controlCount is 6");
const hotLabels = weather.hot2000.controls.map((c) => c.label);
for (const label of [
  "Weather Library",
  "Change",
  "Region",
  "Location",
  "Depth of frostline",
  "Heating Degree Days from Weather File :",
]) {
  assert(hotLabels.includes(label), `hot2000 inventory includes ${label}`);
}

const groupTitles = weather.groups.map((g) => g.title);
assert(groupTitles.includes("Weather Library Selection"), "weather library selection group");
assert(groupTitles.includes("Regional Location"), "regional location group");
assert(groupTitles.includes("Site Specific Data"), "site specific data group");

const catalogLabels = weather.groups
  .flatMap((g) => g.fields)
  .filter((f) => f.label)
  .map((f) => f.label);
assert(catalogLabels.length === 5, "catalog has 5 labeled field entries (Weather Library + Change share one control)");
assert(catalogLabels.includes("Weather Library"), "weather library label preserved");

console.log("catalog-weather.test.mjs: all assertions passed");
