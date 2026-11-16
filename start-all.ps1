# One-click setup: write client configs, start the bridge, install autostart, self-check.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\start-all.ps1
#   powershell -ExecutionPolicy Bypass -File .\start-all.ps1 --upstream https://api.deepseek.com --api-key sk-xxx
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI
# (GBK on zh-CN), so non-ASCII bytes can corrupt parsing. Keep it ASCII.
$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
    node .\src\cli.mjs install @args
    if ($LASTEXITCODE -ne 0) { Write-Host '[start-all] install reported problems (see above)'; }
    node .\src\cli.mjs doctor
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($code -ne 0) { Write-Host '[start-all] doctor reported problems (see above)' }
exit $code
