# Scout genişliği, kaleci özellikleri ve kupa toplamları

30.10.2026 — **TAMAMLANDI.**

- Trophies → Kulübün oyundaki toplam kupaları artık normal bir bölüm; açık gelir ve kapatma kontrolü yoktur.
- Scout içeriği masaüstünde 1232px sınırını kullanmaz: pencere genişliği eksi 48px. Kulüp başlığı ve sekmeler
  diğer sayfalardaki gibi ortalanmış en çok 1232px genişliğinde kalır. Diğer sayfaların genişliği değişmez.
  Tablo, araç çubuğu ve filtre panelinin köşeleri/scroll çerçeveleri sınırları içinde kalır; sütun menüsü çalışır.
- Yalnız `pos=GK` filtresinde oyuncu/OVR/POT sonrasında **Atlama, Tutma, Degaj, Refleks, GK poz.** otomatik
  gösterilir. Daha önce seçilmiş diğer sütunlar devamında kalır. GK sütunları kişisel görünürlük tercihine
  yazılmaz; karma/saha oyuncusu filtresine dönünce eski görünüm geri gelir. Başlıklardan sıralanabilir.
  Filtre değişiminde yatay kaydırma sıfırlanır; önemli değerler eski kaydırma konumunun dışında kalmaz.
- Kaleci detayında üstte beş özelliğin kısa özeti bulunur; ayrıntılı özelliklerde Kaleci kategorisi önce gelir.

## Veri kaynağı

API liste DTO'su `gkDiving/gkHandling/gkKicking/gkReflexes/gkPositioning` alanlarını taşır. Mevcut
`field-map.analysisAttributes` eşlemeleri kullanılır; yeni ham alan çözülmedi ve ham kolon adları koda eklenmedi.
Özellikler seçili snapshot'tan mevcut toplu okuma içinde gelir. Değerler doğrudan kayıttır, PAC–PHY gibi
ağırlıklı kart tahmini değildir. Eksik veya0–99 dışında değer null, gerçek0 korunur. Oyuncu başına ek sorgu yok.

## Kanıt

`scratch/scout-layout/`:

- **GEÇTİ — backend286/286**, `backend-tests.log`. Yeni vaka: seçili gün, geçersiz/eksik/gerçek0 GK değeri.
- **GEÇTİ — Playwright76 geçti,11 ortam koşullu atlandı**, `ui-full.log`. Yeni iki vaka: kapanmayan kupa
  toplamı/reload, geniş ekran/GK sırası/doğrudan değer/sıralama/kişisel tercih ve karma filtreye geri dönüş.
- **GEÇTİ — üretim frontend/API derlemesi**, `build.log`, `api-build.log`; mevcut büyük Vite bundle uyarısı sürer.
- **GEÇTİ — gerçek Fenerbahçe kopyası**, `real-check.json`, `real-ui.log`:2560px'de2496px,1440px'de1376px
  çalışma alanı; her iki ölçüde beş GK özelliği yatay kaydırmadan görünür. Diogo Costa234577 için liste ve detay:
  Atlama93, Tutma89, Degaj96, Refleks89, Pozisyon87. Üst GK özeti görünür; kupa bölümü kapanmaz.390px'de
  dış taşma yok; mobilde geniş tablo kendi içinde kayar. JS hatası yok. Masaüstü Scout ve kaleci detay görselleri incelendi.

Yalnız önceki kariyer DB kopyası ve ayrı scratch app.db/log/export kullanıldı. Test API'si127.0.0.1:5191;
test sonunda kapatıldı. Oyun, orijinal kayıtlar/DB ve exporter değiştirilmedi; commit yok.

Başlık düzeltmesi sonrası üretim derlemesi ve 1200/1440/2560px CSS geometri kontrolü geçti:
`header-build.log`, `header-check.json`. Başlık/menü ölçüsü ve ortalaması diğer sayfayla birebir;
yalnız Scout içeriği geniştir. Üstteki gerçek veri ölçümleri ilk genişlik teslimine aittir.

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```
