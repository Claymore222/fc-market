# İlerleme durumu

> Son güncelleme: 16 Ekim 2026, Windows PC (oyunun olduğu makine). İlk gerçek snapshot alındı.
> Mimari ve fazlar için [PLAN.md](PLAN.md), alan varsayımları için [docs/data-dictionary.md](docs/data-dictionary.md).

## Özet

Faz 1 (MVP) bitti ve Windows PC'de **gerçek oyun verisiyle** çalışıyor (`start.ps1`, 91 xUnit testi geçiyor).
Faz 0'da ilk gerçek snapshot alındı (FC 27, kariyer tarihi 17.10.2029, 23.427 oyuncu), field-map gerçek veriye göre
düzeltildi. Kalan tek kabul adımı: 10 oyuncunun oyundaki ekranla karşılaştırılması.

## Bitenler

**Backend** (`backend/FcMarket.Api`, ASP.NET Core 9 Minimal API, Dapper + Microsoft.Data.Sqlite)
- `fc_career.db` her zaman `Mode=ReadOnly` açılıyor; uygulama hiçbir şey yazmıyor. Sadece `127.0.0.1:5127`'yi dinliyor.
- Alan eşleme katmanı: `config/field-map.json`. Kod ham alan adı içermiyor. Eksik tablo ya da kolon uygulamayı
  çökertmiyor, o alan boş geliyor ve uyarı `/api/health`'te görünüyor. Dosya değişince yeniden başlatmadan okunuyor.
- Uçlar: `health`, `saves`, `snapshots`, `filters/options`, `players` (filtre, çoklu sıralama, sayfalama),
  `players/{id}` (detay), `players/{id}/history`, `players/{id}/face`, `shortlist` (GET, POST/PUT/DELETE
  `shortlist/{id}`), `feed`.
- `app.db` (repo kökünde, `FC_APP_DB` ile değişir): shortlist. Yazan istekler başka bir sitenin Origin'iyle gelirse 403.
- Haber akışı: oyun günü başına son snapshot'lar ardışık karşılaştırılır. Herkes için transfer, OVR ≥ +3, |ΔPOT| ≥ 3,
  yeni/ayrılan oyuncu; shortlist ve kullanıcı takımı için her OVR/POT değişimi ve sözleşme yenilemesi. Eşikler
  `appsettings.json` → `Feed`.
- Hesaplanan değerler: oyun tarihine göre yaş, sezon bitiş yılı, sözleşmede kalan yıl, aylık gelişim hızı,
  tahmini piyasa değeri (kırılımıyla), fırsat skoru (bileşenleriyle). Katsayılar `appsettings.json`'da.
- Pozisyon genelleri: `config/position-ratings.json`'daki ağırlıklarla özelliklerden hesaplanıyor, ana pozisyon
  OVR'a eşitleniyor.
- Son snapshot belleğe alınıyor; importer yeni snapshot eklerse bir sonraki istekte otomatik yükleniyor.
- Performans (Release, 20.000 oyuncu × 12 snapshot, Windows PC): `/api/players` sayfa sorguları 1–4 ms; bir
  sıralamanın snapshot'taki ilk kullanımı en fazla ~45 ms (sıralama önbelleği + açılışta ön hazırlık). Snapshot yükleme
  ~180 ms, `/history` ~1 ms. Ayrıntı: `docs/data-dictionary.md` → Performans notu.
- Importer `--watch` ile yazarken okuma test edildi: 20/20 istek başarılı, yeni snapshot yakalandı.

