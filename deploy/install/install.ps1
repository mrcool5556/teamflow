# Teamflow installer for Windows 10/11 (x64).
#
#   irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex
#
# With options:
#   & ([scriptblock]::Create((irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1))) -Service
#
# Gets Teamflow its own Node 20 (a private copy from nodejs.org, checked against its published
# SHA-256, whatever Node the PC has), downloads and verifies the newest Teamflow release, generates secrets,
# optionally installs a Windows service, checks that Teamflow answers and opens the browser on
# the setup page. Safe to re-run: .env, the database and uploads are kept.
#
# Elevated ("Run as administrator"): installs to %ProgramData%\Teamflow and offers the service
# and a firewall rule. Not elevated: installs to %LOCALAPPDATA%\Teamflow and starts with sign-in.
#
# Every option also reads an environment variable, for `irm | iex`:
#   -Version X.Y.Z (TEAMFLOW_VERSION)  -Port N (TEAMFLOW_PORT)  -InstallDir (TEAMFLOW_INSTALL_DIR)
#   -Service / -NoService (TEAMFLOW_SERVICE=1/0)  -Firewall  -NoBrowser  -NoShortcut  -Background
#   -Update (update an existing install)  -From <old git-checkout folder>  -Yes (TEAMFLOW_YES=1)
#   -DryRun (TEAMFLOW_DRY_RUN=1): check the PC and print what would be done; change nothing.

param(
  [string]$Version = $env:TEAMFLOW_VERSION,
  [int]$Port = 0,
  [string]$InstallDir = $env:TEAMFLOW_INSTALL_DIR,
  [switch]$Service,
  [switch]$NoService,
  [switch]$Firewall,
  [switch]$NoBrowser,
  [switch]$NoShortcut,
  [switch]$Background,
  [switch]$Update,
  [string]$From = "",
  [switch]$Yes,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "mrcool5556/teamflow"
$ReleaseBase = "https://github.com/$Repo/releases/download"
$ApiBase = "https://api.github.com/repos/$Repo"
$NodeBase = "https://nodejs.org/dist"
if ($env:TEAMFLOW_RELEASE_BASE) { $ReleaseBase = $env:TEAMFLOW_RELEASE_BASE }
if ($env:TEAMFLOW_API_BASE) { $ApiBase = $env:TEAMFLOW_API_BASE }
if ($env:TEAMFLOW_NODE_BASE) { $NodeBase = $env:TEAMFLOW_NODE_BASE }

if ($Port -eq 0) { if ($env:TEAMFLOW_PORT) { $Port = [int]$env:TEAMFLOW_PORT } else { $Port = 3000 } }
if ($env:TEAMFLOW_YES -eq "1") { $Yes = $true }
if ($env:TEAMFLOW_DRY_RUN -eq "1") { $DryRun = $true }
if ($env:TEAMFLOW_SERVICE -eq "1") { $Service = $true }
if ($env:TEAMFLOW_SERVICE -eq "0") { $NoService = $true }
if ($env:TEAMFLOW_NO_BROWSER -eq "1") { $NoBrowser = $true }

function Say([string]$Text) { Write-Host $Text }
function Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Die([string]$Text) {
  Write-Host ""
  Write-Host "Teamflow install stopped: $Text" -ForegroundColor Red
  throw "Teamflow install stopped."
}
function Act([string]$What, [scriptblock]$Do) {
  if ($DryRun) { Say "    [dry-run] $What" } else { & $Do }
}
function Ask([string]$Question, [bool]$Default = $true) {
  if ($Yes -or $DryRun) { return $Default }
  $hint = "[Y/n]"
  if (-not $Default) { $hint = "[y/N]" }
  try { $answer = Read-Host "$Question $hint" } catch { return $Default }
  if (-not $answer) { return $Default }
  return ($answer -match '^[Yy]')
}
function New-Secret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}
function Write-Utf8([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, [Text.UTF8Encoding]::new($false))
}

