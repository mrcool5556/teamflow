param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl,

  [string]$InstallPath = "D:\teamflow",
  [string]$Branch = "main",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

Write-Host "Teamflow git install" -ForegroundColor Cyan
Write-Host "Repo:   $RepoUrl"
Write-Host "Path:   $InstallPath"
Write-Host "Branch: $Branch"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git not found. Install: winget install Git.Git" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install: winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
  exit 1
}

$parent = Split-Path $InstallPath -Parent
if ($parent -and -not (Test-Path $parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

if (Test-Path $InstallPath) {
  if (Test-Path (Join-Path $InstallPath ".git")) {
    Write-Host "Already cloned at $InstallPath — running update + install steps instead."
    Set-Location $InstallPath
    git fetch origin
    git checkout $Branch
    git pull origin $Branch
    & (Join-Path $InstallPath "deploy\windows\install.ps1") -Port $Port
    exit $LASTEXITCODE
  }

  Write-Host "Path exists but is not a git repo: $InstallPath" -ForegroundColor Red
  exit 1
}

git clone --branch $Branch $RepoUrl $InstallPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $InstallPath "deploy\windows\install.ps1") -Port $Port

Write-Host ""
Write-Host "Clone install complete." -ForegroundColor Green
Write-Host "cd $InstallPath"
Write-Host ".\deploy\windows\start.ps1"
