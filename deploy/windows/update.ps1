# Teamflow update for Windows: download a prebuilt release, verify it, back up, migrate, switch,
# restart, check, and roll back if anything after the stop fails. Same steps and log lines as
# deploy/proxmox-lxc/update.sh:
#   STEP <download|backup|install|restart|check>
#   FAIL <network|checksum|disk|migrate|health|not-set-up|busy|usage|unknown> <message>
#   DONE <version>
#
# Usage (Linux-style flags, so the server calls both platforms the same way):
#   powershell -ExecutionPolicy Bypass -File update.ps1 [--version X.Y.Z] [--channel stable|prerelease]
#       [--backup-full] [--skip-backup] [--reinstall] [--allow-downgrade] [--root <folder>]

. (Join-Path $PSScriptRoot "_release.ps1")

$Repo = "mrcool5556/teamflow"
$ReleaseBase = "https://github.com/$Repo/releases/download"
$ApiBase = "https://api.github.com/repos/$Repo"
if ($env:TEAMFLOW_RELEASE_BASE) { $ReleaseBase = $env:TEAMFLOW_RELEASE_BASE }
if ($env:TEAMFLOW_API_BASE) { $ApiBase = $env:TEAMFLOW_API_BASE }

function Fail {
  param([string]$Code, [string]$Message)
  Write-TeamflowLog "FAIL $Code $Message"
  throw [System.OperationCanceledException]::new("FAIL $Code")
}

function Show-Usage {
  Write-Host @"
Teamflow update: install a prebuilt release from GitHub.

Usage:
  update.ps1 [--version X.Y.Z] [--channel stable|prerelease] [--backup-full] [--skip-backup]
             [--reinstall] [--allow-downgrade] [--root <install folder>]
"@
}

function Get-LatestVersion {
  param([string]$Channel)
  $headers = @{ Accept = "application/vnd.github+json"; "User-Agent" = "Teamflow-updater" }
  if ($Channel -eq "prerelease") {
    $list = Invoke-RestMethod -Uri "$ApiBase/releases?per_page=20" -Headers $headers -TimeoutSec 20
    $pick = $list | Where-Object { -not $_.draft } | Select-Object -First 1
  } else {
    $pick = Invoke-RestMethod -Uri "$ApiBase/releases/latest" -Headers $headers -TimeoutSec 20
  }
  if (-not $pick) { return $null }
  return ($pick.tag_name -replace '^v', '')
}

function Compare-SemVer {
  param([string]$A, [string]$B)
  $pa = $A.Split("-")[0].Split(".") | ForEach-Object { [int]$_ }
  $pb = $B.Split("-")[0].Split(".") | ForEach-Object { [int]$_ }
  for ($i = 0; $i -lt 3; $i++) {
    if ($pa[$i] -ne $pb[$i]) { return $pa[$i] - $pb[$i] }
  }
  $ra = $A.Contains("-"); $rb = $B.Contains("-")
  if ($ra -and -not $rb) { return -1 }
  if ($rb -and -not $ra) { return 1 }
  return [string]::Compare($A, $B)
}

$opts = @{}
try { $opts = ConvertFrom-GnuArgs $args } catch { Write-Host "FAIL usage $($_.Exception.Message)"; exit 2 }
if ($opts.ContainsKey("h") -or $opts.ContainsKey("help")) { Show-Usage; exit 0 }
if ($opts.ContainsKey("branch")) {
  Write-Host "FAIL usage --branch is gone: Teamflow now installs prebuilt releases, not git branches."
  exit 2
}
$version = ""
if ($opts["version"]) { $version = ([string]$opts["version"]) -replace '^v', '' }
if ($version -and $version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$') {
  Write-Host "FAIL usage Not a version number: $version"; exit 2
}
$channel = "stable"
if ($opts["channel"]) { $channel = [string]$opts["channel"] }

$root = $null
if ($opts["root"]) { $root = (Resolve-Path ([string]$opts["root"])).Path } else { $root = Find-TeamflowRoot $PSScriptRoot }
if (-not $root) {
  Write-Host "FAIL not-set-up This Teamflow runs from a git checkout, not a release. Run the installer once to switch: irm https://github.com/$Repo/releases/latest/download/install.ps1 | iex"
  exit 1
}
Start-TeamflowLog $root
Register-JobPid $root
$env:TEAMFLOW_NESTED_JOB = "1"  # backup.ps1 output is logged by this script