function Get-EnvLine([string]$Key) {
  $line = $script:EnvLines | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
  if (-not $line) { return "" }
  return ($line -replace "^$Key=", "").Trim().Trim('"')
}
function Set-EnvIfMissing([string]$Key, [string]$Value) {
  if (Get-EnvLine $Key) { return }
  $script:EnvLines = @($script:EnvLines | Where-Object { $_ -notmatch "^$Key=" }) + "$Key=$Value"
  Say "    .env: set $Key"
}

function Install-Teamflow {
  if ($DryRun) { Say "Teamflow installer (dry run: nothing will be changed)" } else { Say "Teamflow installer" }

  # ---- this PC ----
  Step "Checking this PC"
  if (-not [Environment]::Is64BitOperatingSystem) { Die "Teamflow needs 64-bit Windows." }
  $build = [Environment]::OSVersion.Version.Build
  if ($build -lt 17763) { Die "Teamflow needs Windows 10 (1809) or newer." }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($Service -and -not $isAdmin) { Die "-Service needs an elevated PowerShell (Run as administrator)." }

  $root = $InstallDir
  if (-not $root) {
    if ($isAdmin) { $root = Join-Path $env:ProgramData "Teamflow" } else { $root = Join-Path $env:LOCALAPPDATA "Teamflow" }
  }
  $root = [IO.Path]::GetFullPath($root)
  $drive = [IO.Path]::GetPathRoot($root)
  $freeMb = [math]::Floor((New-Object IO.DriveInfo $drive).AvailableFreeSpace / 1MB)
  if ($freeMb -lt 1024) { Die "only $freeMb MB free on $drive; Teamflow needs at least 1 GB." }
  $mode = "your account"
  if ($isAdmin) { $mode = "administrator" }
  Say "    Windows build $build - $mode - $root - $freeMb MB free"

  $existing = Test-Path (Join-Path $root "current\version.json")

  # ---- Node 20 ----
  Step "Node.js 20"
  # Teamflow always runs on its own copy of Node 20 in <install folder>\node: better-sqlite3 is
  # built for Node 20, and the PC's own Node (nvm, winget) may change version at any time.
  $node = $null
  $portable = Join-Path $root "node\node.exe"
  if ((Test-Path $portable) -and ((& $portable -v) -match '^v20\.')) {
    $node = $portable
    Say "    using Teamflow's own Node $(& $node -v)"
  }
  if (-not $node) {
    Say "    Teamflow gets its own copy of Node 20 (any Node already on this PC is not changed)."
    $index = Invoke-RestMethod -Uri "$NodeBase/index.json" -TimeoutSec 30
    $pick = $index | Where-Object { $_.version -match '^v20\.' -and $_.files -contains "win-x64-zip" } | Select-Object -First 1
    if (-not $pick) { Die "couldn't find a Node 20 download on nodejs.org." }
    $nv = $pick.version
    Act "download node-$nv-win-x64.zip from $NodeBase, check SHASUMS256.txt, unpack to $root\node" {
      $tmp = Join-Path ([IO.Path]::GetTempPath()) ("teamflow-node-" + [Guid]::NewGuid())
      New-Item -ItemType Directory -Path $tmp | Out-Null
      try {
        $zip = Join-Path $tmp "node-$nv-win-x64.zip"
        Invoke-WebRequest -UseBasicParsing -Uri "$NodeBase/$nv/node-$nv-win-x64.zip" -OutFile $zip -TimeoutSec 600
        $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$NodeBase/$nv/SHASUMS256.txt" -TimeoutSec 60).Content
        $line = ($sums -split "`n") | Where-Object { $_ -match "\s+node-$([regex]::Escape($nv))-win-x64\.zip$" } | Select-Object -First 1
        $hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
        if (-not $line -or $line.Split(" ")[0].ToLower() -ne $hash) { Die "the Node download didn't match nodejs.org's checksum." }
        & "$env:SystemRoot\System32\tar.exe" -x -f $zip -C $tmp
        New-Item -ItemType Directory -Force -Path $root | Out-Null
        $target = Join-Path $root "node"
        if (Test-Path $target) { Remove-Item $target -Recurse -Force }
        Move-Item (Join-Path $tmp "node-$nv-win-x64") $target
      } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
    $node = $portable
    if (-not $DryRun) { Say "    Node $nv (checksum ok) in $root\node" }
  }

  # ---- version ----
  if ($Version) { $Version = $Version -replace '^v', '' }
  if ($Version -and $Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$') { Die "not a version: $Version" }
  if (-not $Version -and $existing -and -not $Update) {
    $Version = (Get-Content (Join-Path $root "current\version.json") -Raw | ConvertFrom-Json).version
  }
  if (-not $Version) {
    try {
      $latest = Invoke-RestMethod -Uri "$ApiBase/releases/latest" -Headers @{ Accept = "application/vnd.github+json"; "User-Agent" = "Teamflow-installer" } -TimeoutSec 20
      $Version = $latest.tag_name -replace '^v', ''
    } catch { }
    if (-not $Version) { Die "couldn't find the newest release on GitHub. Check the internet connection, or pass -Version." }
  }
  Say "    Teamflow v$Version"

  # ---- folders and settings ----
  Step "Folders and settings"
  Act "create $root\{releases,data,backups}" {
    foreach ($d in @("releases", "data", "backups")) { New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null }
  }
  $envFile = Join-Path $root ".env"
  if ($From) {
    $From = (Resolve-Path $From).Path
    if (-not (Test-Path (Join-Path $root "data\teamflow.db"))) {
      Act "copy .env and data from $From" {
        if (Test-Path (Join-Path $From ".env")) { Copy-Item (Join-Path $From ".env") $envFile -Force }
        foreach ($item in Get-ChildItem (Join-Path $From "data") -Force -ErrorAction SilentlyContinue) {
          Copy-Item $item.FullName (Join-Path $root "data") -Recurse -Force
        }
      }
      Say "    copied .env and data from $From (the old folder is left as it was)"
    } else {
      Say "    $root already has a database; -From was not used"
    }
  }

  $fresh = -not (Test-Path $envFile)
  $script:EnvLines = @()
  if ($fresh) {
    $script:EnvLines = @(
      "# Teamflow settings. Written by the installer; re-running it only adds missing lines.",
      "# Site name, public address, e-mail and invites are set on the Server admin page instead.",
      "NODE_ENV=production"
    )
  } else {
    $script:EnvLines = @(Get-Content $envFile)
  }
  Set-EnvIfMissing "PORT" "$Port"
  Set-EnvIfMissing "HOST" "0.0.0.0"
  Set-EnvIfMissing "DATABASE_URL" "file:./data/teamflow.db"
  Set-EnvIfMissing "SERVE_WEB" "true"
  Set-EnvIfMissing "TEAMFLOW_MAINTENANCE_ENABLED" "true"
  $jwt = Get-EnvLine "JWT_SECRET"
  if ($jwt.Length -lt 16 -or $jwt -like "change-me*" -or $jwt -eq "dev-secret") {
    $script:EnvLines = @($script:EnvLines | Where-Object { $_ -notmatch "^JWT_SECRET=" })
    Set-EnvIfMissing "JWT_SECRET" (New-Secret)
    $jwt = Get-EnvLine "JWT_SECRET"
  }
  if (-not (Get-EnvLine "TEAMFLOW_SECRETS_KEY")) {
    # On an old install, stored secrets were encrypted with JWT_SECRET; keep that key.
    if ($fresh) { Set-EnvIfMissing "TEAMFLOW_SECRETS_KEY" (New-Secret) } else { Set-EnvIfMissing "TEAMFLOW_SECRETS_KEY" $jwt }
  }
  Act "write $envFile" {
    Write-Utf8 $envFile (($script:EnvLines -join "`r`n") + "`r`n")
  }
  if ($isAdmin -and $root.StartsWith($env:ProgramData, [StringComparison]::OrdinalIgnoreCase)) {
    # ProgramData is readable by every user by default; the secrets and data are not for them.
    Act "limit $envFile, data and backups to SYSTEM, Administrators and $env:USERNAME" {
      foreach ($p in @($envFile, (Join-Path $root "data"), (Join-Path $root "backups"))) {
        & icacls $p /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "$($env:USERNAME):(OI)(CI)F" | Out-Null
      }
    }
  }
  $Port = [int](Get-EnvLine "PORT")

  # ---- release ----
  $current = Join-Path $root "current"
  $relDir = Join-Path $root "releases\v$Version"
  if ($existing -and $Update) {
    Step "Updating to v$Version"
    Act "run current\deploy\windows\update.ps1 --version $Version" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $current "deploy\windows\update.ps1") --version $Version --root $root
    }
  } elseif ((Test-Path (Join-Path $relDir "version.json")) -and (Test-Path $current)) {
    Say "    v$Version is already installed"
  } else {
    Step "Downloading Teamflow v$Version"
    $asset = "teamflow-v$Version-win-x64.zip"
    Act "download $ReleaseBase/v$Version/$asset, check SHA256SUMS, unpack to $relDir" {
      $tmp = Join-Path $root "releases\.download-v$Version"
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $tmp | Out-Null
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/v$Version/$asset" -OutFile (Join-Path $tmp $asset) -TimeoutSec 600
        Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/v$Version/SHA256SUMS" -OutFile (Join-Path $tmp "SHA256SUMS") -TimeoutSec 60
      } catch {
        Die "couldn't download $asset. Check the internet connection and that v$Version exists."
      }
      $line = Get-Content (Join-Path $tmp "SHA256SUMS") | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
      $hash = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
      if (-not $line -or $line.Split(" ")[0].ToLower() -ne $hash) { Die "the download didn't match its checksum; nothing was installed. Try again." }
      Say "    verified (sha256)"
      $unpack = "$relDir.tmp"
      if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $unpack | Out-Null
      & "$env:SystemRoot\System32\tar.exe" -x -f (Join-Path $tmp $asset) -C $unpack
      if ($LASTEXITCODE -ne 0) { Die "couldn't unpack $asset." }
      Remove-Item $tmp -Recurse -Force
      if (Test-Path $relDir) { Remove-Item $relDir -Recurse -Force }
      Move-Item $unpack $relDir
      if (Test-Path $current) { cmd /c rmdir "$current" | Out-Null }
      New-Item -ItemType Junction -Path $current -Target $relDir | Out-Null
      Say "    installed to $relDir"
    }
  }

  # ---- database ----
  Step "Database"
  Act "run migrate.js" {
    Push-Location $root
    $eap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $out = & $node (Join-Path $current "apps\server\dist\migrate.js") 2>&1
      $code = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $eap
      Pop-Location
    }
    if ($code -ne 0) { $out | Select-Object -Last 20 | ForEach-Object { Say "    $_" }; Die "the database migration failed (output above)." }
    Say "    database ready"
  }

  # ---- how it runs ----
  Step "Running Teamflow"
  $useService = $false
  if ($Service) { $useService = $true }
  elseif ($isAdmin -and -not $NoService) {
    $useService = Ask "Run Teamflow as a Windows service, so it starts with the PC even when nobody signs in?" $true
  }
  $startPs1 = Join-Path $current "deploy\windows\start.ps1"
  $psArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$startPs1`" -Root `"$root`""
  if ($useService) {
    Act "install the Teamflow service (NSSM)" {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $current "deploy\windows\install-service.ps1") -Root $root
      if ($LASTEXITCODE -ne 0) { Die "the service could not be installed (see above)." }
    }
  } else {
    if (-not $NoShortcut) {
      Act "add a Teamflow shortcut to the Start menu" {
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Programs")) "Teamflow.lnk"))
        $lnk.TargetPath = "powershell.exe"
        $lnk.Arguments = $psArgs
        $lnk.WorkingDirectory = $root
        $lnk.Description = "Start Teamflow"
        $lnk.Save()
      }
      if (Ask "Start Teamflow when you sign in to Windows?" $true) {
        Act "add Teamflow to Startup" {
          $shell = New-Object -ComObject WScript.Shell
          $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Teamflow.lnk"))
          $lnk.TargetPath = "powershell.exe"
          $lnk.Arguments = $psArgs
          $lnk.WorkingDirectory = $root
          $lnk.WindowStyle = 7
          $lnk.Save()
        }
      }
    }
    $supervisor = Join-Path $root "data\supervisor.pid"
    $running = $false
    if (Test-Path $supervisor) {
      $sid = (Get-Content $supervisor -Raw).Trim()
      if ($sid -match '^\d+$' -and (Get-Process -Id ([int]$sid) -ErrorAction SilentlyContinue)) { $running = $true }
    }
    if ($running) {
      Say "    Teamflow is already running (its window restarts it after updates)"
    } else {
      $style = "Minimized"
      if ($Background) { $style = "Hidden" }
      Act "start Teamflow ($style window)" {
        Start-Process powershell.exe -ArgumentList ($psArgs -replace "-WindowStyle Minimized", "-WindowStyle $style") -WindowStyle $style -WorkingDirectory $root | Out-Null
      }
    }
  }

  if ($isAdmin -and -not $DryRun) {
    $rule = Get-NetFirewallRule -DisplayName "Teamflow (port $Port)" -ErrorAction SilentlyContinue
    if (-not $rule -and ($Firewall -or (-not $Yes -and (Ask "Let other computers on your network reach Teamflow (Windows Firewall rule for port $Port, private networks)?" $false)))) {
      New-NetFirewallRule -DisplayName "Teamflow (port $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private, Domain | Out-Null
      Say "    firewall: port $Port open on private networks"
    }
  }

  if ($DryRun) {
    Step "Dry run finished: nothing was changed"
    return
  }

  # ---- check and hand over ----
  Step "Checking Teamflow answers"
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) {
    try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($h.ok) { $ok = $true; break } } catch { }
    Start-Sleep -Seconds 1
  }
  if (-not $ok) { Die "Teamflow didn't answer on port $Port within 60 seconds. Start it from the Start menu, or look in $root\data." }

  $url = "http://localhost:$Port"
  $setup = $null
  try { $setup = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/auth/setup" -TimeoutSec 5 } catch { }
  Write-Host ""
  Write-Host "------------------------------------------------------------"
  $open = $url
  if ($setup -and $setup.setup -and $setup.setup.needed) {
    $code = ""
    for ($i = 0; $i -lt 10 -and -not $code; $i++) {
      $file = Join-Path $root "data\setup-code"
      if (Test-Path $file) { $code = (Get-Content $file -TotalCount 1).Trim() } else { Start-Sleep -Seconds 1 }
    }
    $open = "$url/setup"
    if ($code) { $open = "$url/setup?code=$code" }
    Say " Teamflow is running. Finish setup in your browser:"
    Say ""
    Say "   $open"
    if ($code) { Say "   Setup code: $code" }
    Say ""
    Say " The setup page creates the admin account. The code works once."
  } elseif ($setup) {
    Say " Teamflow is running: $url"
  } else {
    Say " Teamflow is running: $url"
    Say " Open it and register; the first account becomes the instance admin."
  }
  Write-Host "------------------------------------------------------------"
  Say " Installed in $root"
  Say " Updates: Settings > Updates in Teamflow"
  if ($useService) { Say " Service: Get-Service Teamflow  (logs in $root\data\logs)" } else { Say " Start it again from the Start menu (Teamflow)." }
  if (-not $NoBrowser) { Start-Process $open | Out-Null }
}

try {
  Install-Teamflow
} catch {
  if ($_.Exception.Message -ne "Teamflow install stopped.") {
    Write-Host ""
    Write-Host "Teamflow install stopped: $($_.Exception.Message)" -ForegroundColor Red
  }
  if ($PSCommandPath) { exit 1 }
}
