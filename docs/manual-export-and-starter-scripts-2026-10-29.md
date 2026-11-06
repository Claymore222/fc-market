# Manuel export ve başlangıç script’leri — 29.10.2026

Kullanıcının tercihi: oyun içi günlük/aylık/oturum export’u kapalı; kayıt dosyalarının FC Market tarafından
otomatik okunması ve uygulamanın güncellenmesi devam ediyor. Oyun içinde bu çalışma sırasında script çalıştırılmadı.

## Uygulanan ayar ve kullanım

- `C:\FC 27 Live Editor\lua\autorun\fc_export.lua` paketle SHA256 eşitliği doğrulandıktan sonra yedeklenip kaldırıldı.
- `C:\FC 27 LE v27.1.6\lua\autorun` içinde export yoktu. İki kurulumun autorun klasöründe de Lua dosyası kalmadı.
- İki kurulumun `lua\scripts` klasörüne `fc_export_manual.lua` kuruldu. Uygulamanın otomasyon panelinde
  **Manuel kariyer export’u** kur/kaldır anahtarı eklendi. Bu anahtar script’i kurar; oyunda kendiliğinden çalıştırmaz.
- Kariyer yüklüyken **F8 → Features → Lua Engine → fc_export_manual.lua**: yalnız o anda tam snapshot alır.
  `ENABLE_EVENT_LOG`, `AUTO_SNAPSHOT_ON_MONTH`, `AUTO_DAILY`, `AUTO_SESSION_SNAPSHOT` kapalıdır.
- **Eski `fc_export.lua` elle çalıştırıldığında da otomasyonu açar.** Manuel kullanımda yeni dosya seçilmeli.
- Oyun kontrol sırasında açıktı (FC27.exe PID 16264). Dosyayı autorun’dan kaldırmak bellekte kurulmuş handler’ı
  durdurmaz. Oyunu yeniden başlatmak veya kariyerde manuel script’i bir kez çalıştırmak gerekir. Manuel script
  mevcut global event işlevini otomasyonsuz sürümle değiştirir; önceden kayıtlı dispatch bundan sonra işlem yapmaz.
- Kayıt izleyicisi (10 sn), görsel dönüştürücü ve uygulama senkronu değiştirilmedi.

Yedek:
`%LOCALAPPDATA%\FcMarket\automation\manual-setup-20261029-201953\FC 27 Live Editor\automation\backups\export-18076e3292b64a35881c3a349ba2260f-fc_export.lua`

Orijinal ve yedek SHA256: `279BE862219227BFADBCE3E7718F28BD770792F16133AC372C7A979738F68BFC`.
İki kurulumdaki manuel sürüm SHA256: `41A43093B6EF215076995407FFB8A7AD22D5628984D1B492930C0B23E64EA47B`.
`exporter/` kaynakları değiştirilmedi; masaüstü yönetici sınıfı mevcut kaynaktan dört bayrağı kapalı bir kurulum
kopyası üretir. Bir bayrak eksik/tekrarlıysa kurulumu reddeder. Özel içerikli kurulu dosyalar ezilmez/kaldırılmaz.
Kariyer kayıtlarına ve `C:\FCExport\fc_career.db` dosyasına bu çalışma kapsamında yazılmadı.

## Başlangıç script’lerinin gerçek durumu

| Script | Ne yapar? | Bugünkü durum |
|---|---|---|
| `fcm_star_prospects.lua` | Takım başına mevcut bir genci güçlendirir; yeni oyuncu/kadro satırı oluşturmaz. 17–21 yaş, POT 80–95; OVR takımın ilk 11 seviyesine göre, üst sınır 82. | LE v27.1.6 `lua/scripts` içinde mevcut. Geçmişte uygulanmış; yeni kariyerde şu haliyle hazır değil. Ayrıntı aşağıda. |
| `fcm_common.lua`, `fcm_weights.lua` | Yıldız adayı ve M0 script’lerinin ortak yardımcıları/özellik ağırlıkları. | Aynı klasörde mevcut; tek başına çalıştırılacak mod değiller. Kaynakla SHA256 eşit. |
| `fc_clone_player.lua` | Kaynak oyuncunun yüz/vücut/özellik/oyun stili gibi alanlarını mevcut hedef oyuncuya kopyalar. Yeni oyuncu eklemez. | İki kurulumda mevcut, kaynakla aynı. `SOURCE_ID=0`, `TARGET_ID=0`, `DRY_RUN=true`; yapılandırılmadan uygulanamaz. Oyunda bu incelemede test edilmedi. |
| `fc_assets.lua` | Yüz/arma/bayrakları uygulamaya aktarır. | İki kurulumda mevcut; elle çalışır, oyuncu güçlendirmez. |
| `fc_minifaces.lua` | Eksik yüzleri raporlar; isteğe bağlı LE yüz çizimi üretir. | Mevcut; varsayılan `DRY_RUN=true`, `LIMIT=1`. Yeni oyuncu oluşturmaz. |
| `m0_01`–`m0_11` | LE yeteneklerini, kalıcılık/gelişim/kadro/bütçe/event davranışlarını araştırma araçları. | LE v27.1.6 scripts içinde mevcut. Normal kariyer başlangıcı için mod paketi değiller; bazıları ayara göre oyuncu alanı yazabilir. |

