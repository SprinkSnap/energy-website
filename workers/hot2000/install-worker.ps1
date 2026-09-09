# Copy worker scripts to C:\HOT2000Worker for production use.
$ErrorActionPreference = "Stop"
$dest = "C:\HOT2000Worker"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerSrc = Join-Path $here "worker.py"

if (-not (Test-Path $workerSrc)) {
    throw "worker.py not found at $workerSrc"
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force $workerSrc $dest
Copy-Item -Force (Join-Path $here "diagnose_windows.py") $dest

$buildId = Select-String -Path $workerSrc -Pattern 'WORKER_BUILD_ID = "([^"]+)"' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }
if (-not $buildId) { $buildId = "unknown" }

Set-Content -Path (Join-Path $dest "worker-build-id.txt") -Value $buildId -Encoding ascii

Write-Host "Installed worker build $buildId to $dest"
Write-Host "  cd $dest"
Write-Host "  python worker.py"
Write-Host "Verify console prints: HOT2000 worker $buildId"
