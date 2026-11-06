# Windows ve referans arayüz çalışması — 28 Ekim 2026

Hedef: incelenen 27 CMTracker ekranının yerleşim, tipografi,
renk, tablo ve saha görünümünü yerel FC Market uygulamasına taşımak.

## Gerçek veri — 28 Ekim ikinci güncelleme

HOME, SQUAD, YOUTH, TROPHIES ve oyuncu detayı artık seçili kariyerin gerçek verisini gösterir; Colchester demo
verisi, demo oyuncu modalı ve örnek yüz/arma görselleri kaldırıldı. Ayrıntı: PRODUCT-ROADMAP.md "İkinci paket".

## Scout entegrasyonu — 28 Ekim güncellemesi

Scout artık API oyuncularını gösterir; /market ile aynı motoru kullanır. Kariyer seçimi,
gerçek radar/geçmiş, modal detay, shortlist ve hata durumları eklendi. Diğer yeni
ekranlar henüz demo. Masaüstü açılışı /scout'a taşındı. API çalışma dizini düzeltilerek
hesaplama ayarlarının yüklenmesi sağlandı. 5 Playwright testi ve örnek export ile
yerel API liste/detay kontrolü geçti. Ayrıntılar PRODUCT-ROADMAP.md'deki paket kaydında.

## Önceki masaüstü kabuğu çalışması

Bu turda:
- WinForms + WebView2 masaüstü kabuğu ve `start-desktop.ps1` eklendi.
- Başlangıçta import, ardından watch ve API başlatılıyor. Kapanışta sahip olunan süreçler durduruluyor.
- Tek uygulama örneği, dolu port denetimi, hata ekranı ve yerel günlük eklendi.
- Tektur ve Ubuntu Sans yerel pakete alındı; Google Fonts bağlantısı kaldırıldı.
- Genel buton CSS'inin Tailwind renk/font sınıflarını ezmesi düzeltildi.
- Ortak içerik 1280 px dış genişlik / 1232 px içerik, ortalı üst bar, kapaklı profil,
  koyu kartlar ve mor alt çizgili sekmeler referansa yaklaştırıldı.
- Sabit “Live connected / live memory active” ifadeleri kaldırıldı; örnek ekranlar işaretlendi.
- Gerçek oyuncu piyasası `/market` tekrar erişilebilir; yeni scout tasarımı `/scout` altında.

Doğrulama: frontend üretim derlemesi; masaüstü derlemesi (0 hata, 0 uyarı);
95 backend testi; Windows penceresinde HOME ve SQUAD görsel kontrolü;
pencere kapatıldıktan sonra 5127 dinleyicisi ve importer sürecinin kalmadığı kontrol edildi.
Vite büyük JS parçası uyarısı devam ediyor.

Kalan işler:
- 27 referansın her birini aynı viewport ile karşılaştırarak ekran bazında görsel eşleştirme.
- HOME alt sekmelerinin içerikleri, eksik TROPHIES / CHALLENGES / COMMENTS rotaları.
- Yeni ekranlardaki sabit oyuncu, kulüp, bütçe ve takvim verilerinin API'ye bağlanması.
- Yeni scout filtrelerinin ve oyuncu detaylarının gerçek kariyer verileriyle tamamlanması.
- 1024 px ve dar pencere düzenlerinin tüm sayfalarda doğrulanması.
- İmzalı/kurulabilir Windows dağıtımı; bağımlılıkların paketlenmesi.
- Live Editor gelişmiş eylemleri ayrı aşama; bu turda exporter veya oyun yazımları değiştirilmedi.

Demo kartındaki Colchester tarihi referans tarihidir; üst bardaki tarih içe aktarılmış
kariyerin tarihidir. “Snapshot hazır” oyunun açık olduğunu veya Live Editor bağlantısını doğrulamaz.
