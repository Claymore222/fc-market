# FC Market paketini üretir: artifacts\FcMarket\ (çift tıkla açılan FcMarket.exe) ve artifacts\FcMarket-v<sürüm>.zip.
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1                 # sürüm 0.1.0
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Version 0.2.0
# Gerekenler (derleme): .NET 9 SDK, Node 20+, Python 3.14 (pip). Çalıştırma: yalnız WebView2 Runtime (Windows 11'de hazır);
# .NET ve Python (Pillow ile) pakete gömülür. Tag ile release: .github/workflows/release.yml.
param([string]$Version = "0.1.0", [string]$PythonVersion = "3.14.2")
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
# Self-contained: kullanıcının .NET kurması gerekmez.
$net = @("-c", "Release", "-r", "win-x64", "--self-contained", "true", "-p:Version=$Version", "--nologo")
Invoke-Checked { dotnet publish desktop/FcMarket.Desktop @net -o $out } "Masaüstü derlemesi"
Invoke-Checked { dotnet publish backend/FcMarket.Api @net -o (Join-Path $out "app\api") } "API derlemesi"

# Gömülü Python: python.org'un resmî embeddable paketi + Pillow. İndirme artifacts\cache'te tutulur.
$cache = Join-Path $PSScriptRoot "artifacts\cache"
New-Item -ItemType Directory -Force $cache | Out-Null
$embedZip = Join-Path $cache "python-$PythonVersion-embed-amd64.zip"
if (-not (Test-Path $embedZip)) {
    Invoke-WebRequest "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" -OutFile "$embedZip.part" -UseBasicParsing
    Move-Item "$embedZip.part" $embedZip
}
$py = Join-Path $out "app\python"
Expand-Archive $embedZip -DestinationPath $py
$tag = ($PythonVersion -split '\.')[0..1] -join ''
# sys.path: standart kütüphane, Pillow ve paket kökü (tools/, exporter/). site kapalı kalır; PYTHONPATH yok sayılır.
Set-Content -Encoding ascii (Join-Path $py "python$tag._pth") "python$tag.zip`r`n.`r`nLib\site-packages`r`n..\.."
$pyMinor = ($PythonVersion -split '\.')[0..1] -join '.'
Invoke-Checked { python -m pip install --disable-pip-version-check --quiet --only-binary=:all: --platform win_amd64 `
    --python-version $pyMinor --implementation cp --target (Join-Path $py "Lib\site-packages") -r requirements.txt } "Pillow kurulumu"
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

# Paket kendi başına çalışabilmeli: gömülü Python, paketteki araçları ve Pillow'u bulmalı (repo kökünden değil).
Push-Location $env:TEMP
try { Invoke-Checked { & (Join-Path $py "python.exe") -c "import PIL, sqlite3, compression.zstd, tools.saveimport.store, tools.assets.convert; print('gomulu python tamam')" } "Gömülü Python denetimi" }
finally { Pop-Location }

$zip = Join-Path $PSScriptRoot "artifacts\FcMarket-v$Version.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip
Write-Host "Paket hazır: $out"
Write-Host "Zip: $zip"

# Kurulum dosyası (Inno Setup 6): masaüstü/Başlat kısayolu, kaldırma kaydı. ISCC yoksa yalnız zip üretilir.
$iscc = @((Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source,
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($iscc) {
    Invoke-Checked { & $iscc /Q "/DAppVersion=$Version" (Join-Path $PSScriptRoot "installer\FcMarket.iss") } "Kurulum dosyası"
    Write-Host "Kurulum: $(Join-Path $PSScriptRoot 'artifacts\FcMarket-Setup.exe')"
} else {
    Write-Warning "Inno Setup 6 bulunamadı; FcMarket-Setup.exe üretilmedi (winget install JRSoftware.InnoSetup)."
}
