# End-to-end test of the Windows installer and updater on this PC, against a local fake GitHub.
# Nothing touches the real install: everything goes to a scratch folder, port 3917, no service,
# no shortcuts, no firewall, no browser.
#
#   pwsh deploy/tests/windows-release-test.ps1 [-Zip out\teamflow-v0.2.0-win-x64.zip] [-Work <folder>]
#
# The scripts under test run in Windows PowerShell 5.1 (powershell.exe), like the server runs them.

param(
  [string]$Zip = "",
  [string]$Work = "",
  [int]$Port = 3917
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $Zip) { $Zip = Join-Path $repo "out\teamflow-v0.2.0-win-x64.zip" }
if (-not (Test-Path $Zip)) { throw "Build the zip first: node scripts/package-release.mjs --version 0.2.0" }
if (-not $Work) { $Work = Join-Path ([IO.Path]::GetTempPath()) "teamflow-wintest" }
$tar = "$env:SystemRoot\System32\tar.exe"

$pass = 0
$fails = New-Object System.Collections.Generic.List[string]
function Ok([string]$w) { $script:pass++; Write-Host "  ok   $w" }
function Bad([string]$w) { $script:fails.Add($w); Write-Host "  FAIL $w" -ForegroundColor Red }
function Check([string]$w, [scriptblock]$t) { try { if (& $t) { Ok $w } else { Bad $w } } catch { Bad "$w ($($_.Exception.Message))" } }
function Section([string]$t) { Write-Host ""; Write-Host "## $t" }

$root = Join-Path $Work "install"
$rel = Join-Path $Work "github"
if (Test-Path $Work) { & (Join-Path $root "current\deploy\windows\stop.ps1") 2>$null; Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $rel | Out-Null

# ---- fake releases ----
function New-Release([string]$Version, [string]$Mutate = "") {
  $dir = Join-Path $Work "pack-$Version"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  & $tar -x -f $Zip -C $dir
  $vj = Join-Path $dir "version.json"
  $j = Get-Content $vj -Raw | ConvertFrom-Json
  $j.version = $Version
  [IO.File]::WriteAllText($vj, ($j | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  if ($Mutate -eq "break-migrate") { Set-Content (Join-Path $dir "apps\server\dist\migrate.js") 'console.error("boom: migration failed"); process.exit(1);' }
  if ($Mutate -eq "break-start") { Set-Content (Join-Path $dir "apps\server\dist\index.js") 'console.error("boom: cannot start"); process.exit(1);' }
  $out = Join-Path $rel "download\v$Version"
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  $name = "teamflow-v$Version-win-x64.zip"
  # Stored, not compressed: the same files, but zipping takes seconds instead of minutes.
  Push-Location $dir; & $tar -a -c --options zip:compression=store -f (Join-Path $out $name) *; Pop-Location
  $hash = (Get-FileHash (Join-Path $out $name) -Algorithm SHA256).Hash.ToLower()
  if ($Mutate -eq "bad-checksum") { $hash = "0" * 64 }
  Set-Content (Join-Path $out "SHA256SUMS") "$hash  $name"
  Remove-Item $dir -Recurse -Force
}
function Set-Latest([string]$Version) {
  New-Item -ItemType Directory -Force -Path (Join-Path $rel "api") | Out-Null
  Set-Content (Join-Path $rel "api\latest") "{`"tag_name`":`"v$Version`",`"draft`":false,`"prerelease`":false}"
  Set-Content (Join-Path $rel "api\releases") "[{`"tag_name`":`"v$Version`",`"draft`":false,`"prerelease`":false,`"body`":`"- test`",`"assets`":[]}]"
}

Section "Fake GitHub"
New-Release "0.2.0"; New-Release "0.2.1"; New-Release "0.2.2" "break-migrate"; New-Release "0.2.3" "break-start"
New-Release "0.2.4" "bad-checksum"; New-Release "0.2.5"
Set-Latest "0.2.0"
$gh = Start-Process node -ArgumentList "`"$repo\deploy\tests\fake-github.mjs`"", "`"$rel`"", "8099" -PassThru -WindowStyle Hidden
Start-Sleep 1
$env:TEAMFLOW_RELEASE_BASE = "http://127.0.0.1:8099/download"
$env:TEAMFLOW_API_BASE = "http://127.0.0.1:8099/repos/mrcool5556/teamflow"
Ok "serving 6 test releases"

function Health { try { Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2 } catch { $null } }
function RunningVersion { $h = Health; if ($h) { $h.version } else { "" } }
function WaitVersion([string]$v, [int]$s = 60) { for ($i = 0; $i -lt $s; $i++) { if ((RunningVersion) -eq $v) { return $true }; Start-Sleep 1 }; return $false }
function LastLine([string]$prefix) { (Get-Content (Join-Path $root "data\maintenance.log") | Where-Object { $_ -like "$prefix *" } | Select-Object -Last 1) }
function PS51([string]$file) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file @args }

