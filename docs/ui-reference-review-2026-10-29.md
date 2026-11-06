# CMTracker görsel karşılaştırması — 29 Ekim 2026

## Kaynak ve kapsam

Referans: https://cmtracker.net/alima19?ci=6ae1b64113da0aec07ed6e23&sp=246420&pslg=jeremy-doku

Sayfa tarayıcıda açılarak Home, Squad, oyuncu detayı, Youth, Trophies ve Scout düzenleri, hesaplanan CSS ölçüleri ve hover kuralları incelendi. Üst site/hesap/profil/reklam alanı kapsam dışında. Karşılaştırma masaüstünde 1370×1000, dar ekranda 390×844 görünümle yapıldı.

- Kariyer alanı 1232 px; kart aralığı 24 px, 12 sütunlu yerleşim. Ana sayfa bölümleri, boş kartlar, takvim/maç gündemi ve takım reytingleri yeniden düzenlendi.
- Kariyer sekmeleri ve bölüm gezinmesi yapışkan. Ortak bilgi balonları fare, dokunma ve klavyeyle açılır; Escape ile kapanır.
- Kadro tek başlıklı, mevki gruplarına ayrılmış tablo. Satır hover, ilk 11 işareti, açılır sezon istatistikleri, perspektif saha ve saha oyuncusu önizlemesi eklendi.
- Oyuncu detayı kariyer içinde açılır. Sol kimlik/radar/roller, sağ bilgi ızgarası/oyun stilleri/iki sütunlu özellikler düzeni kullanılır. Geri/Escape sonrası önceki konum ve klavye odağı geri gelir.
- Altyapı gözlem ağı, kupa özeti ve Scout arama/filtre/tablo yerleşimi uyarlandı. Yerel ek analizler ve mevcut işlevler korunur; bazı ek bilgiler açılır bölümlerdedir.
- Ortak beş reyting rengi, rozet ölçüleri, Material Symbols ikonları ve yerel Tektur/Ubuntu Sans fontları kullanılır. Fontsource paketlerinin lisansı OFL-1.1; fontlar çevrimdışı da yüklenir. Oyun stilleri mevcut yerel ikon setidir.

## Gerçek veri ve sınırlar

API `C:\FCExport\fc_career.db` üzerinde salt-okunur çalıştırıldı; importer başlatılmadı. Deneme uygulama verisi `scratch/visual-parity/app.db` altında tutuldu. Oyun kayıtları, exporter ve oyun dosyaları bu çalışma için değiştirilmedi.

Referans Fenerbahçe tarihi 17.07.2030, yerel Fenerbahçe kaydı 24.07.2030. Sayısal içerik ve karta düşen etkinlik sayısı bu yüzden aynı değildir. Referanstaki toplam menajer karnesi çözümlenmediği için yerelde kaynaklı sezon karnesi etiketlenir. Kaynağı olmayan hedef, gelir, tarihçe ve diğer alanlar doldurulmaz. Sosyal/hesap/abonelik işlevleri yerel uygulamaya eklenmedi.

Bu çalışma düzen ve etkileşim karşılaştırmasıdır; piksel eşitliğini kanıtlayan bir görüntü farkı testi değildir. Türkçe metin uzunlukları, mevcut yerel işlevler ve oyun stili ikonları nedeniyle referansla farklılıklar vardır.

## Doğrulama

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| TypeScript ve üretim derlemesi | GEÇTİ | `npm --prefix frontend run build` |
| Backend regresyon | GEÇTİ | `dotnet test backend/FcMarket.Tests --nologo`: 140 başarılı |
| Frontend regresyon | GEÇTİ | `npm --prefix frontend run test:e2e`: 18 başarılı, gerçek veri testi varsayılan olarak atlanır |
| Gerçek veri görsel kontrolü | GEÇTİ | `FC_VISUAL_REAL=1` ile `visual-review.spec.ts`: 1 başarılı |
| Kariyer geçişi / yeniden açılış | GEÇTİ | Gerçek Gençlerbirliği → yeniden yükleme → Fenerbahçe seçimi; dal seçimi ayrıca fixture testiyle |
| Hover ve klavye | GEÇTİ | Bilgi balonu hover/focus/Escape; saha hover/focus/Enter; oyuncudan kadroya dönüş |
| Mobil taşma ve çalışma zamanı | GEÇTİ | 390×844 görünüm, yatay sayfa taşması ve JavaScript hatası yok |

