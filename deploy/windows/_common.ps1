function Ensure-Pnpm {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Enabling pnpm via corepack..."
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
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
