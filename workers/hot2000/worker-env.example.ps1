# Copy to C:\HOT2000Worker\worker-env.ps1 and set your shared secret.
# Must match Cloudflare Worker secret HOT2000_WORKER_TOKEN exactly.

$env:HOT2000_WORKER_TOKEN = "replace-with-your-shared-secret"
$env:HOT2000_API_BASE = "https://energy-website.che-1681.workers.dev/api/hot2000"
$env:HOT2000_WORKER_ID = "win-worker-01"
$env:HOT2000_JOBS_ROOT = "C:\HOT2000Worker\jobs"
# Required if HOT2000 is not in Program Files (adjust to your PC):
$env:HOT2000_EXE = "C:\HOT2000 v11.13b13\HOT2000.exe"
$env:HOT2000_HOME = "C:\HOT2000 v11.13b13"
# Optional but strongly recommended for Full House Report PDF printing (32-bit HOT2000 UI):
# Run install-python32.ps1 once to install 32-bit Python + pywin32, or set manually:
# $env:HOT2000_PYTHON32 = "C:\HOT2000Worker\python32\python.exe"
