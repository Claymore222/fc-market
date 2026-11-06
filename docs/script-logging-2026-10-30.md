# Script log klasörleri — 30.10.2026

Kullanıcının isteğiyle kurulu FC Market Lua dosyaları ve uygulama araçlarının logları ayrıldı.

```text
C:\FCExport\logs\
  lua\
    fc_export_manual\
    fc_export\
    fc_assets\
    fc_clone_player\
    fc_minifaces\
    fc_trophies\
    fcm_star_prospects\
    fcm_common\
    fcm_weights\
    m0_01_autorun\ ... m0_11_event_args\
    fc_diagnose\ fc_diag\ fc_memprobe\ fc_probe\ le_capabilities\
  app\
    desktop\
    api\
    saveimport\
    assets\
  setup\
```

Her çalıştırma tarih/saat içeren `.log` dosyası üretir; zamanlar dosyalarda açıkça **UTC** olarak belirtilir.
Lua logu START, konsol çıktısı, END/FAILED, süre ve hata stack trace'ini içerir. Script bittikten sonra gelen
event callback hataları da aynı script'in loguna yazılır. Yardımcı fcm_common/fcm_weights çıktısı çalışırken
çağıran script'in loguna gider; yardımcı yüklemesinin kendi başlangıç/bitişi ayrıca kaydedilir.

Masaüstü uygulaması Python ve API stdout/stderr'ini bileşen klasörüne yazar. `%LOCALAPPDATA%\FcMarket\desktop.log`
uyumluluk için de tutulur; artık eski oturumları başlangıçta silmez. Tek başına çalıştırılan Python araçları da
aynı export kökünde kendi klasörüne UTF-8 log üretir. Konsoldaki JSON değiştirilmez. Native host yakalıyorsa
Python ikinci bir kopya üretmez. Log yazımı başarısızsa araç/oyun script'i durdurulmaz, mevcut konsol yolu korunur.

## Kurulum ve koruma

- `C:\FC 27 Live Editor` ve `C:\FC 27 LE v27.1.6` altındaki **34 kurulu Lua kopyası / 25 farklı isim** loglanır.
  Live Editor'ün kendi stock script'leri değiştirilmedi. Lua dosyaları bu çalışma sırasında oyunda çalıştırılmadı.
- `exporter/` kaynakları ve export formatı/yolları değiştirilmedi. Kurulu kopyalara dış sarmalayıcı eklendi;
  gövde SHA256 ile korunur. Mod ayarları (DRY_RUN, MODE, TEAM_IDS vb.) ve işleyişi değiştirilmedi.
- Kopyalar `%LOCALAPPDATA%\FcMarket\automation\backups\logging-20261029-211055-4858959` altında yedeklendi.
  Kurulum kanıtı: `C:\FCExport\logs\setup\20261029-211055-4858959.log`, **Updated=34**.
  Tekrar kurulum: `20261029-211227-6755315.log`, **Updated=0**.
- İki autorun klasörü boş kaldı. Manuel export'taki dört otomasyon bayrağı kapalı; yeniden etkinleştirilmedi.
- Log klasörleri kurulumda hazırlanır. Script'lerin yanına rastgele dosya atılmaz; eski rapor/CSV/manifest
  yolları uygulamanın okuyabildiği yerde kalır. Daha önce üretilmiş dosyalar taşınmadı veya silinmedi.
- Elle değiştirilmiş log sarmalayıcısı sessizce yeniden yazılmaz. Uygulama eski, tanınan düz export/assets
  kopyası için **Loglamayı etkinleştir** düğmesi sunar; yükseltmeden önce yedek alır. Özel gövdeler korunur.
- Paketleme log modülünü, Python yardımcı dosyasını ve kurulum aracını içerir; install.ps1 mevcut Lua dosyasını
  ham kaynakla ezmez. Aracı çalıştırırken otomasyon ayarı değiştirilmez.

Kurulum aracını tekrar çalıştırmak (klasörler silindiyse de yeniden hazırlar):

```powershell
dotnet run --project tools/scriptlogging -- C:\dev\fc27LiveEditorTransferMarket C:\FCExport "C:\FC 27 Live Editor" "C:\FC 27 LE v27.1.6"
```

Yeni loglar script'in **sonraki çalıştırmasında** oluşur. Yeni uygulama logları için masaüstünü yeniden aç:
`powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.

## Doğrulama

- Backend: **179 test geçti**; gövde koruma, tekrar kurulum, eski düz dosyayı loglu sürüme yükseltme,
  ayrı bileşen klasörleri ve eşzamanlı UTF-8 log yazımı dahil.
- Saveimport: **49 test geçti**; stdout JSON'un değişmemesi, traceback/başarı-kısmi hata ve native yakalamada
  yinelenen log oluşmaması dahil. Assets: **3 test geçti**.
- Playwright: **43 test geçti**, 5 isteğe bağlı gerçek veri testi bu çalıştırmada atlandı.
- İzole Lua 5.4: başarı/çoklu dönüş/nil, UTF-8, script hata stack'i, event hata stack'i, yardımcı logunun
  çağırana gitmesi, tekrar kurulum ve manuel export'un otomasyon açmaması geçti. Gerçek oyun/export dosyasına yazılmadı.
  Araç: `tools/scriptlogging/tests/verify_runtime.py`; optional `lupa.lua54` ile çalışır.
- Kurulu **34 dosya Lua 5.4 ile derlendi**; gövde digest'leri doğrulandı. Native AutomationManager iki kurulumda
  assets/manualExport için `Installed=true, Matches=true, Logged=true`, autorun için `Installed=false` döndürdü.
- Masaüstü Release ve frontend üretim build başarılı. Mevcut backend nullable ve Vite büyük chunk uyarıları sürüyor.
- Oyunun kayıtlarına ve `C:\FCExport\fc_career.db` dosyasına bu teslimde yazılmadı. Commit atılmadı.

Yeni oyun içi yazım/mod uygulaması testi yapılmadı; bu teslim log altyapısıdır. Önceki yıldız adayı hazırlık
eksikleri [manual-export-and-starter-scripts-2026-10-29.md](manual-export-and-starter-scripts-2026-10-29.md) içinde geçerli.
