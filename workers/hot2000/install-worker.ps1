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
$startScript = Join-Path $here "start-worker.ps1"
if (Test-Path $startScript) {
    Copy-Item -Force $startScript $dest
}
$envExample = Join-Path $here "worker-env.example.ps1"
if (Test-Path $envExample) {
    $envDest = Join-Path $dest "worker-env.example.ps1"
    Copy-Item -Force $envExample $envDest
}

$buildId = Select-String -Path $workerSrc -Pattern 'WORKER_BUILD_ID = "([^"]+)"' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }
if (-not $buildId) { $buildId = "unknown" }

Set-Content -Path (Join-Path $dest "worker-build-id.txt") -Value $buildId -Encoding ascii

Write-Host "Installed worker build $buildId to $dest"
Write-Host "  1. copy $dest\worker-env.example.ps1 $dest\worker-env.ps1  (edit token + paths)"
Write-Host "  2. cd $dest"
Write-Host "  3. .\start-worker.ps1"
Write-Host "Verify console prints: HOT2000 worker $buildId and API auth OK"
