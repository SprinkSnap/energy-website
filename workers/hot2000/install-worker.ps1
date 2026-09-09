# Copy worker scripts to C:\HOT2000Worker for production use.
$ErrorActionPreference = "Stop"
$dest = "C:\HOT2000Worker"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $here "worker.py") $dest
Copy-Item -Force (Join-Path $here "diagnose_windows.py") $dest
Write-Host "Installed to $dest"
Write-Host "  python $dest\worker.py"
Write-Host "  python $dest\diagnose_windows.py"
