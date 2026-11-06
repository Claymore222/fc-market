# Kadro analizi — Faz B teslimi

30.10.2026 — **TAMAMLANDI.** Profilin ardından bağımsız kadro derinliği ve gerekçeli mevki ihtiyaçları eklendi.
Oyuncu isimleri öneren dış aday motoru Faz C'dir; henüz uygulanmadı. Oyun açılmadı, exporter değiştirilmedi.

## Kullanım

`powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`

**SQUAD → Kadro analizi → Kadroyu analiz et**. Ekrandaki tercihler kullanılır; önce profili kaydetmek şart değildir.
Rapor kaydedilmemiş profille çalışıyorsa bunu belirtir. Saha ve öncelik sırasındaki mevkilere fare/klavyeyle basınca
ilk seçenek, bağımsız rotasyon, ek gelişim seçeneği ve ihtiyaç gerekçesi görünür.

- **Yapısal kadro:** sakatlığı kalıcı transfer ihtiyacı yapmadan mevki ve kalite derinliği.
- **Bugünkü havuz:** güncel, kaynak günü belli dönüş tarihine göre geçici eksikler. Bilinmeyen sağlık sağlıklı sayılmaz.
- **Gelecek sezon:** biten sözleşmeler yenilenmemiş varsayılır. Kesin ayrılış sonucu çıkarılmaz, yenileme ilk alternatiftir.
- Alternatif diziliş bağımsız değerlendirilir; ihtiyaçlar toplanmaz.
- Yeni kayıt/revision, profil veya tercihler değişirse rapor **Önceki sonuç** olur. Yeniden analiz gerekir.

## Hesaplama ve saklama

`DepthAnalysis` ilk 11 ve tam ikinci 11'i ortak atamayla çözer; her oyuncunun kapasitesi birdir. Hungarian eşlemesi,
önce ilk 11 kapsamını, ardından bağımsız rotasyon kapsamını, sonra OVR kalitesini korur. Açgözlü ilk 11 seçiminin
tek çok mevkili oyuncuyu tüketip önlenebilir boşluk üretmesi engellenir. Bu tam rotasyon bir stres testidir;
maç kadrosu veya her boşluk için zorunlu transfer kuralı değildir.

Takımın en yüksek 11 bilinen OVR'ının medyanı ve proje tercihi kalite tabanını belirler. Sabit lig/OVR eşiği yoktur.
Yaş tek başına satış veya acil ihtiyaç üretmez. Kısa/uzun sakatlık açıklanır; sakatlıkla oluşan ek açık ayrı kalır.
Ayrılabilir tercihi gerçekleşmiş satış sayılmaz. Kayıtlı mevki ve genel OVR kullanılır; role göre özellik uyumu
sonraki aşamadır. Oyun stili tercihi bu aşamada farklı transfer adayı üretmez.

`POST /api/analysis/run` eski snapshot/revision/config/profil sürümünü 409 ile reddeder. Hesap sırasında kaynak
tekrar denetlenir; profilin eşzamanlı yazımı da rapor saklanmadan kontrol edilir. Rapor ve tam girdi yalnız
`app.db/analysis_runs` tablosunda saklanır. Aynı girdi aynı rapor kimliği ve atamayı üretir. Profil otomatik kaydedilmez.
Arşiv görüntüleme henüz yoktur; yeniden açılışta aynı kaydedilmiş profil tekrar analiz edilerek rapor alınır.

Log: `FcMarket.Api.Analysis.SquadAnalysisService` kategorisinde `Squad depth` satırı; kapsam, kaynak/revision,
rapor/config/profil hash, oyuncu sayısı ve süre. Masaüstü log yönlendirmesiyle `logs/app/api` altına gider.
Testin ayrı API çıktısı `scratch/analysis-phase-b/api.log` içindedir. Tüm oyuncu tablosu loga basılmaz.

## Veri sınırları

- Kiralık tablosunun güncelliği doğrulanmamış olduğundan bu kaynak oyuncuları sessizce kadrodan düşürmez.
  Motor doğrulanmış yön/bitiş için hazırdır; unit testteki `known` loan vakaları sentetiktir.
