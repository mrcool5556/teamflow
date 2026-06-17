param(
  [switch]$SkipBackup,
  [switch]$StartAfter,
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Teamflow update" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git not found. Install Git or copy the repo manually." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
  Write-Host "Not a git repo. Use clone-install.ps1 for first install, or copy files manually." -ForegroundColor Red
  exit 1
}

Set-Location $RepoRoot

& (Join-Path $PSScriptRoot "stop.ps1")

if (-not $SkipBackup -and (Test-Path "data\teamflow.db")) {
  & (Join-Path $PSScriptRoot "backup.ps1")
}

Write-Host "Pulling latest..."
if ($Branch) {
  git fetch origin
  git checkout $Branch
  git pull origin $Branch
} else {
  git pull
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
}

Write-Host "Installing dependencies..."
pnpm install

Write-Host "Building..."
pnpm build

Write-Host "Running migrations..."
pnpm db:migrate

Write-Host ""
Write-Host "Update complete." -ForegroundColor Green
Write-Host "Start:  .\deploy\windows\start.ps1"

if ($StartAfter) {
  & (Join-Path $PSScriptRoot "start.ps1")
}
