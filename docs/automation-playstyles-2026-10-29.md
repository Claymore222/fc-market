# Otomasyon, PlayStyle görselleri ve CF — 29 Ekim 2026

## Kullanım

Masaüstünde üst çubuktaki ayar simgesi veya kariyer seçicisindeki **Otomasyon ayarları** düğmesi:

- Live Editor ana klasörünü seç (içinde `lua` olmalı). Seçim `%LOCALAPPDATA%\FcMarket\settings.json`
  içindeki `liveEditorDir` alanında kalır; mevcut export/Python ayarları korunur.
- **Günlük kariyer senkronu** açık: paketteki `fc_export.lua`, seçilen kurulumun `lua\autorun` klasörüne
  kopyalanır. Kapalı: aynı dosya önce `%LOCALAPPDATA%\FcMarket\automation\backups` içine kopyalanır,
  sonra autorun'dan kaldırılır. Dosya farklı sürüm/özel içerikse işlem yapılmaz, neden gösterilir.
- Autorun değişikliği **sonraki oyun açılışında** geçerlidir. Çalışan oyunun kayıtlı olay dinleyicilerini
  bu panel durdurmaz. Mevcut kayıt okuyucusu ve uygulama senkronu çalışmaya devam eder.
- **Görsel script’i** anahtarı `fc_assets.lua` dosyasını `lua\scripts` içine kurar/kaldırır.
  Görseller kariyer açıkken **F8 → Features → Lua Engine → fc_assets.lua** ile çıkarılır;
  başlangıçta henüz kariyer verisi olmadığından bu script otomatik başlangıca eklenmez.
- Önceden autorun'a konmuş `fc_assets.lua` ayrıca gösterilir. Paketle aynıysa yedeklenerek kaldırılabilir;
  farklı içerikteyse korunur. Bu bilgisayardaki eski autorun görsel script'i paketle farklıdır.
- İlk açılış yalnız durum okur. Bilinen iki kurulum aranır; birden çok kurulum varsa kullanılan launcher'ın
  klasörünü seçmek gerektiği yazılır. Kaydedilen klasör kaybolursa başka kuruluma sessizce geçilmez.
- Tarayıcı paneli masaüstü gerektirdiğini açıklar; dosya değiştiren HTTP API eklenmedi.

Yönetim yalnız paketle gelen iki salt-okunur script ile sınırlı. Diğer Lua dosyaları korunur. Kurulum tam dosyayı
atomik olarak yayınlar; bozuk yarım Lua dosyası bırakmaz. Bağlantı/junction hedeflerine kurulum reddedilir.
Testlerde gerçek autorun dosyaları değiştirilmedi; aç/kapat/yedekleme geçici klasörlerde doğrulandı.
`exporter/` kaynakları, oyun kayıtları ve `C:\FCExport\fc_career.db` değiştirilmedi.

## PlayStyle kaynakları

36 stilin normal ve “+” sürümü: **72 adet orijinal 256×256 PNG**, toplam 1.405.593 bayt.
[Resmî EA ratings sayfasının](https://www.ea.com/games/ea-sports-fc/ratings/abilities-ratings/finesse-shot/play-style/trait1_1)
stil kataloğundaki `imageUrl` adresleri kullanıldı. Her dosyanın kaynak URL'si ve SHA-256 değeri
`config/playstyle-assets.json` içinde. Görseller repoda ve pakette yok (EA görseli, açık kaynak lisansı yok). API bir rozeti ilk
istendiğinde bu listedeki sabit EA adresinden indirir, SHA-256'yı doğrular ve kullanıcının görsel klasöründe
saklar (`/api/playstyles/{slug}`); sonrasında ağ isteği yapılmaz.

Özel Lucide rozetleri kaldırıldı. Stil adı/ikonu bilinmiyorsa adı ve nötr soru işareti korunur;
başka bir stilin ikonu uydurulmaz. Gerçek Doku verisindeki `Oyun stili #43` bu şekilde gösteriliyor.
Önerilen stiller tahmin olarak kalır; ikon değişikliği oyuncu verisini veya öneri kurallarını değiştirmez.

## CF

CF saha noktaları, başlık çevirisi, formasyon sayımı, pozisyon puanlama formülü ve eski slot etiketi kaldırıldı.
RF/LF için CF'ye yönlendiren puanlama takma adı kaldırıldı; eski bilinmeyen kodlar başka bir gerçek mevkiye
uydurularak dönüştürülmüyor. Ham kayıtlar aynı. API artık **14 mevki puanı** döndürüyor.

## Doğrulama

| Kontrol | Sonuç / kanıt |
|---|---|
| Masaüstü derleme | GEÇTİ — `dotnet build desktop/FcMarket.Desktop`, 0 uyarı / 0 hata |
| Backend | GEÇTİ — 167 test; geçici LE klasöründe aç/kapat, yedek, yeniden açma, özel dosya koruma, hatalı klasör/paket ve izin verilen script listesi dahil |
| Save import | GEÇTİ — 29 test |
| Assets | GEÇTİ — 2 test |
| Frontend build | GEÇTİ — TypeScript + Vite; mevcut büyük paket boyutu uyarısı devam ediyor |
| Playwright fixture | GEÇTİ — 30 test; masaüstü köprüsü mock ile aç/kapat, hata/yeniden dene, klasör seçimi iptali, mobil/fokus, 72 ikonun gerçek PNG olarak yüklenmesi, CF olmaması |
| Gerçek kariyer | GEÇTİ — mevcut salt-okunur API / kopya DB: Fenerbahçe, Gençlerbirliği, kariyer/dal geçişi, reload; yeni ayar paneli ve Doku ikonları |
| Son birleşik Playwright koşusu | GEÇTİ — `FC_VISUAL_REAL=1 npm --prefix frontend run test:e2e`: **32/32**, 16,6 sn; gerçek veri kontrolleri dahil |
| Gerçek Doku API | GEÇTİ — `saveUid=84af764ba0d247f880ccc658a7e0c7a`, `/api/players/246420`: 14 mevki, CF yok; 5 bilinen normal + 1 Rapid+ ikonu yüklendi |
| Görsel kanıt | `scratch/visual-parity/automation-settings.png`, `automation-settings-mobile.png`, `doku-official-playstyles.png` |

Gerçek klasöre yazan native düğmeler oyunda denenmedi; dosya işlemleri servis testleriyle, arayüz köprüsü
Playwright mock'u ile ayrı doğrulandı. Oyun açılışı/LE olayları bu değişiklik kapsamında yeniden denenmedi.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
