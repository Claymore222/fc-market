# FC 27 kayıtlarını yedekle / geri yükle (Windows PowerShell 5.1 uyumlu).
#
#   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup              # yedek al
#   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup -Label once  # adına etiket ekle
#   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 list                # yedekleri listele
#   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 restore <yedek-adı> # kariyer kayıtlarını geri yükle
#   ... restore <yedek-adı> -All     # tüm settings klasörünü (ayarlar, kadrolar dahil) geri yükle
#   ... restore <yedek-adı> -Exact   # yedekte olmayan, sonradan oluşmuş kariyer kayıtlarını da kaldır
#
# Kayıtlar: %LOCALAPPDATA%\EA SPORTS FC 27\settings
#   CmMgrC<zaman>  Menajer kariyeri kayıtları (her slot ayrı dosya)
#   CmPlyr*        Oyuncu kariyeri (varsa)
#   Settings*, Squads*, ProfileOptions ...  oyun ayarları ve kadrolar
# Yedek: her biri ayrı klasör, varsayılan C:\FCSaveBackup\<yyyyMMdd-HHmmss>[-etiket]
#
# Geri yüklemeden önce mevcut durumun yedeği otomatik alınır ("before-restore" etiketiyle). Oyun açıkken geri yükleme
# yapılmaz. EA app bulut senkronu açıksa oyun açılışında bulut kaydı yereli ezebilir; test için kapatman önerilir.
param(
    [Parameter(Position = 0)] [ValidateSet("backup", "list", "restore")] [string]$Command = "backup",
    [Parameter(Position = 1)] [string]$Name,
    [string]$Label,
    [string]$SettingsDir = (Join-Path $env:LOCALAPPDATA "EA SPORTS FC 27\settings"),
    [string]$BackupRoot = "C:\FCSaveBackup",
    [switch]$All,
    [switch]$Exact
)
$ErrorActionPreference = "Stop"

$CareerPatterns = @("CmMgr*", "CmPlyr*")

function Test-GameRunning { [bool](Get-Process -Name "FC27" -ErrorAction SilentlyContinue) }

function Get-CareerFiles([string]$dir) {
    $CareerPatterns | ForEach-Object { Get-ChildItem -Path $dir -Filter $_ -File -ErrorAction SilentlyContinue }
}

function New-Backup([string]$tag) {
    if (-not (Test-Path $SettingsDir)) { throw "Kayıt klasörü yok: $SettingsDir" }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dest = Join-Path $BackupRoot ($(if ($tag) { "$stamp-$tag" } else { $stamp }))
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    $files = Get-ChildItem -Path $SettingsDir -File
    $files | Copy-Item -Destination $dest
    $career = @(Get-CareerFiles $dest)
    $mb = [math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "Yedek alındı: $dest  ($($files.Count) dosya, $mb MB, $($career.Count) kariyer kaydı)"
    foreach ($f in $career) { Write-Host ("  {0,-34} {1:yyyy-MM-dd HH:mm}" -f $f.Name, $f.LastWriteTime) }
    return $dest
}

switch ($Command) {
    "backup" {
        if (Test-GameRunning) {
            Write-Host "UYARI: FC 27 açık. Oyun kayıt yazarken alınan yedek yarım olabilir; kaydetme bittikten sonra ya da menüdeyken al." -ForegroundColor Yellow
        }
        New-Backup $Label | Out-Null
    }
    "list" {
        if (-not (Test-Path $BackupRoot)) { Write-Host "Henüz yedek yok ($BackupRoot)."; break }
        Get-ChildItem -Path $BackupRoot -Directory | Sort-Object Name | ForEach-Object {
            $career = @(Get-CareerFiles $_.FullName)
            Write-Host ("{0,-32} {1,3} kariyer kaydı" -f $_.Name, $career.Count)
        }
    }
    "restore" {
        if (-not $Name) { throw "Yedek adı gerekli. 'list' ile bak." }
        $src = Join-Path $BackupRoot $Name
        if (-not (Test-Path $src)) { throw "Yedek yok: $src" }
        if (Test-GameRunning) { throw "FC 27 açık. Önce oyunu tamamen kapat." }

        $files = if ($All) { @(Get-ChildItem -Path $src -File) } else { @(Get-CareerFiles $src) }
        if ($files.Count -eq 0) { throw "Yedekte geri yüklenecek dosya yok: $src" }
        $extra = @()
        if ($Exact) {
            $names = @(Get-CareerFiles $src | ForEach-Object Name)
            $extra = @(Get-CareerFiles $SettingsDir | Where-Object { $names -notcontains $_.Name })
        }

        Write-Host "Geri yüklenecek ($src -> $SettingsDir):"
        foreach ($f in $files) { Write-Host "  $($f.Name)" }
        if ($extra.Count -gt 0) {
            Write-Host "Kaldırılacak (yedekte yok, sonradan oluşmuş):" -ForegroundColor Yellow
            foreach ($f in $extra) { Write-Host "  $($f.Name)" }
        }
        $answer = Read-Host "Devam? Önce mevcut durumun yedeği alınacak (e/h)"
        if ($answer -notin @("e", "E", "evet", "y", "Y")) { Write-Host "İptal edildi."; break }

        New-Backup "before-restore" | Out-Null
        $files | Copy-Item -Destination $SettingsDir -Force
        $extra | Remove-Item -Force
        Write-Host "Geri yüklendi: $($files.Count) dosya$(if ($extra.Count) { ", $($extra.Count) dosya kaldırıldı" })."
    }
}
