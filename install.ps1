# FC Market kurulumu (paket klasöründen ya da repodan bir kez çalıştırılır):
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -LiveEditorDir "D:\FC 27 Live Editor" -ExportDir D:\FCExport
# Yaptıkları: export klasörlerini açar, Live Editor script'lerini (fc_export.lua, fc_assets.lua) Live Editor'ün
# lua\scripts klasörüne kopyalar, Python paketini (Pillow) kurar, masaüstüne kısayol koyar, ayarları yazar.
# Oyuna ve kayıt dosyalarına dokunmaz.
param(
    [string]$LiveEditorDir = "C:\FC 27 Live Editor",
    [string]$ExportDir = "C:\FCExport"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
function Step([string]$Text) { Write-Host "-> $Text" }

# 1. Export klasörleri (Lua klasör oluşturamaz)
Step "Export klasörleri: $ExportDir"
foreach ($dir in $ExportDir, "$ExportDir\assets", "$ExportDir\assets\heads", "$ExportDir\assets\crests", "$ExportDir\assets\flags", "$ExportDir\assets\playstyles", "$ExportDir\assets\trophies", "$ExportDir\assets\leagues") {
    New-Item -ItemType Directory -Force $dir | Out-Null
}

# 2. Live Editor script'leri
$scripts = Join-Path $LiveEditorDir "lua\scripts"
if (Test-Path $LiveEditorDir) {
    New-Item -ItemType Directory -Force $scripts | Out-Null
    foreach ($name in "fc_export.lua", "fc_assets.lua") {
        if (-not (Test-Path (Join-Path $scripts $name))) {
            Copy-Item (Join-Path $PSScriptRoot "exporter\lua\$name") $scripts
        }
    }
    Step "Live Editor script'leri kopyalandı: $scripts"
    $logTool = Join-Path $PSScriptRoot "app\scriptlogging\ScriptLogging.exe"
    if (Test-Path $logTool) {
        & $logTool $PSScriptRoot $ExportDir $LiveEditorDir
        if ($LASTEXITCODE -ne 0) { throw "Script log kurulumu başarısız; yedek ve log dosyalarını kontrol edin." }
    } elseif (Test-Path (Join-Path $PSScriptRoot "tools\scriptlogging\ScriptLogging.csproj")) {
        & dotnet run --project (Join-Path $PSScriptRoot "tools\scriptlogging") -- $PSScriptRoot $ExportDir $LiveEditorDir
        if ($LASTEXITCODE -ne 0) { throw "Script log kurulumu başarısız." }
    } else { Write-Warning "Script log aracı eksik; paketi yeniden indirin." }
} else {
    Write-Warning "Live Editor klasörü bulunamadı: $LiveEditorDir (script'leri sonra exporter\lua'dan elle kopyalayın ya da -LiveEditorDir verin)"
}

# 3. Python ve Pillow
$python = Get-Command python -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch "WindowsApps" } | Select-Object -First 1
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue | Select-Object -First 1 }
if ($python) {
    Step "Python paketleri ($($python.Source))"
    & $python.Source -m pip install --user --quiet --disable-pip-version-check -r (Join-Path $PSScriptRoot "requirements.txt")
    if ($LASTEXITCODE -ne 0) { Write-Warning "pip install başarısız; görsel dönüştürme çalışmayabilir." }
} else {
    Write-Warning "Python bulunamadı. python.org'dan Python 3.14 kurup bu script'i yeniden çalıştırın."
}

# 4. Ayarlar (varsayılandan farklıysa) ve kısayol
$data = Join-Path $env:LOCALAPPDATA "FcMarket"
New-Item -ItemType Directory -Force $data | Out-Null
if ($ExportDir -ne "C:\FCExport" -or (Test-Path $LiveEditorDir)) {
    $settingsPath = Join-Path $data "settings.json"
    $settings = @{}
    if (Test-Path $settingsPath) { (Get-Content $settingsPath -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $settings[$_.Name] = $_.Value } }
    if ($ExportDir -ne "C:\FCExport") { $settings["exportDir"] = $ExportDir }
    if (Test-Path $LiveEditorDir) { $settings["liveEditorDir"] = (Resolve-Path $LiveEditorDir).Path }
    $settings | ConvertTo-Json | Set-Content -Encoding utf8 $settingsPath
    Step "Ayar yazıldı: $settingsPath"
}
$exe = Join-Path $PSScriptRoot "FcMarket.exe"
if (Test-Path $exe) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "FC Market.lnk"))
    $link.TargetPath = $exe
    $link.WorkingDirectory = $PSScriptRoot
    $link.IconLocation = "$exe,0"
    $link.Save()
    Step "Masaüstü kısayolu oluşturuldu"
} else {
    Write-Host "   (Repodan çalıştırıldı: kısayol için paketteki install.ps1'i kullanın.)"
}

Write-Host ""
Write-Host "Kurulum tamam. Oyunda Live Editor -> Features -> Lua Engine -> fc_export.lua'yı bir kez çalıştırın."
Write-Host "Görseller için fc_assets.lua; FC Market yeni görselleri kendiliğinden alır."
