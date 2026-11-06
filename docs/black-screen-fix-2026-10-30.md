# Aralıklı siyah ekran — neden ve düzeltme

30.10.2026. Kullanıcı boş alana tıkladıktan sonra ekranın siyah kaldığını, daha önce de yaşandığını bildirdi.
Mevcut açık pencere bilgisayar kontrolüyle incelendi; oyun açılmadı.

## Bulgular

- FC Market penceresi açık, içerik tamamen siyah; erişilebilirlik ağacında web içeriği yok.
- Yerel `/api/health` isteği **HTTP 200**. Backend ve kayıt izleyicisi çalışıyor; FC Market'e ait WebView2 işlemi yok.
- `WebView2/EBWebView/Crashpad/reports` içinde iki gerçek dump var: 30.10 yerel saatle **01:04:16** ve **01:27:45**.
- İkisinde de exception **0xC0000005**, adres **0x1801490af**, adresin ait olduğu modül **RTSSHooks64.dll**.
  Dump'lar önce scratch'e kopyalandı; yalnız exception kaydı ve modül adres aralığı incelendi, dışarı yüklenmedi.
- RTSS, RTSSHooksLoader64 ve MSI Afterburner çalışıyor. Kanıt görüntüleme/overlay katmanındaki çakışmayı
  gösteriyor; kullanıcının son tıklamasının hangi iç çağrıyı tetiklediği sembollü stack analiziyle belirlenmedi.
- Önceki masaüstü host'u `ProcessFailed` / `BrowserProcessExited` dinlemiyordu. Runtime kapandığında WebView
  kontrolü yeniden yaratılmadığı için pencere siyah kalıyordu. Ctrl+R de bu ölü kontrole ulaşmıyor.

Bu bulgular veri aktarımındaki UTF-8 uyarısından ayrıdır. Kariyer verisi sunucuda kullanılabiliyor.

## Uygulama

`CareerBrowser` WebView kontrolünün yaşam döngüsünü ayrı yönetir. RTSS işlemi başlangıçta görülürse yalnız
bu uygulamanın WebView ortamına `--disable-gpu` verilir; diğer uygulamalar ve RivaTuner/oyun ayarları değişmez.
RTSS yoksa donanım hızlandırması varsayılandır. Geliştirici tanısı için `FC_MARKET_RENDERING=software|hardware`
tercihi kullanılabilir. Yazılımsal mod GPU yükünü CPU'ya taşıyabilir; tüm kullanıcılara zorunlu yapılmadı.

Microsoft bu bayrağın GPU hızlandırmasını kapattığını belirtir ve genel kullanımda hızlandırmayı korumayı önerir:
[bayrak tanımı](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags),
[performans notları](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).
Burada kullanım, iki gerçek dump ile tespit edilen uyumluluk sorunu içindir.

- Ana browser kapanınca kaynakların serbest bırakıldığını bildiren environment olayı beklenir ve kontrol yeniden
  kurulur. Ana renderer kapanınca da yeni kontrol oluşturulur. [Microsoft süreç kurtarma açıklaması](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-related-events).
- GPU/utility olayları loglanır; WebView2'nin kendi toparlanmasına gereksiz yeniden başlatma döngüsü eklenmez.
- İki dakika içinde en fazla iki otomatik deneme. Üçüncü hatada metin ve **Ekranı yeniden aç** düğmesi; elle
  yeniden deneme mümkündür. Aynı hatanın çifte olayları eşzamanlı iki kontrol oluşturamaz.
- Son yerel adres ve aynı WebView profil klasörü korunur. Kariyer seçimi/localStorage silinmez. Yeniden yükleme
  masaüstü kariyer seçicisini gösterebilir; seçili kariyer korunur. Bellekteki kaydedilmemiş form seçimleri yenilenebilir.
