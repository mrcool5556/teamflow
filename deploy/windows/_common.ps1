function Ensure-Pnpm {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
      Write-Host "pnpm not found. Install pnpm or use Node.js 20+ with Corepack." -ForegroundColor Red
      exit 1
    }
    Write-Host "pnpm not found on PATH; using Corepack pnpm."
  }
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

  Ensure-Pnpm
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @Args
  } else {
    & corepack pnpm @Args
  }

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