FFP, yabancı sınırı, nesil üretimi vb. `career-mods.md` fikirleri tamamlanmış başlangıç script’leri olarak
bulunmadı. Gerçek yeni oyuncu ekleyen bir script saptanmadı.

### Yıldız adayı: geçmiş kanıtı ve yeni kariyer engelleri

Kaynak: `exporter/lua/mods/fcm_star_prospects.lua`.
Kurulu: `C:\FC 27 LE v27.1.6\lua\scripts\fcm_star_prospects.lua`.
İçerik farkı yalnız sondaki ekstra boş satırdır; farklı SHA256 işlev farkı göstermiyor.

`C:\FCExport\m0\star_prospects.txt`:

- Satır 159989: `27 Oct 21:32:23 2026`, oyun tarihi `2026-07-21`, `MODE=reapply`.
- Satır 179274: **687 takım, 686 oyuncu yükseltildi, 1 takım atlandı**.
- Satır 179964: `27 Oct 21:39:17 2026`, oyun tarihi `2026-08-24`, `MODE=verify`.
- Son verify bloğundaki 686 oyuncunun POT’u **686/686 aynı**, OVR’ı **521/686 aynı**, farklı özellik sayısı
  sıfır olanlar **141/686**. Oyun ilerledikçe gelişim/yeniden hesaplama olabilir; bu kayıtlar her özelliğin sabit
  kaldığını veya yeni kariyer uyumluluğunu kanıtlamaz.

Bugünkü engeller:

1. `FCM_DIR="C:/FC27LE/lua/scripts/"`; **C:\FC27LE şu anda yok**. Yardımcı dosya yüklemesi hata verir.
2. `MODE="verify"`, `DRY_RUN=false`, `ALL_TEAMS=true`, `SKIP_USER_TEAM=false`. İlk çalıştırma için uygun
   güvenli önizleme ayarları değil; verify yeni aday uygulamaz.
3. `C:\FCExport\m0\star_prospects_state.json` mevcut (680469 bayt, 27.10.2026). Durum dosyası kariyer UID’siyle
   ayrılmıyor. Yeni kariyerde eski state ile restore/reapply yapılmamalı; apply da eski state yüzünden engellenir.
4. Değişiklik raporu/durum dosyası asıl yazımların sonunda kaydediliyor; başarısız alan yazımları çağıran döngüde
   başarıdan ayrılmıyor. Yeni kullanım öncesi önceden kalıcı yedek ve sonuç kontrolüyle sağlamlaştırılmalı.

Sonuç: geçmişte çalışan yıldız adayı sistemi duruyor; **yeni kariyere hazır** sayılmıyor. Bu incelemede mod
ayarları, eski state ve oyun değiştirilmedi. Yeni kullanım için yol düzeltmesi, kariyere özel state, dry-run ve
tek takım denemesi gerekir. Kaynak değişikliği `CLAUDE.md` içindeki `exporter/` kuralına tabidir.

## Doğrulama

| Kontrol | Sonuç ve kanıt |
|---|---|
| Backend | GEÇTİ — `dotnet test backend/FcMarket.Tests --no-restore`, 172 başarılı. Mevcut ClubTests.cs:567 nullable uyarısı. |
| Kayıt okuyucu | GEÇTİ — `python -m unittest discover -s tools/saveimport/tests`, 34 test. |
| Görseller | GEÇTİ — `python -m unittest discover -s tools/assets/tests`, 3 test. |
| Playwright | GEÇTİ — 39 test; yerel kariyer isteyen görsel testler normal çalıştırmada atlanır. |
| Gerçek yerel arayüz | GEÇTİ — `FC_VISUAL_REAL=1`, `real automation settings fit desktop and mobile`, 1 test. 390 px taşma, Escape, JS hataları; `scratch/visual-parity/automation-settings*.png`. |
| TypeScript / üretim build | GEÇTİ — `npm --prefix frontend run typecheck`, `npm --prefix frontend run build`. Vite mevcut büyük chunk uyarısı. |
| Masaüstü build | GEÇTİ — `dotnet build desktop/FcMarket.Desktop --no-restore`, 0 hata/uyarı. |
| Gerçek kurulum | GEÇTİ — üretim AutomationManager ile iki kurulumda export/legacyAssets `Installed=false`, manualExport `Installed=true`, `Matches=true`. Autorun boş; yedek hash’i kaynakla aynı. |
| Manuel Lua davranışı | GEÇTİ — Lua 5.4, izole LE taklidi: tek `reason=manual` tam snapshot, sıfır handler kaydı; gün/ay/event sonrası yeni çıktı yok; eski dispatch yeni global işlevi çağırıyor; kariyer dışında snapshot yok. Gerçek dosya IO’su yapılmadı. |
| Mod sözdizimi | GEÇTİ — kaynak M0/mod Lua dosyaları, kurulu prospects ve clone Lua 5.4 ile derlendi. Bu bir oyun içi uygulama testi değildir. |

İlk birleşik eski görsel test, otomasyon ekran görüntülerinden sonra yerel API’de Fenerbahçe kariyerini
bulamadığı için zaman aşımına uğradı. Otomasyon görsel kontrolü kariyere bağlı PlayStyle kontrolünden ayrıldı;
bağımsız otomasyon testi geçti. PlayStyle veya yeni kariyerde mod uygulaması bu teslimde doğrulanmadı.

Uygulamayı yeni panelle açmak: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
