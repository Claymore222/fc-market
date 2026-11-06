# FC Market test notları — 29.10.2026

Proje: `C:\dev\fc27LiveEditorTransferMarket`. Tarih değerlendirmesi: Europe/Istanbul.
CLAUDE.md, PRODUCT-ROADMAP.md ve save-import.md okundu. Kod değiştirilmedi, commit atılmadı.
Oyun kayıtlarına ve `C:\FCExport\fc_career.db` dosyasına yazılmadı; importer/izleyici başlatılmadı.
Testlerin geçici çıktıları `scratch/` ve standart test çıktı dizinlerinde tutuldu.

## TEST 1 — LE autorun 0.6.0: KALDI

| Kontrol | Sonuç | Kanıt / hata |
|---|---|---|
| Bugün eklenmiş tam `auto_session` snapshot | KALDI | `C:\FCExport\manifest.jsonl`: 7 satır, 0 bozuk JSON, 29.10.2026 tarihli 0 satır. Bugün `auto_session` bulunmadı; tam snapshot doğrulanamadı. |
| Sonraki günler `auto_day`, `partial=true` | KALDI | Bugün yok. Eski kanıt: manifest satır 6, `84af764b_20300718_195540_d`, `2026-10-28T16:55:40Z`; satır 7, `84af764b_20300719_195548_d`, `2026-10-28T16:55:50Z`. İkisi de `reason=auto_day`, `partial=true`; bugünkü autorun testini kanıtlamıyor. |
| Events dosyasına yeni satır | KALDI | `C:\FCExport\events.jsonl`: 179 satır, 0 bozuk JSON, bugün tarihli 0 satır. Son satır: `real_time=2026-10-28T16:55:48Z`, `event=MANAGER_OF_THE_MONTH`, `event_id=157`, `game_date=2030-07-19`. Test öncesi sayaç olmadığı için önce/sonra artış ayrıca ölçülemedi. |
| Autorun dosyası | KALDI | `C:\FC 27 Live Editor\lua\autorun\fc_export.lua` bulunamadı. `C:\FC 27 LE v27.1.6\lua\autorun\fc_export.lua` da bulunamadı. Kurulu autorun script'inin 0.6.0 olduğu doğrulanamadı. |

Dosya son değişim zamanları: manifest `28.10.2026 19:55:50`, events `28.10.2026 19:55:48`.
Bu bulgu bugünkü çalışmanın dosyalara yansımadığını gösterir; tek başına Lua kodunda hata olduğunu kanıtlamaz.

**Kullanıcıya not:** autorun klasörünü `C:\FC 27 LE v27.1.6\lua\autorun` olarak da dene.

## TEST 2 — “Kayıt dosyası ekle”: KALDI

| Kontrol | Sonuç | Kanıt / hata |
|---|---|---|
| Seçilen Masaüstü yolu saklanmış mı? | KALDI | `%LOCALAPPDATA%\FcMarket\added-saves.json` bulunamadı. `%USERPROFILE%\Desktop` altında `CmMgrC*` kopyası bulunamadı. Seçimin kalıcılığı doğrulanamadı. |
| Güncel masaüstü import log'u | KALDI | `%LOCALAPPDATA%\FcMarket\desktop.log`: 1.676 bayt, son değişim `28.10.2026 02:49:44`. Başlık: `FC Market 2026-10-28T02:49:44.1123203+03:00`. İlk importer satırı örnek DB için: `[importer] tamam: 0 yeni snapshot, 0 yeni event -> C:\dev\fc27LiveEditorTransferMarket\sample_export\fc_career.db`. Mevcut log'da import hatası/traceback görülmedi; güncel ekleme işleminin log'u yok. |
| Mevcut uygulamanın `/api/saves` yanıtı | KALDI | `curl.exe --silent --show-error --max-time 20 http://127.0.0.1:5127/api/saves`: çıkış 7, `Failed to connect ... Could not connect to server`. Sandbox dışından tekrar da çıkış 7 verdi. `FcMarket.Desktop` / `FcMarket.Api` süreci bulunmadı. |
| Kariyerlerin API'den okunması — izole ek kontrol | GEÇTİ | Importer olmadan, mevcut backend geçici DB kopyasıyla başlatıldı. `/api/saves`: Gençlerbirliği `2826f0ff59ba4800b5a6cb5dcff8122` (3 snapshot), Fenerbahçe SK `84af764ba0d247f880ccc658a7e0c7a` (6), Colchester `8d24c1460f4b44a6bcae550193fa94c` (1). Bu sonuç elle dosya eklemenin çalıştığını kanıtlamaz. Yanıt: `scratch/test-2026-10-29/api-saves.json`. |
| Bozuk `deneme.txt`: hata mesajı + uygulama açık kalmalı | KALDI | Dinamik masaüstü testi yapılamadı; uygulama açık değildi. Masaüstüne deneme dosyası oluşturulmadı/seçilmedi. `AddSaveAsync()` içe aktarıcıyı canlı DB hedefiyle başlatıyor; `runner.run_once()` bozuk dosyayı yakalasa da DB bağlantısı açıp `initialize()` ve export import adımlarına geçiyor. Bu işlem canlı DB'ye yazma yasağıyla çeliştiğinden tetiklenmedi. Çökmediği ve ekranda hata gösterdiği gözlemlenmedi. |

