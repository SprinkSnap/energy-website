# Copy to C:\HOT2000Worker\worker-env.ps1 and set your shared secret.
# Must match Cloudflare Worker secret HOT2000_WORKER_TOKEN exactly.

$env:HOT2000_WORKER_TOKEN = "replace-with-your-shared-secret"
$env:HOT2000_API_BASE = "https://energy-website.che-1681.workers.dev/api/hot2000"
$env:HOT2000_WORKER_ID = "win-worker-01"
$env:HOT2000_JOBS_ROOT = "C:\HOT2000Worker\jobs"
