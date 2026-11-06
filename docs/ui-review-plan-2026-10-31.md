# Arayüz incelemesi ve plan

31.10.2026. Gerçek veri kopyasıyla 19 ekran gezildi (masaüstü ve telefon, Fenerbahçe). Ölçümler otomatik tarama, yorumlar kullanıcı gözüyle.

## Düzeltildi: köşeler

Tek neden yoktu:

- Takım gücü kartı 45° kesik köşe stiliyle (`clip-path`) kenarlığını kaybediyordu. Stil tamamen kaldırıldı.
- Kadro yan kartlarında `overflow-hidden` bir kuralla iptal ediliyordu; koyu alt zemin köşeden taşıyordu.
- Home'da yuvarlak liste kutuları iç zemini kırpmıyordu.
- Açılış ekranında seçili kariyerin çerçevesi kartın içinde köşeli çiziliyordu; çerçeve karta taşındı.
- "Kadro analizi" şeridi tabloya yapışıktı, araya boşluk kondu.

Tarama: 19 ekranda köşe taşması 0.

## Asıl sorunlar

| # | Sorun | Ölçüm |
|---|---|---|
| 1 | Her sayfada içerik ekranın yarısından sonra başlıyor | Üst menü + iki şerit + kariyer kartı ≈ 380 px |
| 2 | Home bir dashboard değil, uzun bir rapor | 7.452 px, telefonda 13.916 px; çok kart boş |
| 3 | Yazılar çok küçük | Home'da 207 metin 11 px altında, 44'ü 8 px |
| 4 | İki menü iç içe | Scout/İzleme iki yerde, iki "Yenile", anlamı belirsiz Q ve E düğmeleri |
| 5 | Aynı iş iki yerde | Transfer ve Kadro analizi aynı motoru ayrı ekranda gösteriyor; analiz formu 2.587 px |
| 6 | Oyuncu detayı çok uzun | 3.675 px; en önemli bilgiler ve kişisel karar alanı ayrı değil |
| 7 | Küçük tıklama alanları | Transfer'de 41, kadroda 18 öğe 24 px altında |
| 8 | Boş ekranlar yönlendirmiyor | Karşılaştır ve Akış tek cümleyle duruyor |

## Veri hataları

- Oyuncu istatistiklerinde yarışma adı ham kod: `C1991`.
- Bilinmeyen oyun stili: `Oyun stili #44`.
- Akademi oyuncusu Kingsley Orji sözleşmesi `Haz 2000`.
- Akış "iki snapshot gerekiyor" diyor; bu dalda birden çok kayıt var, doğrulanmalı.
- Kupa Müzesi 4 sezon arşivine rağmen "izlenen sezon 1" gösteriyor.
- Kaleci radarında saha oyuncusu ekseni var.

## Animasyon durumu

Var: sayfa girişi, tablo satır girişi, kart hover, diyalog, takvim, hover balonları. `prefers-reduced-motion` destekli.

Eksik:

- Açılış ekranı: hiç giriş animasyonu yok.
- Tüm açılır bölümler (`details`): Kadro içi, Sözleşmeler, Neden önerildi, Bütçe üstü, kadro istatistik satırı anında açılıyor.
- Görünüm değişimleri: Liste/Kartlar, Scout Liste/Izgara, Transfer mevki ve sekme değişimi.
- Çubuklar: Takım gücü, moral, özellik çubukları dolmuyor.
- Yükleme: çoğu yerde düz metin; iskelet yalnız oyuncu tablosunda.
- Geri bildirim: izleme listesine ekleme, kıyaslamaya ekleme ve kaydetme için bildirim yok.
- Tema değişimi anında sıçrıyor.

## Geri dönüş

Yenileme öncesi hâl `ui-yenileme-oncesi` etiketinde, `main` dalı da aynı noktada duruyor. Yeni işler `ui-yenileme` dalında.
Eski arayüze dönmek için:

```bash
git switch main
```

Yenilemeyi kalıcı almak `ui-yenileme` dalını `main`'e birleştirmektir. Bu işler veritabanı şemasını değiştirmez.

## Plan