Statik inceleme: `desktop/FcMarket.Desktop/Program.cs`, `AddSaveAsync()` sıfırdan farklı importer
çıkışında `saveAdded, ok=false` ve “okunamadı” mesajı gönderiyor; `finally` içinde izleyiciyi yeniden
başlatıyor. Bu yalnız kod kanıtıdır; kullanıcı arayüzünde çalıştırılmış test yerine sayılmadı.

## TEST 3 — Otomatik testler: GEÇTİ

| Komut | Sonuç | Kanıt |
|---|---|---|
| `dotnet test backend/FcMarket.Tests` | GEÇTİ | Çıkış 0. `Başarısız: 0, Başarılı: 139, Atlanan: 0, Toplam: 139, Süre: 12 s`. |
| `python -m unittest discover -s tools/saveimport/tests` | GEÇTİ | Çıkış 0. `Ran 21 tests in 0.164s`, `OK`. |
| `python -m unittest discover -s tools/assets/tests` | GEÇTİ | Çıkış 0. `Ran 2 tests in 0.193s`, `OK`. |
| `npm --prefix frontend run test:e2e` | GEÇTİ | Çıkış 0. `15 passed (9.8s)`. |

Python testlerinde `TEMP`/`TMP` repo içindeki `scratch` dizinine yönlendirildi; bytecode üretimi
kapatıldı. Testler geçici/in-memory DB'lerle çalıştı. Backend ve Playwright sandbox dışında çalıştırıldı.

Playwright sırasında başarısız test oluşturmayan loglar vardı: `NO_COLOR` / `FORCE_COLOR` uyarıları;
Vite proxy'de `/api/players/1/face` ve `/api/nations/48/flag` için `ECONNREFUSED 127.0.0.1:5127`.
Dolayısıyla testlerin geçmesi, o sırada kapalı olan canlı API'nin/görsel endpoint'lerinin çalıştığı anlamına gelmez.

## TEST 4 — Hazırlık turnuvası: GEÇTİ (geçici kopyayla API kontrolü)

Başlangıçta API kapalıydı. Canlı DB'nin WAL dosyası 0 bayttı. DB `scratch/test-2026-10-29/fc_career.db`
dosyasına kopyalandı. Mevcut derlenmiş backend, importer olmadan bu kopyayı salt okunur açtı;
`FC_APP_DB` ve `FC_EXPORT_DIR` de aynı geçici dizine yönlendirildi. Başlangıç log'u:

```text
fc_career.db: C:\dev\fc27LiveEditorTransferMarket\scratch\test-2026-10-29\fc_career.db (salt-okunur)
Now listening on: http://127.0.0.1:5127
```

UID `/api/saves` yanıtından alındı: **`2826f0ff59ba4800b5a6cb5dcff8122`**, takım **Gençlerbirliği**.
Başarılı curl isteği:

```text
curl.exe --silent --show-error --fail --max-time 30 "http://127.0.0.1:5127/api/club?saveUid=2826f0ff59ba4800b5a6cb5dcff8122"
```