- Yeniden yükleme importer/backend başlatmaz ve yeniden kayıt içe aktarmaz. HTTP hata sayfasında da tekrar deneme var.
- Ana doküman gezintisi ve host mesajları yalnız aynı yerel HTTP origin'inden kabul edilir; kurtarma dış siteye gidemez.
- React render hatası için `AppErrorBoundary`: siyah boş kök yerine açıklama, genel bakışa dönüş ve yeniden yükleme.
  Global JS/promise hataları ve component stack, masaüstünde `logs/app/ui` dosyasına gider; ağ üzerinden gönderilmez.
  Log köprüsünün bozulması hata işleyicisini tekrar çökertmez.

Native tanı `logs/app/webview` altında runtime sürümü, rendering modu, işlem türü/çıkış nedeni/kodu, modül,
yerel adres ve kurtarma sonucunu tutar. Kullanıcı profili veya crash dump klasörü otomatik temizlenmez.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| Backend/policy | **GEÇTİ** — 227/227; yeni 13 vaka: olay çakışması, sınırlı retry, elle retry, RTSS/renderer seçimi ve origin kısıtı. |
| Playwright | **GEÇTİ** — 56 geçti, 7 ortam koşullu test atlandı. Yeni iki test: render çökmesi sonrası görünür/odaklı fallback ve reload, seçim korunması, JS/promise/bozuk log köprüsü. |
| Python | **GEÇTİ** — saveimport 53/53, assets 3/3. |
| Derleme | **GEÇTİ** — TypeScript/Vite ve WinForms. Eski paket boyutu ve ClubTests nullable uyarıları sürer. |
| RTSS açık native UI | **GEÇTİ** — gerçek ürünün yeni `CareerBrowser` sınıfını kullanan ayrı WinForms harness, özel scratch WebView profiliyle mevcut yerel sunucuyu yalnız okudu. `rendering=software`; Gençlerbirliği seçimi çalıştı. |
| Browser process fault | **GEÇTİ** — yalnız harness profilindeki browser işlemi kontrollü sonlandırıldı. `BrowserProcessExited` → `RECOVER` → `NAVIGATION OK`; olaydan başarılı gezintiye **~382 ms**. Kariyer seçimi korundu. |
| Renderer fault | **GEÇTİ** — yalnız harness renderer'ı sonlandırıldı; yeniden kurma ve başarılı gezinti **~118 ms**. |
| Tekrarlayan fault / elle retry | **GEÇTİ** — üçüncü hata otomatik döngü üretmedi. Native açıklama ve kurtarma düğmesi ekranda görüldü; bilgisayar kontrolüyle tıklanınca tekrar açıldı. |
| Koruma | RTSS/oyun ayarı değiştirilmedi; başka uygulamanın WebView işlemi kapatılmadı. Oyun kaydına veya kariyer DB'sine doğrudan yazılmadı. Testte yalnız kendi harness işlemleri sonlandırıldı. Commit yok. |

Kanıt klasörü: `scratch/black-screen-20261030/`. `dump-summary.json`, iki kopya dump (özel, paylaşılmadı),
`native-test.log`, `browser-fault-target.json`, `renderer-fault-target.json`, `policy-tests.log`, `backend-full.log`,
`ui-unit.log`, `ui-full.log`, `saveimport-tests.log`, `assets-tests.log`, `build.log`, `harness-build.log`.
Ekranlar bilgisayar kontrolüyle konuşmada görüntülendi. Yapay hatalar gerçek kullanıcı dump'larından ayrı loglandı.

Uyumlu modun bu makinede çalıştığı ve üç hata senaryosundan döndüğü doğrulandı; tüm sistemlerde bütün WebView
çöküşlerinin ortadan kalktığı iddiası yoktur. Kalıcı alttaki overlay sorunu sürerse yeni modül/neden logları tanıyı
kolaylaştırır. Açık eski uygulama süreci kod değişikliğini alamaz; pencereyi kapatıp yeniden başlatmak gerekir:

`powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`
