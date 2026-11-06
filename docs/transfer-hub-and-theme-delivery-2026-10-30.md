# Transfer merkezi ve beş tema — teslim

30.10.2026 — **TAMAMLANDI.** Önce [plan](transfer-hub-and-theme-plan-2026-10-30.md) yazıldı, ardından uygulandı.
Kullanıcıya soru sorulmadı; oyun açılmadı, commit atılmadı.

## Kullanım

```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```

Kariyerini seç → **TRANSFER**. Soru veya profil formu doldurmadan aynı kariyerin verilerinden öneriler gelir.
Takım/diziliş/lig seviyesi ve bütçenin hangi kaynaktan alındığı üstte görünür. Boş profil için kayıttaki bilinen
bütçe yalnız analizde kullanılır; profil kendiliğinden kaydolmaz. Bütçe bilinmiyorsa bilinmiyor kalır.

- Mevki seç → **İlk 11 / Yedek-rotasyon / Genç yatırım**. Varsayılan beş aday; 3/5/10 seçilebilir. Yeterli veri
  veya uygun oyuncu yoksa sayı beşe uydurulmaz. “Tüm mevkiler” 14 doğal mevkiyi açar; diziliş dışındakiler
  alternatif senaryodur. CF yoktur.
- Kartlarda 100 üzerinden model uyumu, OVR/POT/yaş, mevcut oyuncuya katkı ve önerilen mevkiye uygun kısa
  profil notları bulunur. Öneri/uyum/OVR sırası seçilebilir. Detay, izleme yıldızı ve mevcut oyuncuyla atomik
  karşılaştırma ortak bileşenleri kullanır. Kısa rapor ve yöntem ayrıntıları kapalı başlar.
- **Tercihlerini kişiselleştir**: bek, kanat, santrfor ve 10 numara için sıralı seçim kartları. Geri/atla/kapat
  ve son inceleme ekranı vardır. Yalnız “Tercihleri uygula” uygulama profilini kaydeder. Ayrı ayar penceresinde
  diziliş/bütçe/proje düzenlenebilir. İptal yazmaz; eski profil sürümüyle kayıtta 409 taslağı korur.
- Eski serbest/sözleşme/piyasa listeleri **Piyasa listeleri**, `/transfer/market` adresinde durur.

## Bonservis ve puanın sınırı

Önceki değer×0,85–1,35 ve maaş×1–1,4 aralıkları kaldırıldı. İstenen güncel bedel yoksa **Fiyat bilinmiyor**.
Doğrudan oyuncu ID'sine bağlı, aynı snapshot'ta geçerli tarihli son transfer varsa kulüp/tarih/bedel ayrı
gösterilir; bugünkü satış fiyatı değildir. İsim eşleştirmesiyle sezon arşivindeki bedeller oyuncuya atanmaz.

Bütçe ön elemesinin referansı sırasıyla serbest oyuncu0, gözlenen geçmiş bedel veya açıkça etiketlenen mevcut
değer modelidir. Mevcut/kayıtlı maaş yeni talep değildir. Referansın iki ayrı bütçeye sığması transferin kabulü
anlamına gelmez. Bedelsiz transfer toplam maliyet0 sayılmaz; yeni maaş/imza/temsilci ücreti bilinmiyor.

