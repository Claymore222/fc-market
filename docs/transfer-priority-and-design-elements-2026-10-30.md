# Takım öncelik raporu ve tasarım bileşenleri

30.10.2026. Kullanıcı genel düzenin daha okunur/ferah olmasını, birkaç farklı bileşen örneğini ve takım için
gerekçeli transfer sırasını istedi.

## Uygulanan

TRANSFER sayfasında adayların üstüne **Takımının kısa raporu / Transferde nereden başlamalı?** eklendi.
Mevcut ihtiyaç puanı kullanılmasına rağmen önceki ekranda net metin ve numaralı sıra yoktu.

- Seçili dizilişin ihtiyaçları önce acil, bu dönem, gelecek sezon; aynı grupta ihtiyaç puanıyla sıralanır.
  Alternatif diziliş açıkları bu rapora eklenmez. Gelecek sezon ayrı cümlede, sözleşme yenileme seçeneğiyle görünür.
- İlk üç gerekçeli satır açık; kalanlar açılabilir. Satıra tıklanınca doğru mevkinin adayları ve varsayılan
  amaç açılır. Veri yenilenirken eski satırlarla işlem yapılamaz.
- Model ihtiyaç görmüyorsa satın alma zorlamaz. Eksik veri varsa koşullu rapor verir. Kaynak/revision/dal
  koruması mevcut board akışında kalır. Yeni oyun alanı, dış servis veya AI kullanılmadı.

Gerçek kopyalardaki sonuç:

- **Fenerbahçe 28.07.2030:** bu dönem Stoper (70, bağımsız rotasyon yok) → Kaleci (55, rotasyon69 / taban74).
  Gelecek sezon 10 numara → Ön libero → Sol orta saha. Bu bir satın alma paketi değildir.
- **Gençlerbirliği 24.08.2026:** bu dönem için yapısal takviye işareti yok. Gelecek sezon Stoper → Ön libero →
  Merkez orta saha; sözleşme/gelecek kadro kapsamına bağlı, kesin ayrılış değildir.

## Tasarım örnekleri

Sohbette üç etkileşimli örnek hazırlandı. Renk yanında rapor, mevki seçimi ve oyuncu kartının yerleşimi değişir:

- **Sakin Koyu:** geniş satırlı ihtiyaç listesi, daha sakin koyu yüzey, aday ve karar bağlamı yan yana.
- **Mavi Cam:** açık mavi/beyaz, yatay üç adımlı ihtiyaç seçimi, geniş aday kartı ve bölmeli amaç seçimi.
- **Krem Editoryal:** krem/yeşil, yazı ağırlıklı değerlendirme, kenarda numaralı liste ve çizgili aday bölümü.

Örneklerin oyuncuları/sayıları açıkça **temsili** etiketlidir; gerçek takım analizi diye sunulmaz.
Mevki seçimi, amaç, izleme, kıyaslama ve rapor açma yerel örnek etkileşimleridir. Ana uygulamanın genel tasarımına
bir tema uygulanmadı. Mevcut beş tema sayfası korunur.

## Doğrulama

Kanıtlar `scratch/design-elements/` altında:

| Kontrol | Sonuç |
|---|---|
| Backend | **GEÇTİ — 285/285**, `backend-tests.log`. Backend davranışı bu teslimde değiştirilmedi. |
| Playwright tam paket | **GEÇTİ — 74 geçti, 10 ortam koşullu atlandı**, `ui-full.log`. Yeni iki vaka: öncelik sırası/puan/gerekçe/aday geçişi, ihtiyaç yok/veri eksik ayrımı. Sonradan eklenen gerçek veri testi ayrıca çalıştırıldı. |
| Gerçek kariyer UI | **GEÇTİ — 1/1**, `real-ui.log`, `real-check.json`: iki kariyer, gerçek kaynak ve gerekçeler, doğru mevki açılışı, 390px taşmasız düzen; JS hatası yok. |
| Üretim derlemesi | **GEÇTİ**, `build.log`; mevcut büyük Vite bundle uyarısı sürüyor. |
| Üç tasarım örneği | **GEÇTİ**, `preview-check.json`: 760/390/320px, mevki/amaç/izleme/kıyas ve açılır rapor; taşma/JS hatası yok. Masaüstü üç tasarım, gerçek rapor masaüstü ve mobil görselleri incelendi. |
| Kaynak koruma | **GEÇTİ**, `source-hash-after.json`: önceki SHA256 ile aynı `DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`. |

API yalnız mevcut `scratch/analysis-phase-c/fc_career.db` kopyasını okudu; app.db/export/log yolları bu işin
scratch klasörüne ayrıldı. `127.0.0.1:5191` test API'si sonunda kapatıldı. Orijinal oyun kayıtları,
`C:\FCExport\fc_career.db`, exporter ve otomasyon değiştirilmedi. Commit yok.

Çalıştırma:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```
