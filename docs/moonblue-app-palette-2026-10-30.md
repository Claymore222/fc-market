# Mavi Cam gece paleti — uygulamanın tamamı

30.10.2026 — **TAMAMLANDI.** Kullanıcının seçtiği gece mavisi şema gerçek uygulamaya uygulandı. Bu iş renk
güncellemesidir; sayfa yerleşimi, yazı boyutları, fontlar, veri veya öneri hesapları yeniden tasarlanmadı.

## Merkezi kaynak

`frontend/src/palette.css` ortak palettir:

| İşlev | Renk |
|---|---|
| Sayfa / üst gezinme | `#101c2e` / `#112137` |
| Kart / yükseltilmiş iç yüzey | `#1b2d45` / `#203750` |
| Girintili yüzey / hover / seçim | `#172b43` / `#29415e` / `#2b4869` |
| Kenarlık / güçlü kenarlık | `#36516e` / `#547396` |
| Ana / ikinci metin | `#d8e5f5` / `#bdcfe5` |
| Yardımcı metin | `#a7bdd5` |
| Vurgu / vurgu üzerinde koyu yazı | `#8db8ef` / `#14253c` |

`styles.css` içindeki Tailwind v4 `cmt-*` ve gri yardımcı sınıfları, eski ortak değişkenler ve sayfaların
`hub/career` renkleri bu palete bağlıdır. Nötr/arbitrarî yüzey sınıfları anlamlı ortak renk adlarına geçirildi.
Stil dosyalarındaki eski bağımsız gri ve mor-mavi tonlar da ortak değişkenleri kullanır. Eski Tailwind config'i
aynı palete bağlandı; çalışan kaynak yine v4 CSS'tir.

Kapsam: kariyer seçici, üst bar/kariyer başlığı, Home, Squad, Youth, Scout, Trophies, İzleme, karşılaştırma,
Transfer/piyasa, kadro ve maç analizi, akış, rehber, oyuncu detayı, takvim/finans ve ayar pencereleri, hover/focus
durumları, hata/kurtarma ekranları. HTML'in ilk boyaması/favicon/meta rengi ve Windows/WebView açılış/kurtarma
zemini de eşlendi. `fcm.theme` eski değeri silinmez; artık başlangıçta eski açık şemayı yüklemez.

Başarı/hata/uyarı, OVR/POT, mevki grupları, saha ve karşılaştırmadaki farklı veri serileri anlamlarını korur.
Oyuncu yüzü/arma/bayrak/PlayStyle görselleri filtreyle yeniden renklendirilmez. Beş ayrı tema denemesinin iç
paletleri örnek amaçlı kalır; galerinin ve çevresindeki uygulamanın renkleri gece mavisidir.

## Doğrulama

Kanıtlar `scratch/moonblue-app/` içinde:

| Kontrol | Sonuç |
|---|---|
| Backend | **GEÇTİ — 285/285**, `backend-tests.log`. İşlevsel backend değişmedi. |
| Tam Playwright paketi | **GEÇTİ — 74 geçti, 11 ortam koşullu atlandı**, `ui-full.log`. |
| Son kart/grafik rötuşları | **GEÇTİ — 56/56**, Scout ve analysis, `ui-final-focused.log`. |
| Açılış/kurtarma ve tema akışları | **GEÇTİ — 9/9**, `ui-recovery-theme.log`. |
| Python | **GEÇTİ — saveimport53/53, assets3/3**, ilgili test logları. |
| Derleme | **GEÇTİ**, TypeScript/Vite `build.log`, Windows masaüstü `desktop-build.log` (0 hata/uyarı). Mevcut büyük Vite bundle uyarısı sürer. |
| Gerçek veri / görünüm | **GEÇTİ**, `real-review.json`, `real-ui.log`: 14 adres, oyuncu detayı/tercih/ayarlar, kariyer seçici, Fenerbahçe→Gençlerbirliği ve reload, dört sayfada390px taşma kontrolü. JS hata listesi boş. Masaüstü/mobil ekranlar kaydedildi; Home, Scout, oyuncu kartı/detayı, tercih ve mobil Home görselleri incelendi. |
| Eski tema tercihi | **GEÇTİ**, `final-theme-check.json`: eski `fcm.theme=light` korunurken yeni palet ve native kontroller `dark`. |
| Kaynak koruma | **GEÇTİ**, `source-hash-after.json`; kariyer kopyası SHA256 değişmedi: `DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`. |

Gerçek kontrol yalnız önceden alınmış `scratch/analysis-phase-c/fc_career.db` kopyasıyla, ayrı app.db/export/log
yollarıyla ve `127.0.0.1:5191` test API'sinde yapıldı. Test API'si kapatıldı. Windows masaüstü renkleri derlendi;
bu işte oyun veya gerçek masaüstü import süreci başlatılmadı. Orijinal oyun kayıtları, `C:\FCExport\fc_career.db`,
exporter ve otomasyon değişmedi. Commit yok; önceki çalışma ağacı değişiklikleri korundu.

## Çalıştırma

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```

Tam tasarım yenilemesi sonraki ayrı çalışmadır. Renkleri değiştirmek için önce `palette.css` okunmalı; yeniden
sayfa başına sabit gri/mor tonlar eklemek yerine bu token'lar kullanılmalıdır.