Gerçek veri görselleri: `scratch/visual-parity/home.png`, `home-info-hover.png`, `home-pitch-hover.png`, `squad.png`, `player.png`, `youth.png`, `trophies.png`, `scout.png`, `mobile-home.png`. Animasyonlar ekran görüntüsü alınırken tamamlanır.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`. Bu incelemenin açık önizlemesi: http://127.0.0.1:5187/.

## Takvim penceresi — ikinci görsel düzeltme

Kullanıcı isteğiyle takvim sağ panel yerine ekranın ortasında açılan bir pencere oldu. Referanstaki ay ızgarası (7 sütun, 4 px aralık, en az 72 px gün hücresi), ay/liste seçimi, yarışma/saha/durum filtreleri, bugüne dönüş, ay gezinmesi, arma/skor/saat gösterimi ve seçili gün ayrıntısı uygulandı. Ok tuşlarıyla gün/filtre seçimi, Escape ve arka plana tıklayarak kapatma, odağın açan düğmeye dönmesi doğrulandı. Dar ekranda hücreler arma/skor gösterir; takımın tam adı gün ayrıntısındadır.

API'deki son 5 / gelecek 8 maç sınırı kaldırıldı. `/api/club` artık takımın kaynaktaki tüm fikstürünü tarih sırasıyla döndürür; ana sayfanın kısa form listesi son 5 ve gelecek 5 maçla sınırlıdır. Önceki sezondan kalan bayat export fikstürünü eleme kuralı korunur. Takvim yeni etkinlik tarihleri türetmez; milli ara, transfer penceresi ve gençlik turnuvası tarihleri kaynaktan henüz gelmediği için çizilmez.

Doğrulama: backend **142/142**, Playwright **19/19** (ayrıca isteğe bağlı gerçek veri testi **1/1**), TypeScript ve üretim derlemesi başarılı. Yeni backend testi hem export hem kayıt kaynağında 6 geçmiş + 14 gelecek maçın kesilmeden döndüğünü doğrular. Gerçek Fenerbahçe kaydında **38 maç**, Temmuz 2030 takvimi; Gençlerbirliği geçişi/yeniden açılış ve 390×844 taşma kontrolü geçti. Görseller: `scratch/visual-parity/season-calendar.png` ve `season-calendar-mobile.png`.

## Okunurluk ve hareket düzenlemesi

Kullanıcının birebir benzerlikten çok daha hoş bir görünüm istemesi üzerine görsel yön sadeleştirildi. Küçük metinler, sayılar, tablo ve oyuncu başlıklarında Ubuntu Sans kullanılır; Tektur kulüp kimliğinde sınırlı kalır. Büyük oyuncu adları normal harf düzenine alındı; kalınlıklar düşürüldü, bilgi etiketleri okunur boyuta getirildi. Kartların soğuk nötr yüzeyleri, sınırları, odak halkaları ve boşlukları tutarlılaştırıldı. Saha simgeleri ortak ikon bileşenine taşındı.

Hareket: 140 ms hover/renk, 180–260 ms sayfa ve pencere açılışı, sekme alt çizgisi, bilgi balonu ve seçili gün geçişleri. Hover yükselmesi yalnız hassas işaretçili cihazlarda uygulanır. `prefers-reduced-motion` açıkken hareket ve geçişler kapatılır; takvim testi bu davranışı da doğrular. Pencere merkez testi açılış hareketinin tamamlanmasını bekler.

Doğrulama: TypeScript/üretim derlemesi, 19 Playwright testi ve gerçek kariyer görsel testi başarılı. Gerçek veri testinde masaüstü/mobil görünüm, kariyer geçişi, yeniden açılış, taşma ve JavaScript hataları kontrol edildi. Bu düzenlemede backend ve veri okuma/yazma davranışı değiştirilmedi.

## İlk 11 hover katmanı düzeltmesi

Kart hover hareketi ayrı bir katman oluşturduğundan kaleci önizlemesi alt satırdaki kartın arkasında kalıyordu. Oyuncunun üzerine gelindiğinde veya klavye odağı oyuncudayken tüm saha kartının ızgara katmanı yükseltilir. Böylece önizleme komşu kartların üzerinde, yapışkan gezinme çubuklarının altında kalır. Regresyon testi önizlemenin alt satıra taşan kısmını gerçek çizim sırasıyla kontrol eder; fare ve klavye odağı kapsanır.

## Diğer sayfalarda ferahlık ve Scout liste girişi

Scout satır yüksekliği 46 px'ten 58 px'e çıkarıldı; sanal liste ölçümü ve başlık payı buna uyarlandı. Filtre alanları, başlıklar, hücre içi boşluklar ve hazır listeler büyütüldü. Takım listesi, transfer, izleme, karşılaştırma, akış ve rehber ortak başlık/yazı/boşluk ölçeğine alındı; geniş tablolar kendi alanında kayar, sayfanın genişliğini büyütmez. İzleme ve akış köklerindeki iç içe `main` öğeleri kaldırıldı.

Scout oyuncu listesi, kart ızgarası ve takım listesi ilk görünür sonuç grubunu soldan 16 px kayarak açar. Süre 280 ms, sıra aralığı 28 ms; en fazla 16 görünür öğe ve 280 ms gecikme kullanılır. Hareket satır yerleşimini değiştirmeden Web Animations API ile uygulanır. Sonuç anahtarı değişince yeniden oynar; sanal kaydırma, seçim veya ek sayfa yükleme sırasında tekrarlanmaz. Yeni filtre beklenirken eski sonuçlara giriş animasyonu uygulanmaz. Sistem hareket azaltma ayarında animasyon başlatılmaz; ayar açıkken devam eden animasyon iptal edilir.

Doğrulama: üretim derlemesi/TypeScript başarılı; **21 Playwright testi**, ayrıca gerçek veri testi **1/1** geçti. Yeni test sıra gecikmesini, sanal kaydırmada tekrar etmeme davranışını, filtrede gerçek yeni sonucun girişini ve azaltılmış hareketi doğrular. Gerçek kariyer incelemesi Scout/takımlar, serbest transfer adayları, izleme, akış ve Doku/Kroupi karşılaştırmasını masaüstünde; ilgili sayfaları 390×844'te sayfa taşması olmadan kontrol eder. Karşılaştırma seçimi yalnız yalıtılmış test tarayıcısının yerel depolamasındadır; gerçek veri incelemesi API yazma isteklerini engeller.

Ek görseller `scratch/visual-parity/` altında: `scout.png`, `scout-teams.png`, `transfer.png`, `shortlist.png`, `feed.png`, `compare.png` ve ilgili `mobile-*.png` dosyaları. Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
