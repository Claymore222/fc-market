# Windows (oyunun olduğu PC): tek komut.
#   powershell -ExecutionPolicy Bypass -File .\start.ps1                        # gerçek veri, C:\FCExport
#   powershell -ExecutionPolicy Bypass -File .\start.ps1 -ExportDir D:\FCExport
#   powershell -ExecutionPolicy Bypass -File .\start.ps1 -Sample                # örnek veri (.\sample_export)
#
# 1) importer.py --watch ile export klasörünü sürekli fc_career.db'ye aktarır (arka planda)
# 2) frontend derlenmemişse ya da kaynağı değiştiyse derler (npm)
# 3) backend'i başlatır, hazır olunca tarayıcıyı açar; arayüz ve API aynı adreste: http://127.0.0.1:5127
param(
    [string]$ExportDir = "C:\FCExport",
    [int]$WatchSeconds = 10,
    [switch]$Sample,     # örnek veriyle çalış; yoksa üretir
    [switch]$NoBrowser   # tarayıcıyı açma
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Windows PowerShell 5.1 uyumlu (?? operatörü yok)
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { throw "Python 3 bulunamadı (importer için gerekli)." }

# Native komutlar hata verince PowerShell durmuyor; çıkış kodunu kontrol et.
function Invoke-Checked([string]$What, [scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What başarısız (çıkış kodu $LASTEXITCODE)." }
}

if ($Sample) {
    $ExportDir = Join-Path $PSScriptRoot "sample_export"
    if (-not (Test-Path (Join-Path $ExportDir "manifest.jsonl"))) {
        Write-Host "» Örnek veri üretiliyor (6 ay, 3000 oyuncu)…"
        Invoke-Checked "Örnek veri üretimi" { & $python.Source exporter\tools\make_sample_export.py $ExportDir --months 6 --players 3000 }
    }
}
if (-not (Test-Path $ExportDir)) { throw "Export klasörü yok: $ExportDir (fc_export.lua'daki CONFIG.OUT_DIR)" }
$ExportDir = (Resolve-Path $ExportDir).Path
$db = Join-Path $ExportDir "fc_career.db"
$env:FC_CAREER_DB = $db
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"
$env:DOTNET_NOLOGO = "1"

# İlk aktarımı bekle ki backend boş veritabanıyla açılmasın, sonra izlemeye devam et.
Invoke-Checked "İlk import" { & $python.Source exporter\tools\importer.py $ExportDir --db $db }
$importer = Start-Process -FilePath $python.Source -NoNewWindow -PassThru -ArgumentList @(
    "exporter\tools\importer.py", "`"$ExportDir`"", "--db", "`"$db`"", "--watch", $WatchSeconds)

# Frontend: dist yoksa ya da kaynak daha yeniyse (ör. git pull sonrası) yeniden derle.
$dist = "frontend\dist\index.html"
$stale = -not (Test-Path $dist)
if (-not $stale) {
    $builtAt = (Get-Item $dist).LastWriteTime
    $stale = [bool](Get-ChildItem frontend\src, frontend\index.html, frontend\package.json, frontend\package-lock.json,
            frontend\tsconfig.json, frontend\vite.config.ts -Recurse -File |
        Where-Object { $_.LastWriteTime -gt $builtAt } | Select-Object -First 1)
}
if ($stale) {
    $installed = "frontend\node_modules\.package-lock.json"
    if (-not (Test-Path $installed) -or (Get-Item frontend\package-lock.json).LastWriteTime -gt (Get-Item $installed).LastWriteTime) {
        Write-Host "» Frontend bağımlılıkları kuruluyor…"
        # npm ci: package-lock.json'a dokunmaz (npm install farklı npm sürümünde onu yeniden yazıyor).
        Invoke-Checked "npm ci" { npm --prefix frontend ci --no-audit --no-fund }
    }
    Write-Host "» Frontend derleniyor…"
    Invoke-Checked "Frontend derlemesi" { npm --prefix frontend run build }
}

$backendExit = 0
try {
    if (-not $NoBrowser) {
        # Backend portu açılınca tarayıcıyı aç (ilk derleme bir dakika kadar sürebilir).
        Start-Job {
            for ($i = 0; $i -lt 180; $i++) {
                $tcp = New-Object System.Net.Sockets.TcpClient
                try { $tcp.Connect("127.0.0.1", 5127); Start-Process "http://127.0.0.1:5127/market"; return }
                catch { Start-Sleep -Seconds 1 }
                finally { $tcp.Close() }
            }
        } | Out-Null
    }
    dotnet run --project backend\FcMarket.Api -c Release
    $backendExit = $LASTEXITCODE
}
finally {
    if ($importer -and -not $importer.HasExited) { Stop-Process -Id $importer.Id }
    Get-Job | Remove-Job -Force
}
if ($backendExit -ne 0) { Write-Host "Backend hata ile kapandı (çıkış kodu $backendExit)." -ForegroundColor Red }
exit $backendExit
