/**
 * One-time bootstrap for bundled DWHR catalog rows still at placeholder 0.
 * Power-Pipe: UK technical manual (9.0 L/min) scaled to HOT2000 regression anchors at 9.5 L/min.
 * Ecodrain: piecewise-linear fill on V1000/VT lengths using regression anchor rows.
 *
 * Replace with `npm run import:dwhr-catalog` once DWHR_Efficiency_Data_Entry(3).xlsx is committed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { ECODRAIN_EFFICIENCY_AT_9_5 } from "../data/dwhr-ecodrain-authoritative-efficiencies.mjs";
import { POWER_PIPE_EFFICIENCY_AT_9_5 } from "../data/dwhr-power-pipe-authoritative-efficiencies.mjs";
import { ECODRAIN_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";
import { validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "data/dwhr-products.json");
const ukPdf = process.env.DWHR_UK_POWER_PIPE_PDF || "/tmp/pp-manual.pdf";

/** @param {string} pdfPath */
function loadUkPowerPipeEffectiveness(pdfPath) {
  const py = `
import pdfplumber, re, json, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    full = "\\n".join((p.extract_text() or "") for p in pdf.pages)
out = {}
for line in full.splitlines():
    m = re.match(r"^(C3|C4|R2|R3|R4)-(\\d+)\\b", line.strip())
    if not m:
        continue
    nums = re.findall(r"\\d+\\.\\d+", line)
    if len(nums) < 4:
        continue
    eff = float(nums[3])
    out[f"{m.group(1)}-{m.group(2)}"] = eff
print(json.dumps(out))
`;
  const run = spawnSync("python3", ["-c", py, pdfPath], { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(run.stderr || run.stdout || "Failed to parse UK Power-Pipe PDF");
  }
  return JSON.parse(run.stdout.trim());
}

/**
 * @param {[number, number][]} anchors length -> hot efficiency
 * @param {Record<string, number>} uk
 * @param {string} prefix
 */
function hotFromUkAnchors(prefix, anchors, uk) {
  const scaled = anchors.map(([len, hot]) => {
    const ukEff = ukEffAt(uk, prefix, len);
    return [len, hot / ukEff];
  });
  return (length) => {
    const ukEff = ukEffAt(uk, prefix, length);
    if (length <= scaled[0][0]) return ukEff * scaled[0][1];
    for (let i = 0; i < scaled.length - 1; i += 1) {
      const [l0, s0] = scaled[i];
      const [l1, s1] = scaled[i + 1];
      if (length <= l1) {
        const t = (length - l0) / (l1 - l0);
        const s = s0 + t * (s1 - s0);
        return ukEff * s;
      }
    }
    const [lLast, sLast] = scaled[scaled.length - 1];
    return ukEff * sLast;
  };
}

function roundEff(n) {
  return Math.round(n * 10) / 10;
}

/** @returns {Record<string, number>} */
/**
 * @param {Record<string, number>} uk
 * @param {string} prefix
 * @param {number} length
 */
function ukEffAt(uk, prefix, length) {
  const key = `${prefix}-${length}`;
  if (uk[key] != null) return uk[key];
  const lengths = Object.keys(uk)
    .filter((k) => k.startsWith(`${prefix}-`))
    .map((k) => Number(k.slice(prefix.length + 1)))
    .sort((a, b) => a - b);
  if (length <= lengths[0]) return uk[`${prefix}-${lengths[0]}`];
  if (length >= lengths[lengths.length - 1]) return uk[`${prefix}-${lengths[lengths.length - 1]}`];
  for (let i = 0; i < lengths.length - 1; i += 1) {
    const l0 = lengths[i];
    const l1 = lengths[i + 1];
    if (length <= l1) {
      const u0 = uk[`${prefix}-${l0}`];
      const u1 = uk[`${prefix}-${l1}`];
      const t = (length - l0) / (l1 - l0);
      return u0 + t * (u1 - u0);
    }
  }
  throw new Error(`UK effectiveness missing for ${prefix}-${length}`);
}

function buildPowerPipeHotEffectiveness() {
  return { ...POWER_PIPE_EFFICIENCY_AT_9_5 };
}

/** @returns {Record<string, number>} */
function buildEcodrainHotEffectiveness() {
  /** @type {Record<string, number>} */
  const known = { ...ECODRAIN_EFFICIENCY_AT_9_5 };
  for (const id of ECODRAIN_MODEL_IDS) {
    if (known[id] == null) throw new Error(`Ecodrain authoritative map missing ${id}`);
  }
  return known;
}

function formatGeneratedModule(products) {
  validateDwhrProductCatalog(products);
  const body = JSON.stringify(products, null, 2);
  return `/** Auto-generated from Model Catalog — do not edit. Run: npm run apply:dwhr-regression-efficiencies */\nexport const DWHR_PRODUCTS = ${body};\n`;
}

function main() {
  const pp = buildPowerPipeHotEffectiveness();
  const eco = buildEcodrainHotEffectiveness();
  const products = JSON.parse(readFileSync(jsonPath, "utf8"));
  for (const row of products) {
    if (row.efficiencyAt9_5LMin !== 0) continue;
    if (row.manufacturer === "Power-Pipe") {
      const eff = pp[row.model];
      if (eff == null) throw new Error(`Power-Pipe bootstrap missing ${row.model}`);
      row.efficiencyAt9_5LMin = eff;
    } else if (row.manufacturer === "Ecodrain") {
      row.efficiencyAt9_5LMin = eco[row.model];
    }
  }
  for (const [mfg, model, expected] of DWHR_REGRESSION_SPOT_CHECKS) {
    const row = products.find((p) => p.manufacturer === mfg && p.model === model);
    if (!row || row.efficiencyAt9_5LMin !== expected) {
      throw new Error(`Regression mismatch after bootstrap ${mfg} / ${model}`);
    }
  }
  writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "dwhr-model-catalog.generated.mjs"), formatGeneratedModule(products), "utf8");
  const zeros = products.filter((p) => !p.efficiencyAt9_5LMin).length;
  console.log(`bootstrap-dwhr-missing-efficiencies: patched catalog (${zeros} zeros remaining)`);
}

main();
