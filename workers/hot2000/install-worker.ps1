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
foreach ($helperName in @("print_helper_32bit.py", "report_print_helper_32bit.py")) {
    $helperPath = Join-Path $here $helperName
    if (Test-Path $helperPath) {
        Copy-Item -Force $helperPath $dest
    }
}
$installPython32 = Join-Path $here "install-python32.ps1"
if (Test-Path $installPython32) {
    Copy-Item -Force $installPython32 $dest
}
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

$pythonArch = if ([Environment]::Is64BitProcess) { "64-bit" } else { "32-bit" }
Write-Host "Installed worker build $buildId to $dest"
Write-Host "Python architecture: $pythonArch (HOT2000 is 32-bit; 32-bit Python is recommended)"
Write-Host 'For Full House Report PDF printing, run install-python32.ps1 (32-bit Python + pywin32)'
Write-Host 'Or set HOT2000_PYTHON32 to 32-bit python.exe in worker-env.ps1'
Write-Host "  cd $dest"
Write-Host '  copy worker-env.example.ps1 worker-env.ps1'
Write-Host '  notepad worker-env.ps1'
Write-Host '  .\start-worker.ps1'
Write-Host "Verify console prints: HOT2000 worker $buildId"
Write-Host 'Verify console prints: API auth OK'
