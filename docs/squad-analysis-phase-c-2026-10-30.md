# Oyuncu önerileri — Faz C teslimi

> Bu belge ilk Faz C tesliminin tarihsel kaydıdır. Aynı gün sonraki ürün tesliminde bonservis/maaş çarpanları
> kaldırıldı, varsayılan liste sayısı ve transfer akışı değişti. Güncel kullanım ve maliyet politikası:
> [transfer merkezi ve beş tema](transfer-hub-and-theme-delivery-2026-10-30.md).

30.10.2026 — **TAMAMLANDI.** Yerel C# motoru, ihtiyaç raporunda seçili mevkiye aynı kariyerden gerekçeli
oyuncular önerir. AI, internet veri tabanı veya oyun açılması gerekmez. Ortak transfer planı Faz D'dir.

## Kullanım

`powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`

**SQUAD → Kadro analizi → Kadroyu analiz et → sahadan mevki seç → Oyuncu öner.**

Öneri taraması kullanıcı düğmeye basınca çalışır. Önce kadro içi alternatifler; ardından **İlk 11'e katkı**,
**Hazır rotasyon**, **Genç yatırım** grupları görünür. Her grupta toplam sayı ve ilk sekiz aday gösterilir.

Her kartta yüz/OVR/POT, profil endeksi, mevcut oyuncuyla OVR/özellik farkı, güçlü/daha düşük özellikler,
uygun orijinal PlayStyle rozetleri, gerekçeler ve bireysel tahmini bedel/maaş vardır. Oyuncu detayı açılır;
mevcut oyuncuyla karşılaştırma ikisini tek işlemde listeye ekler, dört kişilik sınırı aşamaz. İzleme yıldızı
mevcut shortlist akışını kullanır. Klavye, Escape, 390 px ve azaltılmış hareket desteklenir.

Futbol stili ve rolüne göre hedef özellik ağırlıkları değişir. Örneğin önde baskı dayanıklılık/hareketlilik,
derin blok savunma özellikleri, top oynayan stoper pas ve top kontrolünü artırır. Kayıtlı mevki ve kritik
temel özellik/OVR tabanı korunur; tek hızlı özellik veya Role++ zayıf savunmacıyı otomatik uygun yapmaz.
Model, FC'nin gizli oynanış/simülasyon formülü değildir. Eşik/ağırlıklar config'te; kalibrasyon DOĞRULANACAK.

## Maliyet ve veri dürüstlüğü

- Profilde ayırdığın bütçe kullanılır. Oyun bütçesi kendiliğinden tercih yapılmaz; “Bu tutarı kullan” hâlâ açıktır.
- Mevcut değer modelinden bedel aralığı, kayıtlı ücretten tahmini maaş aralığı üretilir. Yeni sözleşme talebi
  veya kabul edilecek teklif değildir. İmza/temsilci ücreti bilinmez. Serbest oyuncu sıfır toplam maliyet değildir.
- Maaş/bütçe eksikse “Maliyet / bütçe eksik”; ucuz veya bütçeye kesin uygun sayılmaz. Gerçek sıfır korunur.
- Önce bireysel tahmini bütçe durumu, sonra uyum endeksi sıralanır. Aynı oyuncu farklı amaç gruplarında olabilir;
  gruplar birlikte alınacak transfer paketi değildir. Çoklu transfer bütçesi bu fazda yoktur.
- Tüm hedef özellikleri bilinmeyen oyuncuya puan üretilmez. Tam olmayan rol/stil kaynağı yokluk kanıtı değildir.
  Kendi oyuncuları ve olası kendi kiralıkları dış havuzdan çıkarılır. Akademi/terfi/dönüş senaryosu henüz yoktur.
- Adayın gelmek istemesi, kulübün kabulü, kiralanabilirliği, tescil kuralları ve güncel maç uygunluğu bilinmez.
  Maç istatistiği veya gözlem verisi eksik diye sıfır performans varsayılmaz.

## Saklama ve sağlamlık

`RecruitmentService`, `analysis_runs` içindeki raporu kariyer/dal/saved-preview kapsamında çözer; snapshot,
revision, analiz config'i ve profil sürümünü başta/sonda kontrol eder. 409 sonrası arayüz eski adaylarla işlem
yaptırmaz ve güncel profili ister. Kaynak değişince C ve oyuncu detayı dahil mevcut cache'ler yenilenir.
Gecikmiş yanıt başka kariyere/yer seçimine uygulanmaz; yanıt kimliği UI'da da denetlenir.

Havuz yalnız seçili snapshot'ın tek okuma işlemiyle, toplu özellik/rol alanlarıyla kurulur. Başka kayıttan eksik
alan tamamlanmaz. Süreç cache'i en çok iki havuz/48 hedef sonucudur; hit'te de güncellik doğrulanır.
`app.db/recruitment_runs` tam kural/motor sürümü ve gerekçeli sonucu tutar; profil değişmez. Tarihsel raporları
açan arşiv ekranı henüz yoktur. Kaynak tablolar/gözlem günü ve eksikler yöntemde görülebilir.

