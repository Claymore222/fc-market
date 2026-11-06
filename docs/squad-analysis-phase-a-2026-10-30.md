# Kadro analizi — Faz A teslimi

30.10.2026 — **TAMAMLANDI.** Kapsam: veri/kapsam adapter'i ve teknik direktör tercihleri.
Ana tasarım: [squad-analysis-plan-2026-10-30.md](squad-analysis-plan-2026-10-30.md).
Faz B ihtiyaç puanları, Faz C oyuncu önerileri ve sonraki transfer senaryoları henüz uygulanmadı.

## Kullanım

Uygulamayı yeniden başlat: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
**SQUAD → Kadro analizi** (`/squad/analysis`) içinde:

- Ana/alternatif diziliş, birlikte kullanılabilen hücum tercihleri, savunma, çizgi, tempo ve maç biçimi.
- İki dizilişin her yeri için mevkiye uygun rol tercihi; CF seçeneği yok.
- Takım projesi, bonservis ve haftalık maaş için ayrılan bütçe, güvenlik payı ve transfer sayısı.
- Ek tercihlerde yaş/ligler, vazgeçilmez ve ayrılabilir oyuncular. Oyunda işlem veya görev ataması yapmaz.
- Sağda kaynak ve veri kapsamı. Bilinen sıfır, eksik bilgi ve doğrulanmamış anlam birbirinden ayrılır.

Oyun bütçesi yalnız kullanıcı “Bu tutarı kullan” dediğinde tercih alanına kopyalanır. Boş bütçe bilinmiyor,
0 bütçe sıfırdır. Maaş kutuları haftalıktır; sezonluk bütçe haftalık gibi kullanılmaz.

## Saklama ve güncelleme davranışı

`app.db/manager_profiles` tablosu `(career_key,view_mode)` anahtarını kullanır. Kariyer, dal ve kayıt/export
önizleme profilleri ayrı kalır. Sayfayı açmak varsayılanları kaydetmez; yalnız **Profili kaydet** kalıcılaştırır.
Profil JSON'u yanında sürüm, zaman, kaynak snapshot/revision ve yapılandırma sürümü bulunur.

`GET/PUT /api/analysis/profile?saveUid=...` mevcut kariyer çözümlemesini kullanır: sade UID kayıt işaretçisini,
açık dal anahtarı arşiv ucunu izler. PUT snapshot/revision/config ve profil sürümünü denetler; eski istekler
409 ile reddedilir. Eşzamanlı güncelleme başka pencerenin tercihlerinin üzerine yazmaz.

Ekrandaki form, arka planda yeni veri geldiğinde sessizce değişmez. Kaydetme durur; **Güncel profili yükle**
düğmesinin kaydedilmemiş seçimleri değiştireceği açıkça belirtilir. Kaydetme hatası girdileri silmez veya
başarı mesajı üretmez. Geç gelen yanıt başka kariyerin formuna uygulanmaz. Kadrodan ayrılmış oyuncu, kaldırılmış
lig/rol/diziliş tercihleri açık uyarı ve temizleme düğmesiyle ele alınır. Yapılandırma değişiminde kontrol istenir.

## Veri sözleşmesi ve sınırlar

`Analysis/SquadAnalysisService.cs` snapshot kimliği, tablo kaynakları ve kadro bilgilerini tek SQLite okuma
işlemi içinde toplar. Özellikler oyuncu başına ayrı HTTP/Detail çağrısı yerine toplu okunur. 34 özelliğin
ham alanları `config/field-map.json/analysisAttributes` içindedir. Mevcut oyun alanları yeniden kullanıldı;
yeni bir oyun alanı veya dosya formatı çözülmedi.

Kadro bağlantıları, OVR/POT, yaş, geçerli mevkiler, ham ilk 11/yedek yeri ve form, ayak, rol/PlayStyle kodları,
sözleşme/maaş, fitness/sakatlık gözlemleri ve kiralık kaydı okunur. Fitness satırı yoksa 100 veya sağlıklı
varsayılmaz. Kiralık satırı yokluğu kiralık değildir kanıtı değildir; tablonun güncelliği doğrulanmalıdır.
Takımın ham oyun kurma/savunma derinliği, kullanıcının taktik tercihi diye atanmaz.

Kaynak: snapshot kimliği, tür ve biliniyorsa oyun günü. Günlük snapshot'ın devraldığı tablonun eski gözlem günü
DB'de tutulmadığından `inherited` ve null tarih verilir. Eski DB'de kaynak kaydı yoksa `unknown` gösterilir.
Eksikler başka snapshot'tan tamamlanmaz. Sıfır rol kodu okunmuş boş yatkınlık; tüm alanların null olması eksiktir.
İlk 11'den diziliş önerisi yalnız 11 ham yerin şablonla tam eşleşmesidir; oyuncu atama/derinlik optimizasyonu değildir.

