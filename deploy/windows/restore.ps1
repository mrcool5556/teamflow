# Teamflow restore for Windows: put a database backup back.
#
#   restore.ps1 --file teamflow_2026-11-12_140201.db [--root <install folder>]
#
# Backs up the current database first, stops Teamflow, swaps the backup in, starts it again and
# waits for it to answer. Log lines: STEP <backup|restore|restart|check>, FAIL <code> <message>,
# RESTORED <file>.

. (Join-Path $PSScriptRoot "_release.ps1")

$opts = @{}
try { $opts = ConvertFrom-GnuArgs $args } catch { Write-Host "FAIL usage $($_.Exception.Message)"; exit 2 }
if ($opts["h"] -or $opts["help"]) {
  Write-Host "Usage: restore.ps1 --file teamflow_YYYY-MM-DD_HHMMSS.db [--root <install folder>]"
  exit 0
}
$name = [string]$opts["file"]
if ($name -notmatch '^teamflow_[A-Za-z0-9_.-]+\.db$') {
  Write-Host "FAIL usage Pass --file with a database backup name such as teamflow_2026-11-12_140201.db"
  exit 2
}

$root = $null
if ($opts["root"]) { $root = (Resolve-Path ([string]$opts["root"])).Path } else { $root = Find-TeamflowRoot $PSScriptRoot }
if (-not $root) { Write-Host "FAIL not-set-up Restore needs a release install."; exit 1 }
Start-TeamflowLog $root
Register-JobPid $root
$env:TEAMFLOW_NESTED_JOB = "1"  # backup.ps1 output is logged by this script
Write-TeamflowLog ""
Write-TeamflowLog "==> Teamflow restore $(Get-Date -Format s): $name"

$backupDir = Get-EnvValue $root "TEAMFLOW_BACKUP_DIR"
if (-not $backupDir) { $backupDir = Join-Path $root "backups" }
elseif (-not [IO.Path]::IsPathRooted($backupDir)) { $backupDir = Join-Path $root $backupDir }
$source = Join-Path $backupDir $name
if (-not (Test-Path $source)) { Write-TeamflowLog "FAIL usage No backup named $name in $backupDir."; exit 1 }
$head = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($source)[0..14])
if ($head -ne "SQLite format 3") { Write-TeamflowLog "FAIL checksum $name is not a SQLite database; nothing was changed."; exit 1 }

if (-not (Enter-UpdateLock $root)) { Write-TeamflowLog "FAIL busy An update or restore is already running."; exit 1 }
$code = 0
try {
  Write-TeamflowLog "STEP backup"
  $out = & (Join-Path $PSScriptRoot "backup.ps1") --db-only --root $root
  $out | ForEach-Object { Write-TeamflowLog $_ }
  if (-not ($out | Where-Object { $_ -match '^BACKUP database ' })) {
    throw "Couldn't back up the current database first, so nothing was changed."
  }

  Write-TeamflowLog "STEP restore"
  Stop-TeamflowServer $root
  $db = Get-DatabasePath $root
  Copy-Item $source "$db.restore" -Force
  Remove-Item "$db-wal", "$db-shm" -Force -ErrorAction SilentlyContinue
  Move-Item "$db.restore" $db -Force
  Write-TeamflowLog "==> $name is now the database."

  Write-TeamflowLog "STEP restart"
  Exit-UpdateLock $root
  Start-TeamflowServer $root

  Write-TeamflowLog "STEP check"
  if (Wait-TeamflowVersion $root "" 60) {
    Write-TeamflowLog "RESTORED $name"
  } else {
    Write-TeamflowLog "FAIL health Teamflow did not answer within 60 seconds after the restore."
    $code = 1
  }
} catch {
  Write-TeamflowLog "FAIL unknown $($_.Exception.Message)"
  $code = 1
  Exit-UpdateLock $root
  try { Start-TeamflowServer $root } catch { }
} finally {
  Exit-UpdateLock $root
}
exit $code
