# Shared by update.ps1, backup.ps1, restore.ps1 and start.ps1 on a release install.
# Windows PowerShell 5.1 compatible (no ?? or ternaries).
#
# Layout (made by deploy/install/install.ps1):
#   <root>\.env                 settings and secrets (kept)
#   <root>\data\                database, uploads, maintenance.log (kept)
#   <root>\backups\             database backups (newest 10 kept)
#   <root>\node\node.exe        portable Node 20, when the PC's own Node is not 20
#   <root>\releases\vX.Y.Z\     unpacked releases (newest two kept)
#   <root>\current          ->  junction to releases\vX.Y.Z
#
# Who restarts the server after an update: the "Teamflow" Windows service when it exists,
# otherwise the supervisor (start.ps1 or the Teamflow app), which restarts node when it exits
# and waits while data\.update.lock exists.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:ServiceName = "Teamflow"
$script:LogFile = $null

function Find-TeamflowRoot {
  param([string]$Start)
  if ($env:TEAMFLOW_ROOT -and (Test-Path (Join-Path $env:TEAMFLOW_ROOT "releases"))) {
    return (Resolve-Path $env:TEAMFLOW_ROOT).Path
  }
  $dir = $Start
  while ($dir) {
    if ((Test-Path (Join-Path $dir "releases")) -and (Test-Path (Join-Path $dir "data"))) {
      return $dir
    }
    $parent = Split-Path $dir -Parent
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

# Linux-style arguments (--version 1.2.3 --backup-full), so the server calls every platform alike.
function ConvertFrom-GnuArgs {
  param([string[]]$Arguments)
  $result = @{}
  $i = 0
  while ($i -lt $Arguments.Count) {
    $a = $Arguments[$i]
    if ($a -match '^--?([A-Za-z][A-Za-z0-9-]*)$') {
      $name = $Matches[1].ToLower()
      if (($i + 1) -lt $Arguments.Count -and $Arguments[$i + 1] -notmatch '^--?[A-Za-z]') {
        $result[$name] = $Arguments[$i + 1]
        $i += 2
      } else {
        $result[$name] = $true
        $i += 1
      }
    } else {
      throw "Unexpected argument: $a"
    }
  }
  return $result
}

function Start-TeamflowLog {
  param([string]$Root)
  $data = Join-Path $Root "data"
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  $script:LogFile = Join-Path $data "maintenance.log"
}

function Write-TeamflowLog {
  param([string]$Line)
  if ($script:LogFile) {
    # Shared read/write, so the server reading the log (or another writer) never blocks a line.
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes("$Line`r`n")
    for ($try = 0; $try -lt 20; $try++) {
      try {
        $fs = [IO.File]::Open($script:LogFile, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
        try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Dispose() }
        break
      } catch {
        Start-Sleep -Milliseconds 100
      }
    }
  }
  Write-Host $Line
}

function Get-EnvValue {
  param([string]$Root, [string]$Key)
  $file = Join-Path $Root ".env"
  if (-not (Test-Path $file)) { return $null }
  $line = Get-Content $file | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -replace "^$Key=", "").Trim().Trim('"')
}

function Get-TeamflowPort {
  param([string]$Root)
  $port = Get-EnvValue $Root "PORT"
  if (-not $port) { $port = "3000" }
  return $port
}

function Get-DatabasePath {
  param([string]$Root)
  $url = Get-EnvValue $Root "DATABASE_URL"
  if (-not $url) { $url = "file:./data/teamflow.db" }
  $path = $url -replace '^file:', ''
  if ([IO.Path]::IsPathRooted($path)) { return $path }
  return (Join-Path $Root ($path -replace '^\./', '' -replace '/', '\'))
}

function Find-TeamflowNode {
  param([string]$Root)
  # Teamflow's own Node 20 first: better-sqlite3 is built for Node 20 only, and the PC's own
  # Node (nvm, winget) may be switched to another version at any time.
  $portable = Join-Path $Root "node\node.exe"
  if (Test-Path $portable) { return $portable }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and ((& $cmd.Source -v) -match '^v20\.')) { return $cmd.Source }
  throw "Teamflow's Node 20 is missing ($portable). Re-run the Teamflow installer to add it."
}

function Get-ReleaseVersion {
  param([string]$ReleaseDir)
  $file = Join-Path $ReleaseDir "version.json"
  if (-not (Test-Path $file)) { return $null }
  return (Get-Content $file -Raw | ConvertFrom-Json).version
}

function Set-Junction {
  param([string]$Link, [string]$Target)
  if (Test-Path $Link) {
    # rmdir removes a junction itself, never what it points to.
    cmd /c rmdir "$Link" | Out-Null
  }
  New-Item -ItemType Junction -Path $Link -Target $Target | Out-Null
}

function Get-JunctionTarget {
  param([string]$Link)
  if (-not (Test-Path $Link)) { return $null }
  $item = Get-Item $Link -Force
  if ($item.Target) { return [string]($item.Target | Select-Object -First 1) }
  return $null
}

function Test-ServiceMode {
  $svc = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
  return [bool]$svc
}

function Test-SupervisorRunning {
  param([string]$Root)
  $file = Join-Path $Root "data\supervisor.pid"
  if (-not (Test-Path $file)) { return $false }
  $id = (Get-Content $file -Raw).Trim()
  if (-not ($id -match '^\d+$')) { return $false }
  return [bool](Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue)
}

function Get-ServerProcesses {
  param([string]$Root)
  $needle = ([string](Join-Path $Root "")).ToLower()
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.CommandLine.ToLower().Contains($needle) -and
      $_.CommandLine.ToLower().Contains("apps\server\dist\index.js")
    }
}

function Stop-TeamflowServer {
  param([string]$Root)
  if (Test-ServiceMode) {
    Stop-Service -Name $script:ServiceName -Force
    (Get-Service -Name $script:ServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
    return
  }
  foreach ($p in @(Get-ServerProcesses $Root)) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  if ($env:TEAMFLOW_SERVER_PID -match '^\d+$') {
    Stop-Process -Id ([int]$env:TEAMFLOW_SERVER_PID) -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

function Start-TeamflowServer {
  param([string]$Root)
  if (Test-ServiceMode) {
    Start-Service -Name $script:ServiceName
    return
  }
  # A supervisor restarts node by itself once the update lock is gone.
  if (Test-SupervisorRunning $Root) { return }
  $node = Find-TeamflowNode $Root
  $server = Join-Path $Root "current\apps\server\dist\index.js"
  # The new server must not inherit this job's variables.
  Remove-Item Env:TEAMFLOW_NESTED_JOB, Env:TEAMFLOW_SERVER_PID -ErrorAction SilentlyContinue
  Start-Process -FilePath $node -ArgumentList "`"$server`"" -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
}

function Wait-TeamflowVersion {
  param([string]$Root, [string]$Version, [int]$Seconds = 60)
  $port = Get-TeamflowPort $Root
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
      if ($health.ok -and (-not $Version -or $health.version -eq $Version)) { return $true }
    } catch {
      # still starting
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

# An exclusive lock file holding our PID; a stale one (dead PID) is taken over.
function Enter-UpdateLock {
  param([string]$Root)
  $lock = Join-Path $Root "data\.update.lock"
  if (Test-Path $lock) {
    $holder = (Get-Content $lock -Raw -ErrorAction SilentlyContinue)
    if ($holder) { $holder = $holder.Trim() }
    if ($holder -match '^\d+$' -and (Get-Process -Id ([int]$holder) -ErrorAction SilentlyContinue)) {
      return $false
    }
    Remove-Item $lock -Force
  }
  Set-Content -Path $lock -Value $PID -NoNewline
  return $true
}

function Exit-UpdateLock {
  param([string]$Root)
  $lock = Join-Path $Root "data\.update.lock"
  if (Test-Path $lock) {
    $holder = (Get-Content $lock -Raw).Trim()
    if ($holder -eq "$PID") { Remove-Item $lock -Force }
  }
}

# When the server started this script (Settings > Updates), tell it our PID: it launched us
# through a cmd.exe that has already exited, so that PID says nothing about us.
function Register-JobPid {
  param([string]$Root)
  if (-not $env:TEAMFLOW_SERVER_PID) { return }
  $file = Join-Path $Root "data\maintenance-job.pid"
  try { Set-Content -Path $file -Value $PID -NoNewline } catch { }
}
