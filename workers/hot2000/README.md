# HOT2000 Windows Worker

Outbound-only Windows worker that claims calculation jobs from the Energy Compliant Design website, runs HOT2000 Desktop for each job in an isolated directory, and posts fresh SOC Net GJ/a back to the API.

## Prerequisites

- Windows PC with HOT2000 Desktop 11.13 (or matching build)
- Python 3.11+
- `pip install requests pywin32 pywinauto`

## Environment

```powershell
$env:HOT2000_WORKER_TOKEN = "<same value as server HOT2000_WORKER_TOKEN>"
$env:HOT2000_API_BASE = "https://www.energycompliantdesign.ca/api/hot2000"
$env:HOT2000_WORKER_ID = "win-worker-01"
$env:HOT2000_JOBS_ROOT = "C:\HOT2000Worker\jobs"
```

Each job uses a unique directory:

```
C:\HOT2000Worker\jobs\<job_id>\
  input.h2k
  calculated.h2k
```

## Install on the worker PC

From a git checkout of this repo:

```powershell
cd path\to\energy-website\workers\hot2000
.\install-worker.ps1
```

This copies `worker.py` and `diagnose_windows.py` to `C:\HOT2000Worker\`.

## Run

```powershell
cd C:\HOT2000Worker
python worker.py
```

Run one worker process per machine. Launch a second worker on another Windows host with a different `HOT2000_WORKER_ID`.

## HOT2000 command IDs (this build)

| Action   | WM_COMMAND |
|----------|------------|
| Open     | 57601      |
| Save As  | 57604      |
| Calculate| 29791      |
| Exit     | 57665      |

## SOC Net GJ/a field

After calculation, Net GJ/a is read from the saved `calculated.h2k`:

```xml
/HouseFile/AllResults/Results[@houseCode='SOC']/Annual/Consumption/@total
```

This matches the web editor `extractSocResults()` field `netGJa` (`Annual > Consumption @total`). Verified against `h2k-web-editor/template.h2k` (template value `85.205584266` GJ/a).

## Worker API (Bearer auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/hot2000/worker/claim` | Atomically claim next queued job |
| GET | `/api/hot2000/worker/{id}/input` | Download `input.h2k` (`x-worker-id` header) |
| POST | `/api/hot2000/worker/{id}/progress` | Update stage / HOT2000 progress |
| POST | `/api/hot2000/worker/{id}/complete` | Submit `calculated_xml` (server parses SOC Net GJ/a) |
| POST | `/api/hot2000/worker/{id}/fail` | Report failure |

Browser users call only:

- `POST /api/hot2000/jobs` (multipart `file`)
- `GET /api/hot2000/jobs/{id}`

## Local development

1. `export HOT2000_WORKER_TOKEN=dev-worker-token` (shell) before `npm run dev`
2. Start Next.js: `npm run dev`
3. Open `http://localhost:3000/h2k-web-editor/`
4. In another terminal on Windows with HOT2000: run `worker.py` pointed at `http://localhost:3000/api/hot2000`

For API-only testing without HOT2000, progress a claimed job through `saving` → `extracting`, then POST `calculated_xml` to `/complete`.

## Troubleshooting "Could not find HOT2000 main window"

1. Confirm the worker is up to date (`git pull`) and restarted after each deploy.
2. Verify `pywin32` is installed: `pip install pywin32`
3. While HOT2000 is open on the worker PC, run:
   ```powershell
   cd C:\HOT2000Worker
   python diagnose_windows.py
   ```
4. After a failed job, open the debug file (replace the folder name with the real job id):
   ```powershell
   Get-ChildItem C:\HOT2000Worker\jobs\*\window-debug.txt
   Get-Content C:\HOT2000Worker\jobs\<actual-job-id>\window-debug.txt
   ```
5. Ensure the worker runs in the same interactive Windows session where HOT2000 opens (not as a non-interactive service).
