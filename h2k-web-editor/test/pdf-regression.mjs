import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const jobsJs = readFileSync(join(root, "hot2000-jobs.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const workerPy = readFileSync(
  join(root, "..", "workers", "hot2000", "worker.py"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(name) {
  const re = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const start = appJs.search(re);
  assert(start >= 0, `${name} not found`);
  let depth = 0;
  let started = false;
  for (let i = start; i < appJs.length; i += 1) {
    const ch = appJs[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return appJs.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
}

const syncReviewActions = extractFunction("syncReviewActions");
const printSocFullHouseReportPdf = extractFunction("printSocFullHouseReportPdf");

assert(
  indexHtml.includes('id="printSocPdfBtn"'),
  "index.html must expose Full House Report button",
);
assert(
  (indexHtml.match(/id="printSocPdfBtn"/g) || []).length === 1,
  "Full House Report button must appear once (Review step only)",
);
assert(
  !indexHtml.split("</header>")[0].includes('id="printSocPdfBtn"'),
  "Full House Report button must not live in the top toolbar",
);
assert(
  /review-step-report[\s\S]*id="printSocPdfBtn"/.test(indexHtml),
  "Full House Report button must live in the Review Full House Report step",
);
assert(
  indexHtml.includes("Generate Full House Report (SOC)"),
  "Full House Report button must use Generate Full House Report (SOC) label",
);
assert(
  indexHtml.includes('id="generateSocBtn"'),
  "index.html must expose Generate Net (GJ/a) button on Review",
);
assert(
  (indexHtml.match(/id="generateSocBtn"/g) || []).length === 1,
  "Generate Net button must appear once (Review step only)",
);
assert(
  !indexHtml.split("</header>")[0].includes('id="generateSocBtn"'),
  "Generate Net button must not live in the top toolbar",
);
assert(
  /No separate Calculate step/.test(indexHtml),
  "Review copy must describe report-only Full House Report flow",
);
assert(
  /printSocFullHouseReportPdf/.test(appJs),
  "app.js must implement printSocFullHouseReportPdf",
);
assert(
  /canPrint=ok && !socReportPdfActive/.test(syncReviewActions),
  "Full House Report must unlock after validation passes",
);
assert(
  !/hasFreshWorkerSocResult\(\)/.test(syncReviewActions),
  "Full House Report must not require Generate Net first",
);
assert(
  !/hasFreshWorkerSocResult/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must not require Generate Net first",
);
assert(
  /Hot2000Jobs\.runFullHouseReport/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must call Hot2000Jobs.runFullHouseReport",
);
assert(
  /downloadPdfBase64/.test(printSocFullHouseReportPdf),
  "printSocFullHouseReportPdf must download worker PDF",
);
assert(
  /runFullHouseReport/.test(jobsJs),
  "hot2000-jobs.js must expose runFullHouseReport",
);
assert(
  !/CMD_CALCULATE/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker flow must not run Calculate",
);
assert(
  /open_soc_full_house_report/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker must open Report menu path",
);
assert(
  /save_full_house_report_pdf/.test(
    workerPy.slice(
      workerPy.indexOf("def run_hot2000_full_house_report"),
      workerPy.indexOf("def run_hot2000("),
    ),
  ),
  "Full house report worker must print report to PDF",
);
assert(
  /wait_for_pdf_output/.test(workerPy),
  "worker must wait for PDF output after Full House Report generation",
);
assert(
  /normalize_job_pids/.test(workerPy),
  "worker must coerce single PID values before iterating job PIDs",
);
assert(
  /confirm_full_house_report_data_source/.test(workerPy),
  "worker must confirm Use Data From dialog before opening report",
);
assert(
  /House with standard operating conditions/.test(workerPy),
  "worker must target House with standard operating conditions in Use Data From dialog",
);
assert(
  /send_ctrl_p_to_window/.test(workerPy),
  "worker must send real Ctrl+P to the report viewer",
);
assert(
  /select_pdf_printer/.test(workerPy),
  "worker must select Microsoft Print to PDF before printing",
);
assert(
  /find_save_pdf_dialog/.test(workerPy),
  "worker must locate Save Print Output As dialog",
);
assert(
  /select_soc_data_source_combo/.test(workerPy),
  "worker must select SOC from Use Data From combo without picking bare House",
);
assert(
  /is_soc_data_source_label/.test(workerPy),
  "worker must distinguish SOC combo labels from default House",
);
assert(
  /hot2000_window_surfaces/.test(workerPy),
  "worker must enumerate MDI child surfaces when locating report viewer",
);
assert(
  /wait_for_report_print_target/.test(workerPy),
  "worker must wait for Full House Report viewer before printing",
);
assert(
  /report_window_debug/.test(workerPy),
  "worker must write report window diagnostics on detection failure",
);
assert(
  /select_listview_any/.test(workerPy),
  "worker must select Microsoft Print to PDF from SysListView32 printer list",
);
assert(
  /list_print_dialog_printers/.test(workerPy),
  "worker must enumerate printers from Print dialog list views",
);
assert(
  /submit_print_dialog_to_pdf/.test(workerPy),
  "worker must submit Print dialog with retry and blind Print fallback",
);
assert(
  /list_listbox_items/.test(workerPy),
  "worker must read printer names from ListBox controls in Print dialog",
);

function canPrint(reviewValidationPassed, errors, socCalculationActive, socReportPdfActive) {
  const ok = !!reviewValidationPassed && !errors.length;
  return ok && !socCalculationActive && !socReportPdfActive;
}

assert(canPrint(true, [], false, false), "validated model enables Full House Report");
assert(!canPrint(false, [], false, false), "unvalidated model disables Full House Report");
assert(!canPrint(true, ["err"], false, false), "validation errors disable Full House Report");
assert(!canPrint(true, [], true, false), "Full House Report disabled during calculation");
assert(!canPrint(true, [], false, true), "Full House Report disabled while generating");

console.log("pdf-regression: all checks passed");
