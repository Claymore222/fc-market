# Faz 5 / M0: oyun içi doğrulama rehberi

Her script tek bir şeyi test eder ve sonucunu `C:\FCExport\m0\` altına yazar. Script'ler
`C:\FC27LE\lua\scripts\` klasöründe (`m0_*.lua`, ortak dosyalar `fcm_common.lua`, `fcm_weights.lua`).
Kaynakları repoda: `exporter/lua/mods/`. Plan: [career-mods.md](career-mods.md) §5.

**Bütün testler ayrı bir test kayıt slotunda yapılır, asıl kariyerinde değil.**

## 0. Hazırlık (bir kez)

1. Asıl kariyerini oyunda kaydet ve oyunu kapat. Sonra yedek al:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup -Label asil-kariyer
   ```
2. Oyunu `C:\FC27LE\Launcher.exe` ile aç, asıl kariyerini yükle ve **yeni bir slota kaydet** (kaydetme ekranında boş
   bir slot seç). Bundan sonra yalnızca bu test slotunu yükle.
3. Ana menüye çık, test slotunun da yedeğini al (oyun menüdeyken alınabilir):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\backup-saves.ps1 backup -Label test-baslangic
   ```
   Bir şey bozulursa: oyunu kapat, `... backup-saves.ps1 list`, sonra `... backup-saves.ps1 restore <yedek-adı>`.
4. Script'te ayar değiştirmek: dosyayı Not Defteri'nde aç, ilk satırlardaki değeri değiştir (ör.
   `local DRY_RUN = true` → `false`), kaydet ve Lua Engine'de tekrar çalıştır. LE dosyayı her çalıştırmada yeniden okur.
5. "Kaydet → çık → yükle" her yerde şu demek: oyunda kaydet (test slotu), **ana menüye çık**, test slotunu yeniden yükle.

## Önerilen sıra

| Sıra | Script | Ne test eder | Yazar mı | Süre |
|---|---|---|---|---|
| 1 | `m0_01_autorun` | Autorun hangi klasörden çalışıyor | Hayır | oyun açılışı |
| 2 | `m0_10_budget` | Transfer ve maaş bütçesinin bellekteki yeri | Hayır | 2 dk |
| 3 | `m0_09_loans` | Güncel kiralık listesi bellekten okunabiliyor mu | Hayır | 2 dk |
| 4 | `m0_06_tables_fresh` | `fixtures`, akademi vb. tablolar güncelleniyor mu | Hayır | 3 çalıştırma |
| 5 | `m0_07_growth`, `m0_11_event_args` | `growthprofile`, `PLAYER_GROWTH`, event argümanları | Hayır | 4 ile birlikte |
| 6 | `m0_05_teamsheet` | Maç kadrosu tablosu maç öncesi canlı mı | Hayır | bir maç |
| 7 | `m0_02_write_persist` | `players`'a yazılan değer kaydet/yükle sonrası kalıcı mı | **Evet** | 5 dk |
| 8 | `m0_04_devplan` | Gelişim planına yazma çalışıyor mu | **Evet** | 5 dk |
| 9 | `m0_03_ovr_recalc` | Oyun OVR'ı özelliklerden yeniden hesaplıyor mu | **Evet** | 1 ay ilerletme |
| 10 | `m0_08_form_opponent` | Form/moral rakip oyuncuda çalışıyor mu | **Evet** | 2 dk |
| 11 | `fcm_star_prospects` | Yıldız aday, tek takımda | **Evet** | kaydet/yükle + 1 ay |

Her adımdan sonra bana haber ver; dosyayı ben okurum.

## 1. Autorun (`m0_01_autorun`)
Probe iki aday klasöre kopyalandı: `C:\FC27LE\lua\autorun\` ve `C:\FC 27 Live Editor\lua\autorun\`.
1. Oyunu tamamen kapat, `C:\FC27LE\Launcher.exe` ile aç.
2. Test slotunu yükle, kariyer ana ekranı gelince bekle.
3. Haber ver. `01_autorun.txt` hangi klasörden yüklendiğini ve `LEInitDoneEvent` / kariyer yükleme sırasını gösterir.
   Test bitince probe'u iki klasörden de kaldırırım.

## 2. Bütçe (`m0_10_budget`)
1. Kariyerde finans ekranına gir (transfer ve maaş bütçesinin göründüğü ekran). İki değeri tam sayı olarak not et
   (ör. 123.890.000 € → `123890000`; maaş bütçesi haftalık mı yıllık mı, ekranda ne yazıyorsa).
2. `m0_10_budget.lua`'nın başında `EXPECTED_TRANSFER` ve `EXPECTED_WAGE` değerlerini yaz, kaydet.
3. Lua Engine'de çalıştır.

## 3. Kiralıklar (`m0_09_loans`)
1. Çalıştır.
2. Oyunda kendi kadronda kiralık gönderdiğin oyuncuların listesine bak (ya da transfer merkezindeki kiralık
   oyuncular). 2–3 isim yaz; dosyadaki bellek listesiyle karşılaştıracağız.

## 4–5. Tablolar, gelişim, event'ler (`m0_06`, `m0_07`, `m0_11`)
1. Üçünü de bir kez çalıştır (07 ve 11 bu oturum için sayaç kurar; oyunu kapatana kadar çalışır).
2. Bir hafta ilerlet (en az bir maç oyna ya da simüle et), `m0_06_tables_fresh`'i tekrar çalıştır.
3. Ay değişene kadar ilerlet, `m0_06_tables_fresh`'i bir kez daha çalıştır.
4. Haber ver: `06_tables_fresh.txt`, `07_growth.txt`, `11_event_args.txt`.

## 6. Maç kadrosu (`m0_05_teamsheet`)
1. Çalıştır (şu anki kadro sayfasını döker).
2. Sıradaki maça git. Maç öncesi ekranda ilk 11'den bir oyuncuyu yedekle değiştir; kimi kiminle değiştirdiğini not et.
3. Maça başla (oynayabilir ya da simüle edebilirsin). Haber ver; değişikliği yazarsın, dosyayla karşılaştırırız.

## 7. Yazımın kalıcılığı (`m0_02_write_persist`)
1. Çalıştır (DRY-RUN). Dosyada seçilen oyuncu (senin ligindeki başka bir takımdan genç) ve iki değişiklik yazar.
2. `DRY_RUN = false` yap, tekrar çalıştır.
3. Oyunda oyuncuyu bul (transfer arama ekranında adıyla), profilinde dosyada yazan özelliğe bak.
4. Kaydet → çık → yükle. Script'i tekrar çalıştır: dosyada **KALICI** ya da **KALICI DEĞİL** yazar.
5. İstersen geri al: `RESTORE = true`, çalıştır.

## 8. Gelişim planı (`m0_04_devplan`)
1. Çalıştır (DRY-RUN): kendi takımından gelişim planı olan bir oyuncu seçer. X = `shortpassing` yalnızca tabloya,
   Y = `longpassing` tablo + plana +3 yazılacak.
2. `DRY_RUN = false`, çalıştır.
3. Oyunda oyuncunun özellik ekranında iki değere bak, not et.
4. Kaydet → çık → yükle, tekrar çalıştır ve ekrana yine bak. Bana dört değeri yaz (X ve Y, yüklemeden önce ve sonra).

## 9. OVR yeniden hesabı (`m0_03_ovr_recalc`)
1. Çalıştır (DRY-RUN): iki genç seçer. A'nın pozisyonundaki en önemli 4 özellik +6 (OVR'a dokunmadan),
   B'nin yalnızca OVR'ı +3.
2. `DRY_RUN = false`, çalıştır.
3. Oyunda iki oyuncunun OVR'ına hemen bak, not et.
4. Ay değişene kadar ilerlet, tekrar çalıştır. Dosya A'nın ve B'nin OVR'ının nasıl değiştiğini yazar.
5. İstersen `RESTORE = true` ile geri al.

## 10. Rakipte form/moral (`m0_08_form_opponent`)
1. Çalıştır (DRY-RUN), sonra `DRY_RUN = false` ile tekrar.
2. Oyunda iki oyuncunun (rakip ve kendi oyuncun) form ve moral göstergesine bak; değişeni bana yaz.

## 11. Yıldız aday, tek takım (`fcm_star_prospects`)
Bu adıma 7–9 geçtikten sonra geç.
1. Hangi takımda denemek istediğini bana yaz; id'sini ben veririm.
2. Script'in başında `TEAM_IDS = { <id> }` yap. Çalıştır (DRY-RUN), rapor `star_prospects.txt`'de: seçilen genç,
   eski/yeni OVR ve POT, değişen özellikler.
3. `DRY_RUN = false`, çalıştır. Oyunda oyuncunun profiline bak (OVR, POT, özellikler).
4. Kaydet → çık → yükle. `MODE = "verify"` yap, çalıştır.
5. Bir ay ilerlet, yine `MODE = "verify"` ile çalıştır.
6. Geri almak için: `MODE = "restore"`, `DRY_RUN = false`.

Tek takım denemesi geçerse (değerler kalıcı, OVR beklenen yerde) `ALL_TEAMS = true` ile önce DRY-RUN raporunu
birlikte inceleriz.