- Akademi/kiralık dönüşleri kadro adapter'inin dışında; hazır alternatif uydurulmaz. Ceza verisi yoktur.
- Kaynağı/günü bilinmeyen dönüş tarihleri otomatik yokluk sayılmaz. Eksik mevki/OVR sonuçları koşulludur.
- Yeni ham oyun alanı çözülmedi. Model eşikleri ve açıklamaları [data-dictionary.md](data-dictionary.md) içinde;
  kalibrasyonları **DOĞRULANACAK**, resmî oyun formülü değildir.
- Bütçe, bonservis/maaş uygunluğu, rol/özellik profilleri ve dış oyuncu adayları Faz C/D kapsamındadır.

## Doğrulama

| Kontrol | Sonuç ve kanıt |
|---|---|
| Backend | **GEÇTİ — 253/253.** Yeni 23 motor vakası + 3 servis vakası. Ortak CB/CDM yedeği, açgözlü atama tuzağı, eksik kaleci/çift stoper, kısa/uzun sakatlık, eski kaynak, gerçek sıfır, eksik OVR/mevki, yaş, sözleşme, loan, ek genç, deterministik sıra; rapor saklama, eski istek, dal/önizleme ve DB hash'i. |
| Playwright | **GEÇTİ — 61 geçti, 8 ortam koşullu test atlandı.** Yeni 5 UI vakası: kaydetmeden analiz, erişilebilir seçim/senaryolar, eski rapor, hata/retry, gecikmiş kariyer yanıtı, 390 px ve reduced-motion. |
| Gerçek kariyer UI | **GEÇTİ — 1/1.** İki kariyer, iki diziliş, profil kaydet/reload/aynı rapor kimliği, üç senaryoda tekil oyuncu ataması, masaüstü ve 390 px ekranları; JS hatası yok. Standart koşuda atlanan opsiyonel test ayrı etkinleştirildi. |
| Python | **GEÇTİ — saveimport 53/53, assets 3/3.** |
| Üretim derlemesi | **GEÇTİ.** TypeScript/Vite ve API derleniyor. Mevcut Vite 500 kB paket uyarısı ve eski ClubTests nullable uyarısı sürüyor. |
| Kaynak koruma | **GEÇTİ.** Yalnız önceki test DB'sinin yeni kopyası ve ayrı app.db kullanıldı; orijinal kayıtlar/DB/exporter değişmedi, oyun açılmadı, commit atılmadı. |

Gerçek kaynak: `scratch/sync-resilience-20261029-204430/fc_career.db` önce
`scratch/analysis-phase-b/fc_career.db` olarak kopyalandı. API yalnız `127.0.0.1:5191` üzerinde çalıştırıldı;
`FC_CAREER_DB`, `FC_APP_DB`, `FC_EXPORT_DIR` scratch'e yönlendirildi. İçe aktarıcı veya oyun izleyicisi açılmadı.

| Kariyer | Kaynak / gün | 4-3-3 yapısal | Yenilemesiz gelecek | Son UI isteği |
|---|---|---|---|---|
| Fenerbahçe | dal 3, 28.07.2030, revision 1, 24 oyuncu | 11 ilk seçenek + 10 rotasyon | 11 + 6 | 44 ms |
| Gençlerbirliği | dal 1, 24.08.2026, revision 3, 28 oyuncu | 11 + 11 | 11 + 2 | 38 ms |

Bu süreler kendi kadrosu için ihtiyaç hesabıdır; 20 bin oyunculuk öneri motorunun performansını ölçmez.
Kariyer DB kopyasının önce/sonra SHA-256'sı aynı:
`DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`.

Kanıtlar: `scratch/analysis-phase-b/real-check.json`, `real-ui.log`, `ui-full.log`, `api.log`, `api-build.log`,
`build.log`, `career-hash-before.json`, `career-hash-after.json` ve `*-depth-desktop.png` / `*-depth-mobile.png`.
Backend/Python çıktıları: `scratch/depth-backend-tests.log`, `scratch/depth-saveimport-tests.log`,
`scratch/depth-assets-tests.log`. Ekranlar incelendi. Test API'si kapatıldı.

Sonraki teslim **Faz C:** bu ihtiyaçlar için rol/oyun tarzı profilleri, aynı kariyer snapshot'ından gerekçeli oyuncu
sıralaması; hemen katkı ve genç yatırım grupları, mevcut oyuncuyla karşılaştırma ve shortlist bağlantısı.
