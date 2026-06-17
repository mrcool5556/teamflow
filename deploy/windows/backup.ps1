param(
  [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$DbPath = Join-Path $RepoRoot "data\teamflow.db"

if (-not (Test-Path $DbPath)) {
  Write-Host "Database not found at $DbPath" -ForegroundColor Red
  exit 1
}

if (-not $BackupDir) {
  $BackupDir = Join-Path $RepoRoot "data\backups"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$Dest = Join-Path $BackupDir "teamflow_$Stamp.db"
Copy-Item $DbPath $Dest
Write-Host "Backed up to $Dest" -ForegroundColor Green
