param([string]$ExportDir = "C:\FCExport", [switch]$Sample)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) { $pythonCommand = Get-Command py -ErrorAction SilentlyContinue }
if (-not $pythonCommand) { throw "Python 3 bulunamadi." }
function Invoke-Checked([scriptblock]$Action) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "Hazirlik basarisiz: $LASTEXITCODE" }
}
if ($Sample) {
    $ExportDir = Join-Path $PSScriptRoot "sample_export"
    if (-not (Test-Path (Join-Path $ExportDir "manifest.jsonl"))) {
        Invoke-Checked { & $pythonCommand.Source exporter/tools/make_sample_export.py $ExportDir --months 6 --players 3000 }
    }
}
if (-not (Test-Path (Join-Path $ExportDir "manifest.jsonl"))) { throw "Export bulunamadi: $ExportDir" }
$ExportDir = (Resolve-Path $ExportDir).Path
if (-not (Test-Path frontend/node_modules)) { Invoke-Checked { npm --prefix frontend ci --no-audit --no-fund } }
Invoke-Checked { npm --prefix frontend run build }
Invoke-Checked { dotnet build backend/FcMarket.Api -c Release --nologo }
Invoke-Checked { dotnet build desktop/FcMarket.Desktop -c Release --nologo }
# The native window owns its backend/importer; closing it stops only those processes.
Start-Process -FilePath "$PSScriptRoot\desktop\FcMarket.Desktop\bin\Release\net9.0-windows\FcMarket.exe" -ArgumentList @(
    "`"$PSScriptRoot`"", "`"$ExportDir`"", "`"$($pythonCommand.Source)`"")
