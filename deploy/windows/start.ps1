$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if (-not (Test-Path "apps\server\dist\index.js")) {
  Write-Host "Server not built. Run install.ps1 first." -ForegroundColor Red
  exit 1
}

# The server loads this file itself; variables already set in this session win over it.
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
