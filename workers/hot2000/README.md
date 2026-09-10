# HOT2000 Windows Worker

Outbound-only Windows worker that claims calculation jobs from the Energy Compliant Design website, runs HOT2000 Desktop for each job in an isolated directory, and posts fresh SOC Net GJ/a back to the API.

## Prerequisites

- Windows PC with HOT2000 Desktop 11.13 (or matching build)
- Python 3.11+
- `pip install -r requirements.txt`

## Environment

Copy `worker-env.example.ps1` to `C:\HOT2000Worker\worker-env.ps1`, set the token, then run `. .\worker-env.ps1` before `python worker.py`.

```powershell
$env:HOT2000_WORKER_TOKEN = "<same value as server HOT2000_WORKER_TOKEN>"
$env:HOT2000_API_BASE = "https://energy-website.che-1681.workers.dev/api/hot2000"
# Staging workers.dev URL above; use https://www.energycompliantdesign.ca/api/hot2000 in production.
# Must match the Cloudflare Worker secret HOT2000_WORKER_TOKEN exactly (no extra spaces).
$env:HOT2000_WORKER_ID = "win-worker-01"
$env:HOT2000_JOBS_ROOT = "C:\HOT2000Worker\jobs"
```

### Set the server secret (once)

Cloudflare dashboard → **Workers & Pages** → **energy-website** → **Settings** → **Variables and Secrets** → add secret `HOT2000_WORKER_TOKEN` with the same string you use on the Windows PC.

Or from a machine with Wrangler access:

```bash
npx wrangler secret put HOT2000_WORKER_TOKEN
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
copy worker-env.example.ps1 worker-env.ps1   # first time only — edit token + HOT2000_EXE
.\start-worker.ps1
```

Or manually:

```powershell
cd C:\HOT2000Worker
. .\worker-env.ps1
python worker.py
```

The console must print `HOT2000 worker 2026-09-10g` (or newer), then `API auth OK`. Run `git pull` and `install-worker.ps1` after each deploy. If the web UI stays at 20%, the worker is not running or cannot reach the API.

### `Windowcodes2025.cod was not found` (StdLibs)

HOT2000 is pointing at a StdLibs folder that is missing code files (often `C:\HOT2000 v11.13b13\StdLibs`).

**Option A — fix the library path (recommended):**

1. Open HOT2000 Desktop manually (double-click `HOT2000.exe`).
2. **File → Preferences → Libraries**
3. Set the path to the `StdLibs` folder next to your real `HOT2000.exe` (e.g. `C:\Program Files (x86)\HOT2000\StdLibs`).
4. Click OK, close HOT2000, retry **Generate Net (GJ/a)**.

**Option B — copy StdLibs to the expected folder:**

```powershell
# Find the file on your PC
Get-ChildItem C:\ -Recurse -Filter Windowcodes2025.cod -ErrorAction SilentlyContinue | Select-Object FullName

# Example: copy StdLibs into the path HOT2000 expects
New-Item -ItemType Directory -Force -Path "C:\HOT2000 v11.13b13\StdLibs"
Copy-Item -Recurse "C:\Program Files (x86)\HOT2000\StdLibs\*" "C:\HOT2000 v11.13b13\StdLibs\"
```

### `(5, 'PostMessage', 'Access is denied.')`

Windows blocked UI automation from the worker to HOT2000. Common fixes:

1. Run **PowerShell as Administrator** if HOT2000 was started elevated (or start HOT2000 normally without elevation).
2. Run the worker in the **same interactive desktop session** where HOT2000 opens — not as a Windows service or scheduled task.
3. Close other HOT2000 windows, then retry.
4. Update to worker build `2026-09-10c`+ (retries SendMessage / thread attach).

### Stuck at 90% “Closing HOT2000…”

HOT2000 is blocked on a save-on-exit or other modal dialog. On the worker PC, check for a HOT2000 popup and click **No** or **OK**. Worker build `2026-09-10a`+ auto-dismisses these dialogs and force-closes after ~45s.

If stuck, kill HOT2000 in Task Manager, restart `python worker.py`, and retry.

### `[WinError 2] The system cannot find the file specified`

The worker could not find `HOT2000.exe`. Set the install path before starting:

```powershell
$env:HOT2000_EXE = "C:\HOT2000 v11.13b13\HOT2000.exe"
$env:HOT2000_HOME = "C:\HOT2000 v11.13b13"
python worker.py
```

Worker build `2026-09-09h`+ auto-searches common install folders; explicit env vars are still recommended.

### 401 Unauthorized on `/worker/claim`

The `HOT2000_WORKER_TOKEN` on the Windows PC does not match the Cloudflare secret. Set both to the **same** value, redeploy if you changed the secret, restart `python worker.py`. A missing server secret also returns 401.

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