Yanıtta toplam 8 fikstür; bunlardan 3'ünde `competition="Hazırlık turnuvası"`, `competitionId=1927`:

| Tarih | Saat | Ev sahibi | Deplasman | Tur |
|---|---|---|---|---|
| 2026-07-17 | 16:00 | Gençlerbirliği | Burgos CF | 1 |
| 2026-07-21 | 16:00 | ESTAC Troyes | Gençlerbirliği | 2 |
| 2026-07-25 | 16:00 | Gençlerbirliği | Granada CF | 3 |

Ham yanıt: `scratch/test-2026-10-29/api-club.json`. Kontrol sonunda geçici API kapatıldı.
Canlı DB ve kullanılan kopyanın kontrol sonu SHA-256 değerleri aynı:
`a2136a74be6c906094d65d28a040cc840460030d403714988a9492dc954dc7f0`.

## TEST 5 — AI yüzleri oyunda: GEÇTİ

Dizin: `C:\FC 27 Live Editor\mods\legacy\data\ui\imgAssets\heads`.

| Dosya | Sonuç | Python/Pillow kanıtı |
|---|---|---|
| `p460018.DDS` | GEÇTİ | Dosya mevcut; 65.664 bayt; `Image.open()` + `load()` başarılı; format DDS, boyut `(256, 256)`, mod RGBA; DDS başlığı FourCC `b'DXT5'`. |
| `p246420.DDS` | GEÇTİ | Dosya mevcut; 65.664 bayt; `Image.open()` + `load()` başarılı; format DDS, boyut `(256, 256)`, mod RGBA; DDS başlığı FourCC `b'DXT5'`. |
| Oyunda görünürlük | GEÇTİ | Kullanıcıya iki oyuncu için soruldu; 29.10.2026 cevabı: **“İkisi de görünüyor.”** Görünürlük kullanıcı doğrulamasıdır. |

## Oyun içi test oturumu — 29.10.2026, 01:56–02:06 (devam ediyor)

Bu bölüm yukarıdaki önceki salt-okunur incelemeden ayrı, kullanıcının daha sonra istediği gerçek oyun/UI testidir. FC Market izleyicisi bu oturumda başlatıldı; otomatik Lua export'u ve uygulamanın kendi importer'ı çalıştı. Kod değiştirilmedi ve commit atılmadı. Kayıt dosyaları inceleme öncesinde `scratch/game-tests-2026-10-29/before/` altına kopyalandı. Henüz oyun içi elle kayıt yapılmadı.

Ekran görüntüleri: `scratch/game-tests-2026-10-29/screens/`. Aşağıdaki numaralar bu dizindeki dosyalardır. Arayüz bilgisayar kontrolüyle kullanıldı; Orijinal seçimi/kariyer yükleme aşamasında kullanıcı yardım etti ve Gençlerbirliği kariyerini yükledi.

### Hazırlık — GEÇTİ

- `C:\FC 27 Live Editor\lua\scripts\fc_export.lua`, istenen `C:\FC 27 Live Editor\lua\autorun\fc_export.lua` yoluna kopyalandı ve orada bırakıldı. Sürüm 0.6.0; kaynak/hedef SHA-256: `279BE862219227BFADBCE3E7718F28BD770792F16133AC372C7A979738F68BFC`.
- FC Market `start-desktop.ps1` ile başlatıldı. Live Editor `C:\FC 27 LE v27.1.6\Launcher.exe` üzerinden çalıştırıldı.
- Açılışta “İptal Et ve Çevrimdışı Oyna”, kariyer girişinde “Çevrimdışı Oyna” seçildi. Kanıt: `028`–`035` ekranları; ana menüde yeniden bağlanma seçeneği görünüyordu. Yeniden bağlanma/giriş seçilmedi. “Sunucudan bilgi yüklenemiyor” bilgi penceresi ayrıca görüldü ve Tamam ile kapatıldı (`041`–`042`).
- Yüklenen test kariyeri Gençlerbirliği, 17 Temmuz 2026 (`044`–`048`).

