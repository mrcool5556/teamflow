$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

if (-not (Test-Path "apps\server\dist\index.js")) {
  Write-Host "Server not built. Run install.ps1 first." -ForegroundColor Red
  exit 1
}

$env:PORT = if ($env:PORT) { $env:PORT } else { "3000" }
$env:SERVE_WEB = "true"
Write-Host "Starting Teamflow on http://localhost:$($env:PORT)" -ForegroundColor Cyan
node apps/server/dist/index.js
