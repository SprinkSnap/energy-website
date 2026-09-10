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

python worker.py
