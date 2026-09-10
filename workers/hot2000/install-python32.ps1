# Install 32-bit embeddable Python for HOT2000 Print dialog automation.
$ErrorActionPreference = "Stop"

$dest = "C:\HOT2000Worker\python32"
$version = "3.13.2"
$zipName = "python-$version-embed-win32.zip"
$url = "https://www.python.org/ftp/python/$version/$zipName"
$zipPath = Join-Path $env:TEMP $zipName

Write-Host "Downloading 32-bit Python $version..."
Invoke-WebRequest -Uri $url -OutFile $zipPath

if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $dest -Force
Remove-Item $zipPath

$pthFile = Get-ChildItem -Path $dest -Filter "python*._pth" | Select-Object -First 1
if ($pthFile) {
    $pth = Get-Content $pthFile.FullName
    $pth = $pth | ForEach-Object { if ($_ -eq "#import site") { "import site" } else { $_ } }
    Set-Content -Path $pthFile.FullName -Value $pth -Encoding ascii
}

$pythonExe = Join-Path $dest "python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "python.exe not found in $dest"
}

Write-Host "Installing pip and pywin32 into 32-bit Python..."
& $pythonExe -m ensurepip --upgrade
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install pywin32

$workerRoot = "C:\HOT2000Worker"
$envFile = Join-Path $workerRoot "worker-env.ps1"
$pythonLine = "`$env:HOT2000_PYTHON32 = `"$pythonExe`""
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    if ($content -match "HOT2000_PYTHON32") {
        $content = [regex]::Replace(
            $content,
            '\$env:HOT2000_PYTHON32\s*=.*',
            $pythonLine
        )
    } else {
        $content = $content.TrimEnd() + "`r`n$pythonLine`r`n"
    }
    Set-Content -Path $envFile -Value $content -Encoding utf8
} else {
    $example = Join-Path $workerRoot "worker-env.example.ps1"
    if (Test-Path $example) {
        Copy-Item $example $envFile
        Add-Content -Path $envFile -Value $pythonLine
    } else {
        Set-Content -Path $envFile -Value $pythonLine -Encoding utf8
    }
}

Write-Host ""
Write-Host "32-bit Python installed at: $pythonExe"
Write-Host "HOT2000_PYTHON32 set in $envFile"
Write-Host "Restart the worker: cd C:\HOT2000Worker; .\start-worker.ps1"
