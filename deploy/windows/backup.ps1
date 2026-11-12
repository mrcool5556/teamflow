# Teamflow backup for Windows: the database (SQLite online backup, safe while Teamflow runs) and,
# optionally, uploaded files. Prints "BACKUP database <file>" / "BACKUP uploads <file>" lines.
#
#   backup.ps1                 database + uploads
#   backup.ps1 --db-only       database only (fast; used by update)
#   backup.ps1 --uploads-only  uploaded files only
#   backup.ps1 --root <folder> the install folder (found automatically otherwise)
#
# Backups go to <install folder>\backups (TEAMFLOW_BACKUP_DIR in .env changes it). After each
# backup the oldest beyond the keep settings in data\backup-settings.json are deleted (default:
# 10 database backups, 1 upload archive); named checkpoints are never deleted. In a git checkout (no releases folder) it copies data\teamflow.db
# to data\backups as before.

. (Join-Path $PSScriptRoot "_release.ps1")

$opts = @{}
try { $opts = ConvertFrom-GnuArgs $args } catch { Write-Output "Unknown option: $($_.Exception.Message)"; exit 2 }
$mode = "full"
if ($opts["db-only"]) { $mode = "db-only" }
if ($opts["uploads-only"]) { $mode = "uploads-only" }

$root = $null
if ($opts["root"]) { $root = (Resolve-Path ([string]$opts["root"])).Path } else { $root = Find-TeamflowRoot $PSScriptRoot }

if (-not $root) {
  # Git checkout: the old plain copy.
  $repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  $db = Join-Path $repo "data\teamflow.db"
  if (-not (Test-Path $db)) { Write-Output "No database found at $db"; exit 1 }
  $dir = Join-Path $repo "data\backups"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $dest = Join-Path $dir ("teamflow_{0}.db" -f (Get-Date -Format "yyyy-MM-dd_HHmmss"))
  Copy-Item $db $dest
  Write-Output "BACKUP database $dest"
  exit 0
}

Register-JobPid $root
# Started by the server (not by update.ps1 / restore.ps1, which log our output themselves): the
# server cannot capture our output through its cmd.exe hop, so write the log ourselves too.
$ownLog = ($env:TEAMFLOW_SERVER_PID -and -not $env:TEAMFLOW_NESTED_JOB)
if ($ownLog) { Start-TeamflowLog $root }
function Say([string]$Line) {
  if ($ownLog) { Write-TeamflowLog $Line } else { Write-Output $Line }
}
$backupDir = Get-EnvValue $root "TEAMFLOW_BACKUP_DIR"
if (-not $backupDir) { $backupDir = Join-Path $root "backups" }
elseif (-not [IO.Path]::IsPathRooted($backupDir)) { $backupDir = Join-Path $root $backupDir }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

function Get-FreeName {
  param([string]$Prefix, [string]$Ext)
  $candidate = Join-Path $backupDir "$Prefix$stamp$Ext"
  $n = 2
  while (Test-Path $candidate) {
    $candidate = Join-Path $backupDir "$Prefix$stamp-$n$Ext"
    $n++
  }
  return $candidate
}

# Keep settings from data\backup-settings.json (Server admin): each an integer 1-100, else default.
function Get-KeepSetting([string]$Key, [int]$Default) {
  $file = Join-Path $root "data\backup-settings.json"
  try {
    $v = (Get-Content $file -Raw -ErrorAction Stop | ConvertFrom-Json).$Key
    if ($v -is [int] -or $v -is [long]) { if ($v -ge 1 -and $v -le 100) { return [int]$v } }
  } catch { }
  return $Default
}

# Delete the oldest automatic backups of one type beyond the keep setting. Only backup.ps1's own
# names are matched; checkpoints (teamflow-pre-*, *-before-releases.db, ...) are never touched.
function Remove-OldBackups([string]$Type) {
  if ($Type -eq "database") {
    $keep = Get-KeepSetting "keepDatabaseBackups" 10
    $pattern = '^teamflow_\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?\.db$'
  } else {
    $keep = Get-KeepSetting "keepUploadArchives" 1
    $pattern = '^teamflow_uploads_\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?\.(tar\.gz|zip)$'
  }
  Get-ChildItem $backupDir -File | Where-Object { $_.Name -match $pattern } |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | ForEach-Object {
      Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
      Say "PRUNED $Type $($_.Name)"
    }
}

if ($mode -ne "uploads-only") {
  $db = Get-DatabasePath $root
  if (-not (Test-Path $db)) { Say "No database found at $db"; exit 1 }
  $dest = Get-FreeName "teamflow_" ".db"
  Say "==> Database backup starting..."
  $node = Find-TeamflowNode $root
  $tool = Join-Path $root "current\apps\server\dist\backup-db.js"
  Push-Location $root
  $eap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & $node $tool $dest 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $eap
    Pop-Location
  }
  if ($code -ne 0) { Say "Database backup failed: $out"; exit 1 }
  Say "BACKUP database $dest"
  Remove-OldBackups "database"
}

if ($mode -ne "db-only") {
  $uploads = Get-EnvValue $root "UPLOAD_DIR"
  if (-not $uploads) { $uploads = Join-Path $root "data\uploads" }
  elseif (-not [IO.Path]::IsPathRooted($uploads)) { $uploads = Join-Path $root ($uploads -replace '^\./', '') }
  if (Test-Path $uploads) {
    $zip = Get-FreeName "teamflow_uploads_" ".zip"
    Say "==> Uploads backup starting..."
    & "$env:SystemRoot\System32\tar.exe" -a -c -f $zip -C (Split-Path $uploads -Parent) (Split-Path $uploads -Leaf)
    if ($LASTEXITCODE -ne 0) { Say "Uploads backup failed."; exit 1 }
    Say "BACKUP uploads $zip"
    Remove-OldBackups "uploads"
  } else {
    Say "No uploads folder at $uploads (skipped)."
  }
}