try {
  Section "Installer (fresh, Windows PowerShell 5.1)"
  $log = PS51 "$repo\deploy\install\install.ps1" -InstallDir $root -Port $Port -NoService -NoShortcut -NoBrowser -Background -Yes 2>&1
  $log | Out-File (Join-Path $Work "install.log")
  Check "printed the address" { ($log -join "`n") -match "Teamflow is running" }
  Check "running v0.2.0" { WaitVersion "0.2.0" 30 }
  Check "secrets generated" { (Get-Content "$root\.env") -match '^JWT_SECRET=[0-9a-f]{64}$' -and (Get-Content "$root\.env") -match '^TEAMFLOW_SECRETS_KEY=[0-9a-f]{64}$' }
  Check "uses its own Node 20 (not the PC's)" { (& "$root\node\node.exe" -v) -match '^v20\.' }
  Check ".env has no BOM" { ([IO.File]::ReadAllBytes("$root\.env")[0]) -ne 0xEF }
  Check "current is a junction to v0.2.0" { (Get-Item "$root\current").Target -like "*releases\v0.2.0" }
  Check "supervisor running" { $s = (Get-Content "$root\data\supervisor.pid" -Raw).Trim(); [bool](Get-Process -Id $s -ErrorAction SilentlyContinue) }
  $secret = (Get-Content "$root\.env") -match '^TEAMFLOW_SECRETS_KEY='

  Section "Installer (re-run keeps secrets)"
  $log2 = PS51 "$repo\deploy\install\install.ps1" -InstallDir $root -Port $Port -NoService -NoShortcut -NoBrowser -Background -Yes 2>&1
  Check "secrets unchanged" { ((Get-Content "$root\.env") -match '^TEAMFLOW_SECRETS_KEY=') -eq $secret }
  Check "says it's already running" { ($log2 -join "`n") -match "already running" }
  Check "still v0.2.0" { (RunningVersion) -eq "0.2.0" }

  Section "Dry run"
  $dry = PS51 "$repo\deploy\install\install.ps1" -InstallDir $root -Port $Port -NoService -NoShortcut -NoBrowser -DryRun 2>&1
  Check "dry run says so" { ($dry -join "`n") -match "Dry run finished" }

  $upd = "$root\current\deploy\windows\update.ps1"
  Section "Update to the latest (v0.2.1)"
  Set-Latest "0.2.1"
  PS51 $upd | Out-Null
  Check "DONE 0.2.1" { (LastLine "DONE") -eq "DONE 0.2.1" }
  Check "running v0.2.1 (supervisor restarted it)" { WaitVersion "0.2.1" 30 }
  Check "a database backup exists" { @(Get-ChildItem "$root\backups" -Filter "teamflow_*.db").Count -ge 1 }

  $upd = "$root\current\deploy\windows\update.ps1"
  Section "Failed migration rolls back"
  PS51 $upd --version 0.2.2 | Out-Null
  Check "FAIL migrate" { (LastLine "FAIL") -like "FAIL migrate *" }
  Check "running v0.2.1 again" { WaitVersion "0.2.1" 30 }
  Check "current still v0.2.1" { (Get-Item "$root\current").Target -like "*releases\v0.2.1" }
  Check "failed release removed" { -not (Test-Path "$root\releases\v0.2.2") }

  Section "Release that will not start rolls back"
  PS51 $upd --version 0.2.3 | Out-Null
  Check "FAIL health" { (LastLine "FAIL") -like "FAIL health *" }
  Check "running v0.2.1 again" { WaitVersion "0.2.1" 30 }
  Check "current back to v0.2.1" { (Get-Item "$root\current").Target -like "*releases\v0.2.1" }

  Section "Bad checksum and no network"
  PS51 $upd --version 0.2.4 | Out-Null
  Check "FAIL checksum" { (LastLine "FAIL") -like "FAIL checksum *" }
  $env:TEAMFLOW_RELEASE_BASE = "http://127.0.0.1:1/download"
  PS51 $upd --version 0.2.9 | Out-Null
  $env:TEAMFLOW_RELEASE_BASE = "http://127.0.0.1:8099/download"
  Check "FAIL network" { (LastLine "FAIL") -like "FAIL network *" }
  Check "still v0.2.1" { (RunningVersion) -eq "0.2.1" }
  PS51 $upd --version 0.2.0 | Out-Null
  Check "downgrade refused" { (LastLine "FAIL") -like "FAIL usage *older*" }

  Section "Backup and restore"
  $b = PS51 "$root\current\deploy\windows\backup.ps1" --db-only
  $file = (($b | Where-Object { $_ -like "BACKUP database *" }) -replace '^BACKUP database ', '')
  Check "online backup is a SQLite file" { $file -and ([Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($file)[0..14]) -eq "SQLite format 3") }
  PS51 "$root\current\deploy\windows\restore.ps1" --file (Split-Path $file -Leaf) | Out-Null
  Check "RESTORED" { (LastLine "RESTORED") -eq "RESTORED $(Split-Path $file -Leaf)" }
  Check "answers after restore" { WaitVersion "0.2.1" 30 }

  Section "In-app update through the server (as the Update button does)"
  $email = "admin-$(Get-Random)@example.test"
  $reg = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/auth/register" -ContentType "application/json" -Body (@{ email = $email; name = "Admin"; password = "correct-horse-battery" } | ConvertTo-Json)
  $hdr = @{ Authorization = "Bearer $($reg.token)" }
  $team = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/teams" -Headers $hdr).teams[0].id
  $st = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/teams/$team/server/maintenance" -Headers $hdr).status
  Check "maintenance is on for Windows (no 'Linux only')" { $st.enabled -eq $true }
  Check "the update script is the release's update.ps1" { $st.updateScript -like "*current\deploy\windows\update.ps1" }
  $null = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/teams/$team/server/maintenance/backup" -Headers $hdr -ContentType "application/json" -Body '{"full":false}'
  $bj = $null
  for ($i = 0; $i -lt 60; $i++) {
    $bj = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/teams/$team/server/maintenance" -Headers $hdr).status.job
    if ($bj.status -ne "running") { break }
    Start-Sleep 1
  }
  Check "in-app backup finished as success" { $bj.status -eq "success" }
  Check "in-app backup log has the BACKUP line" { $bj.logTail -match "BACKUP database " }
  if ($bj.status -ne "success") { Write-Host "    job log:"; $bj.logTail -split "`n" | Select-Object -Last 8 | ForEach-Object { Write-Host "      $_" } }
  Set-Latest "0.2.5"
  $null = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/teams/$team/server/maintenance/update" -Headers $hdr -ContentType "application/json" -Body '{"version":"0.2.5"}'
  Check "the server updated itself to v0.2.5" { WaitVersion "0.2.5" 120 }
  $st2 = $null
  for ($i = 0; $i -lt 20; $i++) {
    try { $st2 = (Invoke-RestMethod -Uri "http://127.0.0.1:$Port/teams/$team/server/maintenance" -Headers $hdr).status } catch { }
    if ($st2 -and $st2.job.status -ne "running") { break }
    Start-Sleep 1
  }
  Check "the job finished as success" { $st2.job.status -eq "success" }
  Check "lastRun.done is 0.2.5" { $st2.lastRun.done -eq "0.2.5" }
} finally {
  Section "Cleanup"
  PS51 "$root\current\deploy\windows\stop.ps1" | Out-Null
  Stop-Process -Id $gh.Id -Force -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "passed: $pass   failed: $($fails.Count)"
  foreach ($f in $fails) { Write-Host "  - $f" }
}
if ($fails.Count) { exit 1 }
