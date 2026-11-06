# FC Market paketini üretir: artifacts\FcMarket\ (çift tıkla açılan FcMarket.exe) ve artifacts\FcMarket-v<sürüm>.zip.
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1                 # sürüm 0.1.0
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Version 0.2.0
# Gerekenler (derleme): .NET 9 SDK, Node 20+. Çalıştırma: .NET 9 runtime, Python 3.14, WebView2 Runtime.
param([string]$Version = "0.1.0")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-Checked([scriptblock]$Action, [string]$What) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$What başarısız: $LASTEXITCODE" }
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Sürüm X.Y.Z biçiminde olmalı: $Version" }


$out = Join-Path $PSScriptRoot "artifacts\FcMarket"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

if (-not (Test-Path frontend/node_modules)) { Invoke-Checked { npm --prefix frontend ci --no-audit --no-fund } "npm ci" }
Invoke-Checked { npm --prefix frontend run build } "Arayüz derlemesi"
Invoke-Checked { dotnet publish desktop/FcMarket.Desktop -c Release -o $out -p:Version=$Version --nologo } "Masaüstü derlemesi"
Invoke-Checked { dotnet publish backend/FcMarket.Api -c Release -o (Join-Path $out "app\api") -p:Version=$Version --nologo } "API derlemesi"

# Arayüz, ayarlar ve Python araçları (testler ve önbellek hariç)
Copy-Item -Recurse frontend/dist (Join-Path $out "frontend\dist")
Copy-Item -Recurse config (Join-Path $out "config")
foreach ($tool in "saveimport", "assets") {
    $dest = Join-Path $out "tools\$tool"
    New-Item -ItemType Directory -Force $dest | Out-Null
    Get-ChildItem "tools/$tool" -Filter *.py | Copy-Item -Destination $dest
    if (Test-Path "tools/$tool/README.md") { Copy-Item "tools/$tool/README.md" $dest }
}
Copy-Item tools/runlog.py (Join-Path $out "tools")
New-Item -ItemType Directory -Force (Join-Path $out "tools\scriptlogging") | Out-Null
Copy-Item tools/scriptlogging/fc_logging.lua (Join-Path $out "tools\scriptlogging")
Invoke-Checked { dotnet publish tools/scriptlogging -c Release -o (Join-Path $out "app\scriptlogging") --nologo } "Script log aracı"
New-Item -ItemType Directory -Force (Join-Path $out "exporter\tools"), (Join-Path $out "exporter\lua") | Out-Null
Copy-Item exporter/tools/importer.py (Join-Path $out "exporter\tools")
Get-ChildItem exporter/lua -Filter *.lua | Copy-Item -Destination (Join-Path $out "exporter\lua")
Copy-Item exporter/README.md (Join-Path $out "exporter")
Set-Content -Encoding utf8 (Join-Path $out "version.txt") $Version
Copy-Item install.ps1, requirements.txt $out

$zip = Join-Path $PSScriptRoot "artifacts\FcMarket-v$Version.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip
Write-Host "Paket hazır: $out"
Write-Host "Zip: $zip"
