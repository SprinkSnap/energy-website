# Start the HOT2000 calculation worker.
# Usage: cd C:\HOT2000Worker && .\start-worker.ps1
$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\HOT2000Worker" }
Set-Location $root

$envFile = Join-Path $root "worker-env.ps1"
if (Test-Path $envFile) {
    . $envFile
} else {
    Write-Host "Create worker-env.ps1 from worker-env.example.ps1 first." -ForegroundColor Yellow
    Write-Host "  copy worker-env.example.ps1 worker-env.ps1" -ForegroundColor Yellow
    exit 1
}

$worker = Join-Path $root "worker.py"
if (-not (Test-Path $worker)) {
    Write-Host "worker.py not found in $root" -ForegroundColor Red
    Write-Host "Run install-worker.ps1 from the energy-website repo." -ForegroundColor Yellow
    exit 1
}

$python = Join-Path $root "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

Write-Host "Starting HOT2000 worker from $root" -ForegroundColor Cyan
& $python $worker