**Testler** (`backend/FcMarket.Tests`, 91 test; FC 27 biçimi için `Fc27FormatTests`): yaş/sezon/sözleşme, değer formülü (PLAN'daki örnek değerler),
fırsat skoru, pozisyon genelleri, field-map doğrulama, gerçek SQLite dosyasıyla uçtan uca piyasa sorguları
(eksik tablo/kolon, arama, filtre, sıralama, sayfalama).

**Frontend** (`frontend/`, React 18 + Vite + TypeScript, TanStack Query + Virtual)
- Piyasa ekranı (`/market`): filtre paneli (isim, yaş, pozisyon, OVR/POT, lig, kulüp, ülke, sözleşme bitişi,
  maksimum değer, ayak), 4 hazır liste (Wonderkid'ler, Bedavaya gelecekler, Kelepir, Hazır yıldız), sanal
  kaydırmalı tablo, kolon seçici, Shift+tık ile çoklu sıralama. Filtreler URL'de tutuluyor.
- Detay paneli (800 px): avatar, OVR/POT, pozisyon genellerini gösteren saha haritası, "neden bu değer" kırılımı,
  fırsat skoru bileşenleri, özellik grupları, OVR/POT gelişim grafiği, sözleşme ve sezon istatistikleri.
  ↑/↓ ile önceki/sonraki oyuncu, Esc ile kapanış.
- Koyu (varsayılan) ve açık tema; 1440 px, 1024 px ve dar pencere düzenleri. Sağlık uyarıları için sarı banner,
  30 sn'de bir "yeni snapshot geldi" kontrolü.
- Arayüz Türkçe; metinler `src/lib/i18n.ts`'te toplu (i18n'e hazır).

**Doküman ve araçlar:** `docs/data-dictionary.md` (doğrulananlar işaretli, kalanlar **DOĞRULANACAK**), `README.md`,
`dev.sh` (Mac), `start.ps1` (Windows; `-Sample` ile örnek veri).

**Exporter 0.3.0**: FC 27 LE v27.1.3'te eksik fonksiyonlar için yedekler (oyun tarihi `CalendarManager`'dan, kulüp
`teamplayerlinks`'ten, transfer bütçesi `BudgetManager`'dan), aylık otomatik snapshot (kayıt sırasında ertelenir),
`transfers`/`playerloans`/`playersuspensions` tabloları. Snapshot ~5 sn sürüyor. 0.2.1 oyunda denendi; 0.3.0'ın yeni
kısımları sahte ortamda test edildi, oyunda henüz denenmedi. Keşif araçları: `le_capabilities.lua`, `fc_probe.lua`.

**Importer:** `(snapshot_id, playerid|teamid)` index'leri, `player_current` tablosu, tek örnek kilidi.

**Örnek veri:** `make_sample_export.py` gerçek FC 27 biçimini üretiyor (kadın oyuncular, serbestler, milli takımlar,
0 tabanlı skill moves, yeni tablolar). Eski `sample_export` klasörü silinip yeniden üretilmeli.

**Tasarım:** veri senkronizasyonu ve otomasyon için [docs/sync-design.md](docs/sync-design.md) (onaylandı).

