param(
  [switch]$SkipBackup,
  [switch]$StartAfter,
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
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
  Ensure-Pnpm
}

Write-Host "Installing dependencies..."
Invoke-Pnpm install

Write-Host "Building..."
Invoke-Pnpm build

Write-Host "Running migrations..."
Invoke-Pnpm db:migrate

Write-Host ""
Write-Host "Update complete." -ForegroundColor Green
Write-Host "Start:  .\deploy\windows\start.ps1"

if ($StartAfter) {
  & (Join-Path $PSScriptRoot "start.ps1")
}