Loglar `RecruitmentService` kategorisinde, masaüstünde `logs/app/api` altında; rapor, scope/snapshot/revision,
kural sürümü, hedef, havuz/eleme sayıları ve süre. Oyuncu tablosu bütünüyle loglanmaz, dış servis kullanılmaz.

## Doğrulama

| Kontrol | Sonuç ve kanıt |
|---|---|
| Backend | **GEÇTİ — 276/276.** Yeni 19 motor + 4 servis vakası: eşit OVR'da baskı/blok sırasının tersine dönmesi, genç/hemen katkı tercihi, kritik taban, eksikler/gerçek sıfır, rol/stil bonus tavanı, ayak çakışması, maliyet aralıkları, tekil/sıralı havuz, kadro içi yer değişimi, kaynak günü; cache sonrası revision/profil/başka kapsam koruması ve salt-okunur DB. Kural/sonuç audit kaydı da doğrulandı. |
| Playwright | **GEÇTİ — 67 geçti, 9 ortam koşullu test atlandı.** Yeni 6 UI vakası: elle tarama, üç grup/kadro içi gerekçe, belirsiz maliyet, gerçek shortlist, atomik iki oyunculu karşılaştırma, hata/boş/retry, geç yanıt/kariyer, eski rapor, yanlış kaynak, 390 px ve reduced-motion; server 409 sonrası cache'teki eylemler kapanır. |
| Gerçek kariyer UI | **GEÇTİ — 1/1.** Fenerbahçe ve Gençlerbirliği kopyalarında üç grup, hedef rol/stil, tek snapshot, kendi oyuncusunu dışlaması, oyuncu detayı/Escape ve shortlist; masaüstü/mobil görseller incelendi. Standart koşuda atlanan opsiyonel test ayrı etkinleştirildi. JS hatası yok. |
| Python | **GEÇTİ — saveimport 53/53, assets 3/3.** |
| Üretim derlemesi | **GEÇTİ.** TypeScript/Vite ve API. Mevcut büyük Vite bundle ve ClubTests nullable uyarısı sürüyor. |
| Kaynak koruma | **GEÇTİ.** Oyun açılmadı; orijinal kayıt/DB ve exporter değişmedi. Yalnız test kopyası, ayrı app.db ve scratch log/izleme dosyaları kullanıldı. Commit yok. |

Kaynak önceki testin DB kopyasından yeniden `scratch/analysis-phase-c/fc_career.db` olarak kopyalandı.
API `127.0.0.1:5191`; `FC_CAREER_DB`, `FC_APP_DB`, `FC_EXPORT_DIR` scratch'e yönlendirildi; importer/oyun
izleyicisi çalıştırılmadı. UI testinde 10 M€ / 50 bin €/hafta **sentetik kullanıcı tercihi** girildi; oyunun gerçek
bütçesi olduğu iddia edilmedi. Hedef: 4-3-3 LCB, top oynayan stoper, pasla oyun ve yüksek çizgi.

| Kariyer | Kaynak | Havuz | İlk istek / sıcak tekrar | İlk 11 / rotasyon / genç toplamı |
|---|---|---|---|---|
| Fenerbahçe | dal 3, 28.07.2030, revision 1 | 20.407 | 973 / 47 ms | 24 / 985 / 5 |
| Gençlerbirliği | dal 1, 24.08.2026, revision 3 | 19.399 | 996 / 42 ms | 1.660 / 2.024 / 1.266 |

Bu toplamlar zorunlu mevki/yaş/kalite/özellik koşullarını geçen adaylardır; hepsi bütçede veya kulübüne gelmeye
hazır anlamına gelmez. İlk sekiz sonuç bireysel tahmini maliyete göre sıralanır. Fenerbahçe LCB rotasyonunda
Oumar Solet 81,4 endeksle ilk görüldü; bu yalnız bu profil ve test tercihlerinin sonucudur, sabit öneri değildir.

DB kopyasının önce/sonra SHA-256'sı aynı:
`DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`.
Kanıtlar `scratch/analysis-phase-c/`: `real-check.json`, `real-ui.log`, `backend-tests.log`, `ui-full.log`,
`saveimport-tests.log`, `assets-tests.log`, `build.log`, `api-build.log`, `api-verified.log`, `audit-check.json`,
`career-hash-before.json`, `career-hash-after.json`, `*-candidate-desktop.png`, `*-candidate-mobile.png`.
Test API'si kapatıldı. Formüller/kapsam: [data-dictionary.md](data-dictionary.md#oyuncu-önerileri--faz-c-30102026).

Sonraki teslim **Faz D**: ortak bonservis/haftalık maaş bütçesi, satış/alış/terfi ve diziliş senaryoları; aynı para
iki kez harcanmadan her işlem sonrası kadro derinliği ve marjinal faydanın yeniden hesaplanması.
