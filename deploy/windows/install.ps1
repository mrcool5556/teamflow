param(
  [string]$InstallPath = "",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Teamflow Windows install" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install Node 20+ (winget install OpenJS.NodeJS.LTS)" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Enabling pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
}

Set-Location $RepoRoot

if (-not (Test-Path ".env")) {
  Copy-Item "deploy\windows\env.example" ".env"
  Write-Host "Created .env from env.example"
}

(Get-Content ".env") -replace "^PORT=.*", "PORT=$Port" | Set-Content ".env"

Write-Host "Installing dependencies..."
pnpm install

Write-Host "Building..."
pnpm build

Write-Host "Setting up database..."
pnpm db:setup

if ($InstallPath) {
  Write-Host "Install path mode: $InstallPath (copy not automated yet — run from repo or set TEAMFLOW_HOME)"
}

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Start:  .\deploy\windows\start.ps1"
Write-Host "URL:    http://localhost:$Port"
Write-Host "Demo:   demo@teamflow.local / changeme123"
