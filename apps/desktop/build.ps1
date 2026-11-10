# Build the Teamflow Windows app installer (TeamflowSetup-vX.Y.Z.exe) from a Windows release zip.
#
#   pwsh apps/desktop/build.ps1 -Version 0.2.0 -ReleaseZip out/teamflow-v0.2.0-win-x64.zip
#
# Puts the release zip and Node 20's node.exe (downloaded from nodejs.org and checked against
# SHASUMS256.txt, cached in apps/desktop/.cache) into src-tauri/resources, runs `tauri build`
# for the NSIS installer and copies it to out/ with a .sha256 file.
# Needs Rust (MSVC) and the Tauri CLI (`cargo tauri`, or it uses `npx @tauri-apps/cli`).

param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$ReleaseZip,
  [string]$Out = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here "..\..")).Path
if (-not $Out) { $Out = Join-Path $repo "out" }
$Version = $Version -replace '^v', ''
$tauriDir = Join-Path $here "src-tauri"
$resources = Join-Path $tauriDir "resources"
$cache = Join-Path $here ".cache"
New-Item -ItemType Directory -Force -Path (Join-Path $resources "node"), $cache, $Out | Out-Null

# 1. The release this app installs.
$zip = (Resolve-Path $ReleaseZip).Path
Copy-Item $zip (Join-Path $resources "release.zip") -Force
Write-Host "release: $zip"

# 2. Node 20 (newest 20.x), verified against nodejs.org's checksums.
$index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 60
$nv = ($index | Where-Object { $_.version -match '^v20\.' -and $_.files -contains "win-x64-zip" } | Select-Object -First 1).version
if (-not $nv) { throw "No Node 20 build for win-x64 on nodejs.org" }
$nodeZip = Join-Path $cache "node-$nv-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nv/node-$nv-win-x64.zip" -OutFile $nodeZip -TimeoutSec 600
}
$sums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nv/SHASUMS256.txt" -TimeoutSec 60).Content
$line = ($sums -split "`n") | Where-Object { $_ -match "\s+node-$([regex]::Escape($nv))-win-x64\.zip$" } | Select-Object -First 1
$hash = (Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLower()
if (-not $line -or $line.Split(" ")[0].ToLower() -ne $hash) {
  Remove-Item $nodeZip -Force
  throw "node-$nv-win-x64.zip does not match nodejs.org's SHASUMS256.txt"
}
$unpack = Join-Path $cache "node-$nv"
if (-not (Test-Path $unpack)) {
  New-Item -ItemType Directory -Force -Path $unpack | Out-Null
  & "$env:SystemRoot\System32\tar.exe" -x -f $nodeZip -C $unpack
}
Copy-Item (Join-Path $unpack "node-$nv-win-x64\node.exe") (Join-Path $resources "node\node.exe") -Force
Write-Host "node:    $nv (checksum ok)"

# 3. Build the installer with the release's version.
$config = "{`"version`":`"$Version`"}"
Push-Location $tauriDir
try {
  $cargoTauri = $false
  try { & cargo tauri --version *> $null; $cargoTauri = ($LASTEXITCODE -eq 0) } catch { }
  if ($cargoTauri) {
    & cargo tauri build --bundles nsis --config $config
  } else {
    & npx --yes "@tauri-apps/cli@2" build --bundles nsis --config $config
  }
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally {
  Pop-Location
}

$built = Get-ChildItem (Join-Path $tauriDir "target\release\bundle\nsis") -Filter "Teamflow_$($Version)_x64-setup.exe" | Select-Object -First 1
if (-not $built) { throw "The installer was not produced" }
$dest = Join-Path $Out "TeamflowSetup-v$Version.exe"
Copy-Item $built.FullName $dest -Force
$sha = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
Set-Content -Path "$dest.sha256" -Value "$sha  TeamflowSetup-v$Version.exe" -NoNewline
Write-Host ""
Write-Host ("Installer: {0} ({1:N1} MB)" -f $dest, ((Get-Item $dest).Length / 1MB))