### OYUN TESTİ A — GEÇTİ

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Ana menüde F8, LE hata penceresi olmaması | GEÇTİ | `032` LE arayüzü; hata penceresi yok, log'da `Main Menu reached`, `Initial setup done`. `033` F8 ile kapanmış ekran. |
| İlk gün: 17 → 18 Temmuz | GEÇTİ | `048-calendar-selected.png`, `049-day18-selected.png`, `050-day18-confirm.png`, `053-day18-calendar.png`. Takvim uyarısı onaylandı; 17 Temmuz Burgos maçı gün ilerletme sırasında simüle edildi, sonuç 1–1 (`051`, `053`). |
| Tam oturum snapshot'ı | GEÇTİ | Manifest satır 8: `snapshot_id=2826f0ff_20260718_020326`, `reason=auto_session`, `game_date=2026-07-18`, 22 dosya; partial bayrağı yok. `exported_at=2026-10-28T23:03:32Z`, İstanbul saatiyle **29.10.2026 02:03:32**. |
| İkinci gün: 18 → 19 Temmuz | GEÇTİ | `054`–`056`; manifest satır 9: `2826f0ff_20260719_020356_d`, `reason=auto_day`, `partial=true`, `game_date=2026-07-19`. |
| Üçüncü gün: 19 → 20 Temmuz | GEÇTİ | `057`–`059`; manifest satır 10: `2826f0ff_20260720_020415_d`, `reason=auto_day`, `partial=true`, `game_date=2026-07-20`. |
| Events yeni satırları | GEÇTİ | Başlangıç 179, A sonrası 360 satır: **+181**. Son satır `game_date=2026-07-20`, `event=MANAGER_OF_THE_MONTH`, `real_time=2026-10-28T23:04:15Z`. |

Live Editor log kanıtı (`live_editor_29-10-2026.log`):

```text
23:03:26.839296 [FC-EXPORT] Snapshot başlıyor: 2826f0ff_20260718_020326 (auto_session)
23:03:32.555271 [FC-EXPORT] Snapshot bitti: 2826f0ff_20260718_020326 (22 dosya, 5.7 sn)
23:03:57.825106 [FC-EXPORT] Günlük export bitti: 2826f0ff_20260719_020356_d (497 oyuncu, 1.7 sn)
23:04:17.036652 [FC-EXPORT] Günlük export bitti: 2826f0ff_20260720_020415_d (498 oyuncu, 2.0 sn)
```

Export sırasında bekleme görüldü; log süreleri tam export için 5,7 sn, günlükler için 1,7/2,0 sn. Bunlar script çalışma süreleridir; kare düzeyinde ayrı donma ölçümü yapılmadı. Oyun takvime geri döndü, kalıcı kilitlenme görülmedi. Log'da `career_playercontract` alan listesi olmadığı için, istatistikler ise `GetPlayersStats yok` nedeniyle atlandı; snapshot tamamlandı.

Ham kanıt kopyaları: `scratch/game-tests-2026-10-29/manifest-after-A.jsonl`, `events-after-A.jsonl`, `live-editor-after-A.log`, `api-saves-after-A.json`.

### OYUN TESTİ B — KALDI (tamamlanmadı)

Oyun tarihi 20 Temmuz 2026'ya geldi. Henüz “Kaydet ve devam” / “Kaydet ve çık” işlemleri yapılmadığından kayıt sonrası 15 saniyelik senkron ve yeniden yükleme adımları doğrulanmadı.

Ara bulgu: `071-gencler-app-open.png` ekranında aynı anda üst çubuk **17 Temmuz 2026**, kulüp başlığı **Export: 20 Temmuz 2026**, takvim **BUGÜN 20 Temmuz 2026** gösteriyor. Kariyer seçim ekranı da 17 Temmuz'da kaldı (`070`). `/api/saves` ise Gençlerbirliği UID `2826f0ff59ba4800b5a6cb5dcff8122` için `lastGameDate=2026-07-20`, son snapshot `2826f0ff_20260720_020415_d`, `source=daily` döndürdü. Üst çubuk/seçim tarihi ile günlük export tarihi tutarsız; kayıt ve Yenile sonrasında tekrar kontrol edilmeli.

