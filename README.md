# FC Market

FC 27 Career Mode için yerel kariyer yardımcısı (CMTracker benzeri): Live Editor export'unu ve kariyer kaydını okur,
Windows masaüstü penceresinde gösterir. Oyuna ve kayıt dosyasına hiçbir şey yazmaz.
Durum ve yol haritası: [docs/PRODUCT-ROADMAP.md](docs/PRODUCT-ROADMAP.md).

## Çalıştırma

**Windows masaüstü penceresi (WebView2):**
```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1             # gerçek veri, C:\FCExport
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1 -Sample     # örnek veri
```
Başlatıcı arayüzü ve .NET projelerini derleyip pencereyi açar. Pencere içeri aktarma ve API süreçlerini yönetir,
kapanınca durdurur. FC 27 kayıt klasörü varsa birleşik izleyiciyi (kayıt + export, 10 sn) çalıştırır.
Gerekenler: .NET 9 SDK, Python 3.14+ (Zstandard için), Node 20+, Microsoft Edge WebView2 Runtime.
Günlük: `%LOCALAPPDATA%\FcMarket\desktop.log`. 5127 portu boş olmalı.

**Tarayıcıda (masaüstü penceresi olmadan):** `.\start.ps1` (Windows) ya da `./dev.sh` (Mac/Linux, örnek veri).

## Paket

```powershell
powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Version 0.1.0   # artifacts\FcMarket\FcMarket.exe + zip
```
Paket çift tıkla açılır (repo gerekmez); .NET 9 runtime, Python 3.14 (+ `pip install -r requirements.txt`, görseller için)
ve WebView2 kurulu olmalı. Kullanıcı verisi `%LOCALAPPDATA%\FcMarket` altında (app.db, `images\`, kayıt yedekleri,
`settings.json`) ve yeni paket açıldığında korunur. `settings.json` (isteğe bağlı):
```json
{ "exportDir": "C:\\FCExport", "python": "C:\\...\\python.exe" }
```

## Veri akışı

| Kaynak | Ne zaman | Araç |
|---|---|---|
| Live Editor export'u | Ay başı tam, her oyun günü hafif (kadro + lig + izleme listesi), elle | `exporter/lua/fc_export.lua` (Live Editor Lua Engine'de bir kez çalıştırılır, sonra kendiliğinden) |
| Kariyer kaydı (`CmMgrC*`) | Oyun her kaydettiğinde | `python -m tools.saveimport watch "%LOCALAPPDATA%\EA SPORTS FC 27\settings" --export-dir C:\FCExport --db C:\FCExport\fc_career.db` |
| Yüz, arma, bayrak | Bir kez (yeni oyuncular için tekrar) | `exporter/lua/fc_assets.lua` → `python -m tools.assets convert C:\FCExport\assets` |

İkisi tek veritabanında birleşir: aynı gün kayıt tabloları kayıttan, bütçe gibi bellek alanları export'tan; günlük
export son tam snapshot'ın üzerine bindirilir. Ayrıntı: [docs/save-import.md](docs/save-import.md).

## Testler
```bash
dotnet test backend/FcMarket.Tests
python -m unittest discover -s tools/saveimport/tests
python -m unittest discover -s tools/assets/tests
python exporter/tools/test_importer.py
npm --prefix frontend run test:e2e        # Microsoft Edge gerekir; gerçek kayıtlara dokunmaz
```

## Yapı
```
exporter/lua/             Live Editor script'leri: fc_export (export), fc_assets (görseller), mods/ (Faz 5 denemeleri)
exporter/tools/           eski export importer'ı ve örnek veri üretici
tools/saveimport/         kayıt okuyucu (T3DB + kariyer blokları), birleşik içeri aktarma ve izleyici
tools/assets/             DDS → PNG (faces/, crests/, flags/)
backend/FcMarket.Api/     ASP.NET Core 9 Minimal API (Dapper + Microsoft.Data.Sqlite), salt-okunur
frontend/                 React + Vite + TypeScript
desktop/                  WebView2 masaüstü kabuğu
config/field-map.json     kanonik alan → ham oyun alanı eşlemesi (+ etiketler)
config/saveimport/        kayıt meta verisi (MIT kaynaklı, bkz. README)
docs/                     PRODUCT-ROADMAP, data-dictionary, save-import, career-mods
```
Git dışı yerel veriler: `faces/`, `crests/`, `flags/`, `app.db`, `scratch/`, `sample_export/`.

## Ayarlar
- **Veri yolu:** `FC_CAREER_DB` ya da `appsettings.json` → `Paths:FcCareerDb`. Göreli yollar repo köküne göre.
- **Export klasörü** (izleme listesi `watchlist.txt` buraya yazılır): `FC_EXPORT_DIR`, varsayılan veritabanının klasörü.
- **Alan eşlemesi:** `config/field-map.json`; değişince backend yeniden yükler, eksik alanlar `/api/health`'te.
- **Değer ve fırsat formülleri:** `appsettings.json` → `Valuation` (CMTracker'a kalibre), `Opportunity`.
- **Görsel klasörleri:** `FC_FACES_DIR`, `FC_CRESTS_DIR`, `FC_FLAGS_DIR` (varsayılan repo kökü `faces/`, `crests/`, `flags/`).
- **LAN erişimi:** varsayılan yalnız `127.0.0.1`. `Server__Host=0.0.0.0` kimlik doğrulamasız açar; yalnız güvenilir ağda.

## API
| Yol | Açıklama |
|---|---|
| `GET /api/health` | DB durumu, son snapshot, field-map uyarıları |
| `GET /api/saves`, `/api/snapshots` | Kariyerler, dallar, snapshot'lar |
| `GET /api/club`, `/api/teams` | Kulüp görünümü (kadro, tablo, fikstür, kayıt verileri), takım veritabanı |
| `GET /api/filters/options`, `/api/players` | Scout filtreleri; filtre, çoklu sıralama, sayfalama |
| `GET /api/players/{id}`, `/history` | Oyuncu detayı, OVR/POT geçmişi (günlük noktalar dahil) |
| `GET /api/players/{id}/face`, `/api/teams/{id}/crest`, `/api/nations/{id}/flag` | Yerel görseller (yoksa 404) |
| `GET/POST/PUT/DELETE /api/shortlist` | İzleme listesi (app.db) |
| `GET /api/feed` | Snapshot'lar arası değişim akışı |