Takım seviyesi ve kendi liginin ölçülebilen kulüplerinden türetilen referans kullanılır. Lig katkısı yalnız
kalite bileşeninin %20'sidir. Rotasyon OVR'ı mevcut ilk seçeneği aşamaz; yıldızlar sırf puanları yüksek diye
yedek grubuna düşmez. Tercih ağırlıkları/etiketler config'te sürümlüdür; model puanı FC'nin resmî reytingi veya
başarı olasılığı değildir. Ayrıntılar [data-dictionary](data-dictionary.md#transfer-merkezi-lig-ve-tercihler--30102026).

Mevcut Fenerbahçe kopyasında `raw_transfers` kullanılabilir oyunculu/ücretli kayıt içermiyor. Bu nedenle
geçmiş bedel gösterimi gerçek oyun satırıyla henüz doğrulanamadı. Eşleme, tarih kodlaması ve para birimi
**DOĞRULANACAK**; sentetik testler kimlik/snapshot/tarih/gerçek sıfır ve çelişki davranışını doğrular.

## Beş tema denemesi

**HOME → Tema denemeleri →** galeri `/themes`. Aynı aktif kariyerin ana sayfasının üst bölümü her tasarımda
aynı verilerle gösterilir. Yalnız örnek bölümün CSS'i değişir; global tema veya kalıcı tema tercihi uygulanmaz.

| Tema | Adres | Görünüm |
|---|---|---|
| Buz Camı | `/themes/ice` | Mavi/beyaz, saydam kartlar ve cam etkisi |
| Gece Tribünü | `/themes/forest` | Koyu yeşil, sakin vurgu ve çizgiler |
| Krem Defter | `/themes/ivory` | Krem/zeytin, kâğıt dokusu ve serif başlık |
| Beyaz Stüdyo | `/themes/paper` | Beyaz/açık gri, kırmızı vurgu, köşeli başlık |
| Mor Gece | `/themes/violet` | Koyu erik/mor, lila vurgu ve yumuşak kartlar |

Örnekler kulüp/sezon/kaynak, dört metrik, sıradaki maç, haftalık takvim, son üç gerçek sonuç ve dört kadro
oyuncusu içerir. Takvim ve oyuncu detayları çalışır. Hover/focus, mobil düzen ve reduced-motion desteklenir.

## Doğrulama

Kanıt klasörü: `scratch/transfer-hub-themes/` (yerel test çıktısı, git'e eklenmedi).

| Kontrol | Sonuç ve kanıt |
|---|---|
| Backend | **GEÇTİ — 285/285**, `backend-tests.log`. Transfer kanıtı/sıfır/çelişki, gerçek fiyat üretmeme, lig, profil tercihi, boy koşulu, ilk 11-yedek ayrımı, 14 mevki ve otomatik profil yazmama dahil. |
| Playwright tam paket | **GEÇTİ — 72 geçti, 10 ortam koşullu test atlandı**, `ui-full.log`. Beş yeni test: anında adaylar, tercihler/kaydet/yeniden aç, iptal/eski sürüm, geç kariyer yanıtı/390px/reduced-motion, beş tema/kapsam/klavye. |
| Gerçek kopyayla UI | **GEÇTİ — 1/1**, `real-ui.log`, `real-check.json`. Fenerbahçe 28.07.2030 ve Gençlerbirliği 24.08.2026, 14 mevki, tek snapshot, null güncel ücret, iptal sonrası profil değişmemesi, detay/Escape, beş tema ve mobil taşma kontrolü. JavaScript hata listesi boş. |
| Python saveimport | **GEÇTİ — 53/53**, `saveimport-tests.log`. |
| Python assets | **GEÇTİ — 3/3**, `assets-tests.log`. |
| Üretim derlemesi | **GEÇTİ**, TypeScript/Vite `build.log`, API `api-build.log`. Mevcut Vite büyük bundle ve test dosyasındaki nullable uyarısı sürer. |
| Görsel kontrol | **GEÇTİ**, son transfer masaüstü/mobil ekranı ve beş temanın masaüstü ekranları incelendi. `fener-hub-desktop.png`, `fener-hub-card-mobile.png`, `theme-*-desktop.png`, `theme-ice-mobile.png`; beş temanın mobil görüntüleri de kaydedildi. |
| Salt-okunur kaynak | **GEÇTİ**, önce/sonra hash aynı, `career-hash-before.json`, `career-hash-after.json`, `audit-check.json`. |
| Saklama | **GEÇTİ**, test app.db: 0 profil, 7 analiz, 42 öneri raporu; tüm 42 rapor `recruitment-2`. İlk açılış ve gerçek UI iptali tercih kaydetmedi. Sentetik UI/servis testleri açık kaydetme ve sürüm korumasını ayrıca sınadı. |

İlk board yanıtı Fenerbahçe **1527ms**, Gençlerbirliği **1476ms**. Lig referansları sırasıyla **73,8 / 70,5**,
ikisinde de 18 kulüp ölçüldü. Bu yerel test ölçümüdür; sürekli performans garantisi değildir.

Kaynak daha önce alınmış `scratch/analysis-phase-c/fc_career.db` kopyasıdır. Önce/sonra SHA256:
`DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`.
API yalnız `127.0.0.1:5191` üzerinde ayrı app.db/export/log yollarıyla çalıştırıldı ve test sonunda kapatıldı.
Oyun açılmadı; orijinal kariyer dosyaları, `C:\FCExport\fc_career.db`, exporter ve script otomasyonu değiştirilmedi.
Commit yok. Mevcut çalışma ağacındaki önceki değişiklikler korundu.

## Ayrı kalan kapsam

Birden fazla transferi aynı bütçe içinde birlikte seçen satış/alış/terfi paketleri Faz D'dir; bu teslim
bireysel aday önerir. Transfer isteği/kabulü, yeni maaş, yabancı/tescil uygunluğu ve doğrulanmamış oyun içi
maç istatistikleri tamamlanmış sayılmaz. Tema seçimini uygulamanın bütününe yaymak da bu denemelerin ardından
ayrı tasarım kararıdır.
