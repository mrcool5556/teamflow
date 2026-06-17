Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like "*teamflow*" -or $_.CommandLine -like "*teamflow*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Stopped Teamflow node processes (if any were running)."