Write-TeamflowLog ""
Write-TeamflowLog "==> Teamflow update $(Get-Date -Format s)"

if (-not (Enter-UpdateLock $root)) {
  Write-TeamflowLog "FAIL busy Another update is already running."
  exit 1
}

$state = @{ Stopped = $false; Migrated = $false; Switched = $false; DbBackup = $null; NewDir = $null }
$current = Join-Path $root "current"
$prevDir = Get-JunctionTarget $current
$prevVersion = "unknown"
if ($prevDir) { $prevVersion = Get-ReleaseVersion $prevDir }
$exitCode = 0

try {
  if (-not $prevDir) {
    Fail "not-set-up" "No release is installed in $root. Run the installer: irm https://github.com/$Repo/releases/latest/download/install.ps1 | iex"
  }
  Write-TeamflowLog "    Installed: v$prevVersion ($prevDir)"

  # ---- download ----
  Write-TeamflowLog "STEP download"
  if (-not $version) {
    try { $version = Get-LatestVersion $channel } catch { $version = $null }
    if (-not $version) {
      Fail "network" "Couldn't reach GitHub to look for a new version. Check this PC's internet connection, then try again."
    }
  }
  Write-TeamflowLog "    Target: v$version"
  if ($version -eq $prevVersion -and -not $opts["reinstall"]) {
    Write-TeamflowLog "==> Already on v$version. Nothing to do."
    Write-TeamflowLog "DONE $version"
    return
  }
  if ($prevVersion -ne "unknown" -and -not $opts["allow-downgrade"] -and (Compare-SemVer $version $prevVersion) -lt 0) {
    Fail "usage" "v$version is older than the installed v$prevVersion. Use --allow-downgrade to install it anyway."
  }

  $drive = (Get-Item $root).PSDrive
  $freeMb = [math]::Floor($drive.Free / 1MB)
  if ($freeMb -lt 300) {
    Fail "disk" "Only $freeMb MB free; an update needs 300 MB. Delete old backups or files, then try again."
  }

  $asset = "teamflow-v$version-win-x64.zip"
  $work = Join-Path $root "releases\.download-v$version"
  if (Test-Path $work) { Remove-Item $work -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  Write-TeamflowLog "==> Downloading $asset"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/v$version/$asset" -OutFile (Join-Path $work $asset) -TimeoutSec 300
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/v$version/SHA256SUMS" -OutFile (Join-Path $work "SHA256SUMS") -TimeoutSec 60
  } catch {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    Fail "network" "Couldn't download v$version from GitHub. Check this PC's internet connection, then try again."
  }
  $expected = (Get-Content (Join-Path $work "SHA256SUMS") | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1)
  $actual = (Get-FileHash (Join-Path $work $asset) -Algorithm SHA256).Hash.ToLower()
  if (-not $expected -or $expected.Split(" ")[0].ToLower() -ne $actual) {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    Fail "checksum" "The download of v$version didn't match its checksum, so it was not installed. Try again; if it keeps failing, the release may be broken."
  }
  Write-TeamflowLog "==> Verified $asset (sha256 ok)"

  $newDir = Join-Path $root "releases\v$version"
  $tmpDir = "$newDir.tmp"
  if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  & "$env:SystemRoot\System32\tar.exe" -x -f (Join-Path $work $asset) -C $tmpDir
  if ($LASTEXITCODE -ne 0) { Fail "checksum" "The download of v$version could not be unpacked." }
  Remove-Item $work -Recurse -Force
  if ((Get-ReleaseVersion $tmpDir) -ne $version) {
    Remove-Item $tmpDir -Recurse -Force
    Fail "checksum" "The download says it is not v$version. Not installed."
  }
  $sameAsRunning = ($prevDir -and ((Resolve-Path $prevDir).Path -eq $newDir))
  if ($sameAsRunning) { $newDir = "$newDir-reinstall" }
  if (Test-Path $newDir) { Remove-Item $newDir -Recurse -Force }
  Move-Item $tmpDir $newDir
  $state.NewDir = $newDir

  # ---- backup ----
  Write-TeamflowLog "STEP backup"
  $backupScript = Join-Path $prevDir "deploy\windows\backup.ps1"
  if ($opts["backup-full"]) {
    Write-TeamflowLog "==> Backing up uploaded files (Teamflow keeps running)..."
    & $backupScript --uploads-only --root $root | ForEach-Object { Write-TeamflowLog $_ }
  }

  Write-TeamflowLog "==> Stopping Teamflow..."
  Stop-TeamflowServer $root
  $state.Stopped = $true

  if (-not $opts["skip-backup"]) {
    $out = & $backupScript --db-only --root $root
    $out | ForEach-Object { Write-TeamflowLog $_ }
    $line = $out | Where-Object { $_ -match '^BACKUP database ' } | Select-Object -Last 1
    if (-not $line) { Fail "unknown" "The database backup did not finish, so nothing was changed." }
    $state.DbBackup = $line -replace '^BACKUP database ', ''
  } else {
    Write-TeamflowLog "==> Database backup skipped (--skip-backup)."
  }

  # ---- install ----
  Write-TeamflowLog "STEP install"
  Write-TeamflowLog "==> Database migrations..."
  $state.Migrated = $true
  $node = Find-TeamflowNode $root
  Push-Location $root
  $eap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"  # node writes to stderr; PowerShell 5.1 would throw on it
  try {
    $migrateOut = & $node (Join-Path $newDir "apps\server\dist\migrate.js") 2>&1
    $migrateCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $eap
    Pop-Location
  }
  $migrateOut | ForEach-Object { Write-TeamflowLog "    $_" }
  if ($migrateCode -ne 0) {
    Fail "migrate" "The database update for v$version failed. The backup was restored and v$prevVersion is running again."
  }

  Write-TeamflowLog "==> Switching current -> v$version"
  Set-Junction $current $newDir
  $state.Switched = $true

  # ---- restart ----
  Write-TeamflowLog "STEP restart"
  Exit-UpdateLock $root
  Start-TeamflowServer $root
  $state.Stopped = $false

  # ---- check ----
  Write-TeamflowLog "STEP check"
  if (-not (Wait-TeamflowVersion $root $version 60)) {
    # Hold the lock again so a supervisor does not restart the new version during the rollback.
    $null = Enter-UpdateLock $root
    Fail "health" "v$version did not start within 60 seconds, so v$prevVersion was put back. The log is in $root\data."
  }
  Write-TeamflowLog "==> Health ok (v$version)"

  # Keep the running release and the previous one.
  $keep = @((Split-Path $newDir -Leaf), (Split-Path $prevDir -Leaf))
  Get-ChildItem (Join-Path $root "releases") -Directory | Where-Object { $_.Name -like "v*" -and $keep -notcontains $_.Name } |
    ForEach-Object {
      Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      Write-TeamflowLog "    removed old release $($_.Name)"
    }
  Write-TeamflowLog "DONE $version"
} catch {
  $exitCode = 1
  if (-not ($_.Exception -is [System.OperationCanceledException])) {
    Write-TeamflowLog "FAIL unknown $($_.Exception.Message)"
  }
  if ($state.Stopped -or $state.Switched -or $state.Migrated) {
    Write-TeamflowLog "==> Rolling back to v$prevVersion..."
    try { Stop-TeamflowServer $root } catch { }
    if ($state.Switched) {
      Set-Junction $current $prevDir
      Write-TeamflowLog "    current -> $prevDir"
    }
    if ($state.Migrated -and $state.DbBackup -and (Test-Path $state.DbBackup)) {
      $db = Get-DatabasePath $root
      Copy-Item $state.DbBackup "$db.restore" -Force
      Remove-Item "$db-wal", "$db-shm" -Force -ErrorAction SilentlyContinue
      Move-Item "$db.restore" $db -Force
      Write-TeamflowLog "    database restored from $($state.DbBackup)"
    }
    if ($state.NewDir -and $state.NewDir -ne $prevDir) {
      Remove-Item $state.NewDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Exit-UpdateLock $root
    Start-TeamflowServer $root
    if (Wait-TeamflowVersion $root $prevVersion 60) {
      Write-TeamflowLog "==> Rolled back: v$prevVersion is running."
    } else {
      Write-TeamflowLog "==> Rollback could not confirm v$prevVersion is running."
    }
  }
} finally {
  Exit-UpdateLock $root
}
exit $exitCode
