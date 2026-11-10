# Run Teamflow as a Windows service (NSSM) so it starts with the PC. Needs an elevated PowerShell.
# install.ps1 -Service calls this; it can also be run by hand on a release install:
#
#   powershell -ExecutionPolicy Bypass -File <install folder>\current\deploy\windows\install-service.ps1
#
# NSSM comes from PATH or winget (NSSM.NSSM). The service runs the server from current\, so
# updates only swap the junction and restart the service.

param(
  [string]$ServiceName = "Teamflow",
  [string]$Root = ""
)

. (Join-Path $PSScriptRoot "_release.ps1")

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Run this in an elevated PowerShell (Run as administrator)." -ForegroundColor Red
  exit 1
}

if (-not $Root) { $Root = Find-TeamflowRoot $PSScriptRoot }
if (-not $Root) {
  Write-Host "No release install found. Install with: irm https://github.com/mrcool5556/teamflow/releases/latest/download/install.ps1 | iex" -ForegroundColor Red
  exit 1
}

function Find-Nssm {
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $linked = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\nssm.exe"
  if (Test-Path $linked) { return $linked }
  $found = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages", "$env:ProgramFiles\WinGet\Packages" -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
  if ($found) { return $found.FullName }
  return $null
}

$nssm = Find-Nssm
if (-not $nssm) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "NSSM not found and winget is missing. Install NSSM from https://nssm.cc and re-run." -ForegroundColor Red
    exit 1
  }
  Write-Host "Installing NSSM with winget..."
  winget install --id NSSM.NSSM --exact --silent --accept-source-agreements --accept-package-agreements | Out-Null
  $nssm = Find-Nssm
  if (-not $nssm) { Write-Host "NSSM did not install. Install it from https://nssm.cc and re-run." -ForegroundColor Red; exit 1 }
}

$node = Find-TeamflowNode $Root
$server = Join-Path $Root "current\apps\server\dist\index.js"
$logs = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  & $nssm stop $ServiceName | Out-Null
  & $nssm set $ServiceName Application $node | Out-Null
  & $nssm set $ServiceName AppParameters "`"$server`"" | Out-Null
} else {
  & $nssm install $ServiceName $node "`"$server`"" | Out-Null
}
& $nssm set $ServiceName DisplayName "Teamflow" | Out-Null
& $nssm set $ServiceName Description "Teamflow issue tracker" | Out-Null
& $nssm set $ServiceName AppDirectory $Root | Out-Null
& $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
& $nssm set $ServiceName AppStdout (Join-Path $logs "service.log") | Out-Null
& $nssm set $ServiceName AppStderr (Join-Path $logs "service.log") | Out-Null
& $nssm set $ServiceName AppRotateFiles 1 | Out-Null
& $nssm set $ServiceName AppRotateBytes 5242880 | Out-Null
# The in-app update runs as a child of the server and stops this service; it must survive that.
& $nssm set $ServiceName AppKillProcessTree 0 | Out-Null
& $nssm set $ServiceName AppEnvironmentExtra "TEAMFLOW_SUPERVISOR=service" | Out-Null
& $nssm start $ServiceName | Out-Null

Write-Host "Service '$ServiceName' runs Teamflow from $Root and starts with Windows." -ForegroundColor Green