**Faz 5 (Career Mode mod'ları, oyuna yazar):** plan onaylandı (`docs/career-mods.md`). CLAUDE.md kuralı:
web uygulaması oyuna yazmaz; yalnızca `exporter/lua` altındaki Faz 5 mod'ları, LE'nin tablo API'si ve fonksiyonlarıyla,
kadro/sözleşme tablolarına dokunmadan, dry-run varsayılan açık. Hazır olanlar (17.10.2026):
- `tools/backup-saves.ps1`: kayıtları (`%LOCALAPPDATA%\EA SPORTS FC 27\settings`) yedekle / listele / geri yükle.
- `exporter/lua/mods/`: `fcm_common.lua` (ortak), `fcm_weights.lua` (`tools/gen_fcm_weights.py` üretir),
  `m0/m0_01…m0_11` doğrulama script'leri, `fcm_star_prospects.lua` (yol B, tek takımla başlar; verify/restore).
  Sahte LE ortamında (fengari) uçtan uca test edildi; **oyunda denenmedi**. Rehber: `docs/m0-test-guide.md`.
- Autorun probe iki aday klasöre kuruldu (`C:\FC27LE\lua\autorun`, `C:\FC 27 Live Editor\lua\autorun`); test bitince
  kaldırılacak.

## Yarım kalanlar

| Konu | Durum |
|---|---|
| Faz 0: kabul | Field-map doğrulandı. **Bekliyor:** Fenerbahçe kadrosundan 10 oyuncunun yaş/pozisyon/OVR/POT değerleri oyundaki ekranla karşılaştırılacak. |
| İstatistikler | FC 27 LE'de `GetPlayersStats` yok, `teamplayerlinks`'teki lig istatistikleri güvenilmez. Detay panelinde "İstatistik yok" görünüyor, health'te tek uyarı bu. |
| Doğrulanmayan değerler | Transfer bütçesi (`BudgetManager` +0x38 = 123,89 M€), maaşın haftalık olduğu, kiralık oyuncuların kulübü. Bkz. veri sözlüğü. |
| Tahmini değer | Formül üst seviyede çok yüksek (97 OVR → 614 M€). Katsayı kalibrasyonu ayrı iş. |
| Oyuncu yüzleri | Backend `faces/<playerid>.png` klasöründen sunuyor, arayüz yoksa baş harfleri gösteriyor. FC 27 LE v27.1.3'te miniface yakalama (`PlayerCapture*`) yok. |
| Pozisyon genelleri | Katsayılar yaklaşık. Oyundaki değerlerle karşılaştırılmadı. |
| Faz 2 | Shortlist ve haber akışı bitti (Faz 2a). Kalan: karşılaştırma, kayıtlı presetler, ayrı oyuncu sayfası, izleme listesi + hafif güncelleme (Faz 2b). |

## Sıradaki adım

1. Faz 0 kalanı: 10 oyuncunun OVR/POT'u oyunla aynı çıktı; pozisyonlar da tutuyorsa Faz 0 kabulü işaretlenir.
   Transfer bütçesi (+0x38) hâlâ oyundaki ekranla karşılaştırılmadı.
2. Oyunda birkaç gün ilerletip `fc_probe.lua`'yı yeniden çalıştır: takvimde +0x34 ile +0x40'tan hangisinin güncel
   tarih olduğu.
3. Ocak transfer döneminde `transfers` tablosu doluyor mu bak (sync-design §11).
4. Faz 2 kalanı: karşılaştırma, kayıtlı presetler; sonra Faz 2b (izleme listesi + `DAY_PASSED` hafif güncelleme).

**Oyun tarafı:** Live Editor `C:\FC27LE`'de (Türkçe karakterli yolda Lua kütüphaneleri yüklenmiyor). Export
klasörü `C:\FCExport`. Save yedeği `C:\FCSaveBackup`.

## Çalıştırma komutları

**Windows, gerçek veriyle (tek komut):**
```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1                     # C:\FCExport
powershell -ExecutionPolicy Bypass -File .\start.ps1 -ExportDir D:\FCExport
```
Importer'ı `--watch` ile arka planda çalıştırır, frontend'i bir kez derler, backend'i başlatır.
Arayüz ve API aynı adreste: http://127.0.0.1:5127/market

**Mac/Linux, örnek veriyle:**
```bash
./dev.sh          # örnek veri yoksa üretir; backend :5127 + Vite :5173
```

**Elle:**
```bash
python exporter/tools/make_sample_export.py ./sample_export --months 6 --players 3000
python exporter/tools/importer.py ./sample_export --db ./fc_career.db
dotnet run --project backend/FcMarket.Api          # FC_CAREER_DB ile farklı veritabanı
npm --prefix frontend install
npm --prefix frontend run dev                       # http://127.0.0.1:5173/market
dotnet test backend/FcMarket.Tests
npm --prefix frontend run typecheck
```

Faydalı ortam değişkenleri: `FC_CAREER_DB` (veritabanı), `FC_FIELD_MAP` (field-map yolu), `FC_FACES_DIR`
(yüz klasörü), `Server__Host` / `Server__Port` (dinlenen adres; LAN'a açmadan önce README'deki uyarıyı oku).

## Bilinen sorunlar ve notlar

- **`start.ps1`** Windows PowerShell 5.1'de örnek veriyle denendi (UTF-8 BOM'lu). Python `python` ya da `py` olarak
  aranıyor. Native komutların çıkış kodu kontrol ediliyor; tarayıcı backend portu açılınca açılıyor.
