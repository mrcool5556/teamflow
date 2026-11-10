# Start Teamflow on Windows.
#
# Release install (made by install.ps1): runs the server and keeps it running. When node exits
# because an update or restore stopped it, it waits for the update to finish (data\.update.lock)
# and starts the new version; after a crash it starts it again; Ctrl+C stops it.
#
#   powershell -ExecutionPolicy Bypass -File <install folder>\current\deploy\windows\start.ps1
#
# Git checkout (development): runs the built server once, as before.

param([string]$Root = "")

. (Join-Path $PSScriptRoot "_release.ps1")

if (-not $Root) { $Root = Find-TeamflowRoot $PSScriptRoot }

if (-not $Root) {
  # ---- git checkout ----
  $RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
  Set-Location $RepoRoot
  if (-not (Test-Path "apps\server\dist\index.js")) {
    Write-Host "Server not built. Run install.ps1 first." -ForegroundColor Red
    exit 1
  }
  $env:TEAMFLOW_ENV_FILE = Join-Path $RepoRoot ".env"
  if (-not (Test-Path $env:TEAMFLOW_ENV_FILE)) {
    Write-Host ".env not found. Run install.ps1 first." -ForegroundColor Red
    exit 1
  }
  $env:SERVE_WEB = "true"
  $Port = $env:PORT
  if (-not $Port) { $Port = (Select-String -Path $env:TEAMFLOW_ENV_FILE -Pattern "^PORT=(\d+)" | Select-Object -First 1).Matches.Groups[1].Value }
  if (-not $Port) { $Port = "3000" }
  Write-Host "Starting Teamflow on http://localhost:$Port" -ForegroundColor Cyan
  node apps/server/dist/index.js
  exit $LASTEXITCODE
}

# ---- release install: supervise ----
$Root = (Resolve-Path $Root).Path
Set-Location $Root
$pidFile = Join-Path $Root "data\supervisor.pid"
Set-Content -Path $pidFile -Value $PID -NoNewline
$lock = Join-Path $Root "data\.update.lock"
$port = Get-TeamflowPort $Root
Write-Host "Teamflow on http://localhost:$port (Ctrl+C stops it; this window keeps it running)" -ForegroundColor Cyan

function Wait-ForUpdate {
  # Wait while an update or restore holds the lock (a dead holder does not count), max 10 min.
  for ($i = 0; $i -lt 600; $i++) {
    if (-not (Test-Path $lock)) { return }
    $holder = (Get-Content $lock -Raw -ErrorAction SilentlyContinue)
    if ($holder) { $holder = $holder.Trim() }
    if (-not ($holder -match '^\d+$') -or -not (Get-Process -Id ([int]$holder) -ErrorAction SilentlyContinue)) { return }
    if ($i -eq 0) { Write-Host "Waiting for the update to finish..." }
    Start-Sleep -Seconds 1
  }
}

try {
  $crashes = 0
  while ($true) {
    Wait-ForUpdate
    $node = Find-TeamflowNode $Root
    $server = Join-Path $Root "current\apps\server\dist\index.js"
    $started = Get-Date
    $eap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $node $server
    $code = $LASTEXITCODE
    $ErrorActionPreference = $eap
    if (Test-Path $lock) { continue }  # stopped for an update or restore
    if ($code -eq 0) { break }
    if (((Get-Date) - $started).TotalSeconds -gt 60) { $crashes = 0 }
    $crashes++
    if ($crashes -ge 5) {
      Write-Host "Teamflow keeps stopping (exit $code). Check $Root\data and the messages above." -ForegroundColor Red
      exit $code
    }
    Write-Host "Teamflow stopped (exit $code); starting it again in 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
  }
} finally {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
