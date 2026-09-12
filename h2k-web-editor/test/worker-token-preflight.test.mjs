import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..");
const jobsJs = readFileSync(join(root, "hot2000-jobs.js"), "utf8");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const queueRoute = readFileSync(
  join(repoRoot, "app/api/hot2000/queue/status/route.ts"),
  "utf8",
);
const jobsRoute = readFileSync(
  join(repoRoot, "app/api/hot2000/jobs/route.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runGetWorkerToken(envValue) {
  const env = { ...process.env };
  if (envValue === undefined) {
    delete env.HOT2000_WORKER_TOKEN;
  } else {
    env.HOT2000_WORKER_TOKEN = envValue;
  }
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "-e",
      `import { getWorkerToken } from "./lib/hot2000/auth.ts"; console.log(JSON.stringify({ configured: Boolean(getWorkerToken()) }));`,
    ],
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      shell: false,
    },
  );
  assert(result.status === 0, `getWorkerToken probe failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

assert(
  runGetWorkerToken(undefined).configured === false,
  "A: undefined token → configured false",
);
assert(runGetWorkerToken("").configured === false, "B: empty token → configured false");
assert(
  runGetWorkerToken("   \t").configured === false,
  "C: whitespace-only token → configured false",
);
assert(
  runGetWorkerToken("real-secret-token").configured === true,
  "D: non-empty token → configured true",
);

assert(
  queueRoute.includes("getWorkerToken") &&
    /worker_token_configured:\s*workerTokenConfigured/.test(queueRoute),
  "queue/status must expose worker_token_configured boolean",
);
assert(
  !/worker_token[^_]*:\s*getWorkerToken\(\)/.test(queueRoute) &&
    !queueRoute.includes("HOT2000_WORKER_TOKEN"),
  "queue/status must not expose the token value",
);

const createJobIndex = jobsRoute.indexOf("createJob(");
const tokenCheckIndex = jobsRoute.indexOf("HOT2000_WORKER_TOKEN_MISSING");
assert(tokenCheckIndex >= 0, "jobs route must define HOT2000_WORKER_TOKEN_MISSING");
assert(
  tokenCheckIndex < createJobIndex,
  "E: token check must occur before createJob()",
);
assert(
  jobsRoute.includes("status: 503") && jobsRoute.includes("getWorkerToken"),
  "E: jobs route must return 503 when token is missing",
);

assert(
  jobsJs.includes("async function assertHot2000Configured"),
  "hot2000-jobs.js must define assertHot2000Configured",
);
const runJobStart = jobsJs.indexOf("async function runJob");
const runJobBody = jobsJs.slice(runJobStart, runJobStart + 1200);
assert(
  runJobBody.includes("await assertHot2000Configured()"),
  "runJob must call assertHot2000Configured",
);
const assertIndex = runJobBody.indexOf("await assertHot2000Configured()");
const serializeIndex = runJobBody.indexOf("serializeModel()");
const submitIndex = runJobBody.indexOf("submitJob(");
assert(assertIndex >= 0 && assertIndex < serializeIndex, "preflight before serializeModel");
assert(serializeIndex < submitIndex, "serialize before submitJob");

assert(
  jobsJs.includes("parseWorkerTokenConfigured") &&
    jobsJs.includes("return undefined"),
  "missing worker_token_configured must be treated as unknown",
);
assert(
  /status\.workerTokenConfigured\s*!==\s*true/.test(jobsJs),
  "assertHot2000Configured must fail unless workerTokenConfigured === true",
);

assert(
  /function runCalculation/.test(jobsJs) && /function runFullHouseReport/.test(jobsJs),
  "both job entry points must exist",
);

assert(
  appJs.includes("socHot2000NotConfiguredHTML") &&
    appJs.includes("isHot2000ConfigError"),
  "app.js must render dedicated configuration error panels",
);
assert(
  appJs.includes('jobKind:"calculation"') && appJs.includes('jobKind:"report"'),
  "app.js must handle configuration errors for both workflows",
);
assert(
  appJs.includes("No calculation job was created.") &&
    appJs.includes("No report job was created."),
  "configuration errors must state that no job was created",
);

assert(
  jobsJs.includes("No HOT2000 worker is online") ||
    jobsJs.includes("queuedWaitMessage"),
  "H: worker-offline messaging must remain separate from token configuration",
);

const forbiddenTokenLeak = [
  jobsJs,
  appJs,
  queueRoute,
  jobsRoute,
  readFileSync(join(root, "index.html"), "utf8"),
].join("\n");
assert(
  !/worker_token\s*:\s*["'][^"']+["']/.test(forbiddenTokenLeak) &&
    !/HOT2000_WORKER_TOKEN\s*:\s*["'][^"']+["']/.test(forbiddenTokenLeak),
  "I: responses and frontend must not expose the actual token value",
);

console.log("worker-token-preflight.test.mjs: all assertions passed");