Navigasyonda alt kısımdaki Esc/Geri işaretine fareyle basmak beklenen geri eylemini sağlamadı; antrenör listesi açıldı (`066`). Hiçbir antrenör işe alınmadı. Kontrol aracının `Escape`/`Esc` tuşları ve sağ tık geri götürmedi (`067`–`069`, `072`). Kullanıcıdan yalnız Esc ile çıkış menüsüne gelmesi istendi. Fiziksel Esc, bilgisayar kontrol aracını şu mesajla durdurdu:

```text
Computer Use was stopped by the user with the physical Escape key.
Stop your work, do not call further Computer Use tools in this turn.
```

Kullanıcı ardından **“geldim”** yanıtını verdi; yeni menü henüz ekran görüntüsüyle doğrulanmadı. Bu duraklama uygulama/oyun çökmesi olarak değerlendirilmedi.

### OYUN TESTİ C — KALDI (henüz yapılmadı)

`fc_assets.lua` bu oturumda Lua Engine'den çalıştırılmadı; 30 saniye sonrası kadro görselleri kontrol edilmedi. `071` ana sayfasında bazı mevcut oyuncu yüzleri görünmesi bu testin yerine sayılmadı.

### OYUN TESTİ D — KALDI (henüz yapılmadı)

Fenerbahçe bu oturumda yüklenmedi; M. Pauleta ve J. Doku'nun yeni oyun içi ekran görüntüleri alınmadı. Önceki kullanıcı doğrulaması “İkisi de görünüyor” yukarıdaki TEST 5'te korunuyor. Diğer kariyerlerin üzerine kayıt yapılmadı.

### UYGULAMA TESTİ E — KALDI (hazırlık yapıldı, seçimler henüz yapılmadı)

Hazırlık anındaki en yeni dosya `CmMgrC20261029014018748`, oyunun kayıt klasöründen **kopyalanarak** gerçek Masaüstü yolu `%USERPROFILE%\OneDrive\Masaüstü\CmMgrC20261029014018748` altına alındı. `%USERPROFILE%\OneDrive\Masaüstü\deneme.txt` oluşturuldu. “Kayıt dosyası ekle” ile geçerli/bozuk dosya seçimi ve hata mesajı henüz denenmedi. B tamamlandıktan sonra en yeni kayıt kopyası yeniden belirlenmeli.

### Oturumun mevcut durumu

Bilgisayar kontrolü fiziksel Esc nedeniyle durduruldu. Oyun ve FC Market henüz kapatılmadı; kapanış ve B–E adımları bekliyor. Autorun dosyası istenen yerde bırakıldı. Önceki otomatik testler bu bölümde tekrar çalıştırılmadı; sonuçları yukarıdaki TEST 3'te.

## Kullanıcıyla tamamlanan testler — 29.10.2026, 13:10–13:35

| Test | Sonuç | Kanıt |
|---|---|---|
| B – kaydet ve çık, uygulama senkronu | GEÇTİ (düzeltmeyle) | 13:14 kaydı içe aktarıldı; uygulama 15 sn içinde kendiliğinden 18 Temmuz'a geçti ("Yeni veri geldi" şeridi). Hata: kayıt, kaydedilmeyen Codex oturumunun 18 Temmuz export'una (dal 1) bağlandı; dal 2 bayat fikstür gösterdi. Düzeltme: kayıt en son export edilen eşleşmeye bağlanır, blok olmayan snapshot son kayıt bloklarını kullanır. Sonra: 17 Tem Burgos 2–1, sıradaki 21 Tem Troyes, lig 0 maç. |
| C – fc_assets.lua | GEÇTİ | 13:23 manifest: 7015 yüz, 839 arma, 217 bayrak, 0 hata; uygulama aynı dakikada çevirdi (10.889 yüz). Gençlerbirliği kadrosunda yüzü olan 11/28 → 23/28. |
| D – AI yüzleri | GEÇTİ | Kullanıcı Pauleta ve Doku'yu oyunda gördü. |
| E – Kayıt dosyası ekle | GEÇTİ | Masaüstündeki CmMgrC20261029014018748 "eklendi"; deneme.txt "okunamadı" hatası, uygulama açık kaldı. |

Açık not: Gençlerbirliği'nde kaydedilmeyen oturumdan kalan "Dal 1 · 20 Temmuz" görünüyor (gerçek kayıt değil).
