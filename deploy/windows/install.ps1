param(
  [string]$InstallPath = "",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Teamflow Windows install" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install Node 20+ (winget install OpenJS.NodeJS.LTS)" -ForegroundColor Red
  exit 1
}

Set-Location $RepoRoot

if (-not (Test-Path ".env")) {
  Copy-Item "deploy\windows\env.example" ".env"
  Write-Host "Created .env from env.example"
}

(Get-Content ".env") -replace "^PORT=.*", "PORT=$Port" | Set-Content ".env"

Write-Host "Installing dependencies..."
Invoke-Pnpm install

Write-Host "Building..."
Invoke-Pnpm -r build

Write-Host "Setting up database..."
Invoke-Pnpm --filter "@teamflow/db" migrate
Invoke-Pnpm --filter "@teamflow/db" seed

if ($InstallPath) {
  Write-Host "Install path mode: $InstallPath (copy not automated yet - run from repo or set TEAMFLOW_HOME)"
}

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Start:  .\deploy\windows\start.ps1"
Write-Host "URL:    http://localhost:$Port"
Write-Host "Demo:   demo@teamflow.local / changeme123"
