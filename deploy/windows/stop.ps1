# Stop Teamflow on Windows: the "Teamflow" service when installed, otherwise the node process
# that runs this install's server (and the start.ps1 window that supervises it).

. (Join-Path $PSScriptRoot "_release.ps1")

$root = Find-TeamflowRoot $PSScriptRoot
if (-not $root) { $root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }

if (Test-ServiceMode) {
  Stop-Service -Name $script:ServiceName -Force
  Write-Host "Stopped the Teamflow service."
  exit 0
}

$supervisor = Join-Path $root "data\supervisor.pid"
if (Test-Path $supervisor) {
  $id = (Get-Content $supervisor -Raw).Trim()
  if ($id -match '^\d+$') { Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue }
  Remove-Item $supervisor -Force -ErrorAction SilentlyContinue
}
foreach ($p in @(Get-ServerProcesses $root)) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Stopped Teamflow (if it was running)."
