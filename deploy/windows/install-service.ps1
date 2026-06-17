param(
  [string]$ServiceName = "Teamflow",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Nssm = Get-Command nssm -ErrorAction SilentlyContinue

if (-not $Nssm) {
  Write-Host "NSSM not found." -ForegroundColor Yellow
  Write-Host "Download from https://nssm.cc/download and add nssm.exe to PATH"
  Write-Host "Or run manually: .\deploy\windows\start.ps1"
  exit 1
}

$NodePath = (Get-Command node).Source
$ServerJs = Join-Path $RepoRoot "apps\server\dist\index.js"

& nssm install $ServiceName $NodePath $ServerJs
& nssm set $ServiceName AppDirectory $RepoRoot
& nssm set $ServiceName AppEnvironmentExtra "PORT=$Port" "DATABASE_URL=file:./data/teamflow.db"
& nssm start $ServiceName

Write-Host "Service '$ServiceName' installed and started." -ForegroundColor Green