- **.NET:** Windows PC'de yalnızca .NET 10 SDK/runtime var. Projeler `net9.0` hedefliyor ve `RollForward=Major`
  ile .NET 9 runtime yoksa .NET 10'da çalışıyor. İstenirse .NET 9 runtime kurulabilir; kod değişikliği gerekmez.
- **Git:** Windows'ta `core.fileMode=false` (zip'ten gelen repo `dev.sh`'nin çalıştırma iznini değişiklik sanıyordu).
- **Exporter v2 yolu denenmedi.** `LE.db` yoksa v1 fonksiyonlarına düşüyor; Live Editor log'undaki
  `[FC-EXPORT] ... (v1)` / `(v2)` satırları hangisinin kullanıldığını gösterir. v2 şemasında `rangehigh` yok.
- **Yüz görselleri:** `le_capabilities.lua` miniface yakalama fonksiyonlarını (`PlayerCapture*`) da kontrol
  ediyor. Varsa `faces/` klasörünü doldurmak mümkün olabilir; exporter'a eklemeden önce karar ver.
- **Tüm alan eşlemeleri tahmin.** Gerçek veride bazı kolonlar boş gelebilir; uygulama çökmez, sarı banner uyarır.
- **Sözleşmede kalan yıl sezon bazlı hesaplanıyor** (PLAN'daki "endYear − oyun yılı" yerine; Temmuz'dan sonra
  sezon bitiş yılı = yıl + 1). Gerekçe veri sözlüğünde. Oyunla doğrulanmalı.
- **Maaşın haftalık olduğu varsayıldı.** Doğrulanmalı.
- **Örnek veride pozisyon genelleri neredeyse düz** (özellikler pozisyondan bağımsız rastgele). Hata değil.
- **Importer index'leri ve `player_current`:** importer artık `(snapshot_id, playerid|teamid)` index'lerini ve
  `player_current` tablosunu kuruyor. Mevcut bir `fc_career.db` importer'ın ilk açılışında güncellenir. Backend
  `player_current`'ı kullanmıyor (gerekçe veri sözlüğünde).
- **Kulüp listesi alfabetik ama doğal sıralı değil** ("Takım 1, Takım 10, Takım 2"). Gerçek kulüp isimlerinde sorun olmaz.
- **Kolon tercihi tarayıcıda saklanıyor** (`localStorage` → `fcm.columns`). Kolonlar kaybolursa Kolonlar menüsünden
  aç ya da bu anahtarı sil.
- **Örnek veriyi aynı klasöre yeniden üretmek** `events.jsonl`'u baştan yazıyor; importer kaldığı byte'tan okuduğu
  için bazı event'ler eksik ya da tekrar gelebilir. Gerçek Lua export dosyaya ekleme yaptığı için etkilenmez.
- **PLAN'dan bilinçli sapmalar:** TanStack Table yerine özel ızgara + TanStack Virtual (sunucu tarafı sayfalı seyrek
  veri için daha sade); Recharts yerine elle çizilmiş SVG grafik (Faz 2'deki radar için eklenebilir); binler
  "B€" ile gösteriliyor ("850 B€").
- Mac'te sistem `dotnet`'i 6.0. .NET 9 SDK `~/.dotnet`'te; `dev.sh` bunu otomatik kullanıyor. Windows'u etkilemez.