Loglar `FcMarket.Api.Analysis.SquadAnalysisService` kategorisinde snapshot, revision, kaynak, kural sürümü,
oyuncu/eksik kapsam sayısı, süre ve profil kaydını içerir. Masaüstünde mevcut `logs/app/api` çıktısına girer.
Analiz raporları ve aday eleme logları henüz yoktur; rapor motoruyla sonraki fazlarda eklenecek.

## Doğrulama

| Kontrol | Sonuç ve kanıt |
|---|---|
| Backend | **GEÇTİ** — `dotnet test backend/FcMarket.Tests`: 205/205. Yeni `SquadAnalysisTests`: 26 vaka; sıfır/null, kaynak/kapsam, kariyer/dal/önizleme, yeni disk işaretçisi, yeniden açılış, eski revision/config/profil sürümü, geçersiz tercihler, bozuk config ve salt-okunur DB. |
| Save importer | **GEÇTİ** — `python -m unittest discover -s tools/saveimport/tests`: 49/49. |
| Görsel araçları | **GEÇTİ** — `python -m unittest discover -s tools/assets/tests`: 3/3. |
| Arayüz bütünü | **GEÇTİ** — `npm --prefix frontend run test:e2e -- --workers=2 --reporter=line`: 50 geçti, 6 ortam gerektiren test atlandı. Yeni profil paketinde 7 vaka: saklama/yeniden açılış, ayrı kariyer/dal/önizleme, aynı gün revision, hata/çakışma, gecikmiş yanıt, eski tercihler ve 390 px/klavye. |
| Gerçek kariyer UI | **GEÇTİ** — `FC_ANALYSIS_REAL_URL=http://127.0.0.1:5189` ve ilgili UID ile `analysis-real.spec.ts`: 1/1. Bu test yukarıdaki standart koşuda atlanan opsiyonel testlerden biridir; ayrı koşuda etkinleştirildi. |
| Üretim derlemesi | **GEÇTİ** — `npm --prefix frontend run build`; TypeScript hatası yok. Mevcut Vite 500 kB paket uyarısı sürüyor. Backend testlerinde eski `ClubTests.cs:567` nullable uyarısı var. |
| Değişiklik sınırı | **GEÇTİ** — exporter dosyaları değişmedi; kaynak oyun kayıtlarına ve `C:\FCExport\fc_career.db`'ye yazılmadı. Test API'sinin app.db ve watchlist/log çıktısı scratch altındadır. Commit atılmadı. |

Gerçek veri kaynağı önceki senkron testinden kalan **ayrı kariyer DB kopyasıdır**:
`scratch/sync-resilience-20261029-204430/fc_career.db`. Oyun kaydına ait görünüm:

- UID `84af764ba0d247f880ccc658a7e0c7a`, dal 3, **28.07.2030**, revision 1.
- Snapshot `save_84af764ba0d247f880ccc658a7e0c7a_7e821b131920b5eb3c5600fd_20300728`.
- 24 oyuncu; özellik **816/816**, rol alanı **216/216**, stil alanı **96/96**; maaş/sözleşme **24/24**.
- Kondisyon **13/24**, kiralık kayıt kapsamı **0/24**; bunlar eksik olarak görünür.
- İlk HTTP profil isteği son koşuda **243 ms**. Servis context logları 10–37 ms; bu Faz A'nın kendi kadro
  okumasıdır, henüz 20 bin oyunculuk aday analizi performansını kanıtlamaz.
- Profil kaydedilip sayfa yeniden açıldı. Ayrı export profiline gidilip geri dönüldüğünde kayıtlı profil korundu.
  `TEST_UNSAVED_FUTURE` / 31.07.2030 önceki testin **sentetik** export önizlemesidir; gerçek oyun ilerlemesi değildir.
- Test API'si kapatıldıktan sonra kariyer kopyasının SHA-256'sı öncesiyle aynı:
  `DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`.

Kanıt dosyaları `scratch/analysis-phase-a/` içinde: `backend-tests-final.log`, `saveimport-tests.log`,
`assets-tests.log`, `frontend-tests.log`, `real-ui-final.log`, `build-final.log`, `api-final.log`,
`real-check.json`, `career-hash-before.json`, `career-hash-after.json`, `profile-desktop.png`, `profile-mobile.png`.
Görseller 1440 px ve 390 px'te incelendi. Orijinal DB/savelere erişen bir test sunucusu çalıştırılmadı.

Sonraki teslim **Faz B**: bağımsız ilk 11/rotasyon ataması ve gerekçeli mevki ihtiyaçları. Oyuncu önerileri Faz C'de.
