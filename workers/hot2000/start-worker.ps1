# Run from C:\HOT2000Worker after worker-env.ps1 is configured.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$envFile = Join-Path $here "worker-env.ps1"
if (Test-Path $envFile) {
    . $envFile
} else {
    Write-Host "WARNING: worker-env.ps1 not found."
    Write-Host "  copy worker-env.example.ps1 worker-env.ps1"
    Write-Host "  Edit HOT2000_WORKER_TOKEN to match Cloudflare secret HOT2000_WORKER_TOKEN"
}

$python32 = $env:HOT2000_PYTHON32
if (-not $python32 -or -not (Test-Path $python32)) {
    $bundled = Join-Path $here "python32\python.exe"
    if (Test-Path $bundled) {
        $env:HOT2000_PYTHON32 = $bundled
        $python32 = $bundled
    }
}
if (-not $python32 -or -not (Test-Path $python32)) {
    Write-Host "WARNING: HOT2000_PYTHON32 is not set. Full House Report PDF jobs will fail."
    Write-Host "  Run: .\install-python32.ps1"
}
python worker.py