1. **Çerçeve — TAMAMLANDI:** Tek yapışkan üst bar (kulüp, sekmeler, düğmeler). Kariyer özeti yalnız Home'da. Uyarılar tek satır; eski uyarı kapatılabilir. Yukarıdaki ek menü linkleri kalktı: Scout ve İzleme sekmede, Wonderkids Scout'taki hazır listede, LE rehberi üst bardaki düğmede. İçerik 380 yerine 92 pikselde başlıyor.
2. **Home — TAMAMLANDI:** Üstte dört kartlı bugünün özeti (sıradaki maç, transfer önceliği, sözleşme, kadro durumu). Aynı anda tek bölüm açılır, seçim adreste kalır (`?bolum=`). Kaynağı olmayan kartlar gizli, sayısı yazılı, "Göster" ile açılır. Kariyer kimliği, değişenler ve kayıt durumu Menajer ve Yönetim bölümüne taşındı.
3. **Okunabilirlik — TAMAMLANDI:** En küçük yazı 11 px (önce Home'da 207 metin altındaydı). Tıklama alanı tabanı 24 px, metin düğmeleri 28 px. Altı temada yazı kontrastı ana yüzeylerde en az 4,5:1; açık temalarda vurgu rengi koyulaştırıldı. Kartta alt satır `30 yaş · değer · maaş`, puanlar yüzün önünde. Tek tipografi ölçeği yapılmadı, yalnız alt sınır kondu.
4. **Hareket sistemi — TAMAMLANDI:** Ortak süre ve eğriler. Açılır bölümler yumuşak açılıyor; Home bölümü, Liste/Kartlar ve Transfer listesi geçişli; çubuklar soldan doluyor; açılış ve özet kartları sırayla geliyor; yüklemede iskelet var; izleme, kıyaslama ve tercih kaydı için kısa bildirim çıkıyor; tema yumuşak değişiyor. Azaltılmış hareket ayarında hepsi kapanır.
5. **Sadeleştirme — TAMAMLANDI:** Kadro analizi "Takım planı" olarak Transfer'in altına taşındı (`/transfer/plan`; eski adres yönlendirir). İkinci öneri paneli kalktı: ihtiyaç ayrıntısı `/transfer?mevki=CB` ile o mevkiyi açar, Home'daki öncelik kartı da öyle. Mükerrer bütçe penceresi kalktı; bütçe, diziliş ve rol yalnız planda, oyuncu tarzı yalnız Transfer'deki kartlarda düzenlenir. Oyuncu detayı beş sekme oldu (Özet, Özellikler, Mevkiler, Gelişim, Değer); kart ve radar sabit. Karşılaştır, İzleme ve Akış boşken gidilecek yeri gösterir. Arayüzün kullanmadığı `/api/analysis/{id}/candidates` ucu arka uçta duruyor.
6. **Veri hataları — TAMAMLANDI:** Altı madde de gerçek kayıtta incelendi.
   - `C1991` Dünya Kupası çıktı (kök yarışma, 26 kişilik milli takımlar, son 32). Stat satırlarındaki diğer kodlar da yapıdan etiketlendi; oyunun ad dosyaları okunamadığı için adlar doğrulama bekliyor. Listede olmayan kod "Diğer yarışma" olur, ham kod görünmez.
   - `Oyun stili #44`: eşlenen 36 bit resmi listenin tamamı. 38, 40, 41, 43, 44 bu listede yok; filtrede ve oyuncu detayında gösterilmiyor. CMTracker'la tek tek karşılaştırılmadı.
   - `Haz 2000`: 2000 akademi yer tutucusu, sözleşme yok sayılıyor (`contractPlaceholderYear`).
   - Akış: sayım doğruydu. Fenerbahçe'nin son dalında gerçekten tek kayıt var ve dalın atası tanımlı değil. Yalnız mesaj düzeltildi.
   - İzlenen sezon: kayıttaki sezon arşivi daha uzunsa o sayılıyor.
   - Kaleci radarı: beş kaleci özelliği. Karşılaştır aynı sayfadaki ortak eksenleri koruyor.

Önerilen sıra 1 → 3 → 2 → 4 → 5; veri hataları her fazda küçük işler olarak alınabilir.
