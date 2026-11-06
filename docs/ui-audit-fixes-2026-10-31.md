# Arayüz incelemesi — ilk düzeltme grubu

31.10.2026 · `ui-yenileme` · Kaynak inceleme: [ui-audit-2026-10-31.md](ui-audit-2026-10-31.md).

## Değişiklikler

- **Scout ızgarası:** `.pc-card` yüksekliğini ezen daha özgül `height:100%` kuralı kaldırıldı.
  Yeni kontrol, kartın yalnız var olmasına değil yüz, isim ve reytinglerin kartın sınırları içinde
  kalmasına bakıyor; 1426, 1024 ve 390 piksel genişliklerde çalışıyor.
- **Kayıt seçimi:** Son okunan kaydın dalı kulüp kartında belirtiliyor. İsteğe bağlı açılan
  “Kayıt yuvaları ve arşivler” bölümünde yuva başlığı, dosya adı, yuva tarihi, dalın tarih aralığı,
  görüntü sayısı ve bilinen ebeveyn gösteriliyor. Tam kullanıcı dosya yolu API'ye eklenmedi.
  Aynı tarihli iki kayıt artık yalnız “Dal 4 / Dal 5” olarak ayırt edilmiyor.
- **Boş Akış:** İki farklı oyun günü gerektiğini ve bağlantısı doğrulanmamış diğer dalların neden
  katılmadığını açıklıyor. “Kayıt yuvalarını incele” doğrudan kariyer seçimine dönüyor.
- **Kupa geçmişi:** Mevcut kulübün tamamlanmış sezonları kayıt arşivinden listeleniyor. Lig, yerel ve
  kıtasal kupa sayıları hazır alanlardan geliyor; bilinmeyen sayılar sıfır diye gösterilmiyor.
  “İkinci sezonun export'unu bekliyor” açıklaması kaldırıldı.
- **Lig/kupa ayrımı:** Kariyer yarışma kimliği, kulübün lig tablosu kimliğiyle karşılaştırılmıyor.
  API mevcut `C<leagueId>` eşlemesinden `leagueCompetitionId` döndürüyor. Eşleme yoksa arayüz
  fikstürü kesin olarak kupa diye sınıflandırmak yerine “yarışmalar” diyor.
- **Durum ve başlıklar:** Her turnuvaya koşulsuz yazılan “SÜRÜYOR” kaldırıldı. Rakip eksikse
  “Rakip bilgisi yok” gösteriliyor. Home'un lig tablosu yerine maç gösteren kartı
  “Sonuçlar ve fikstür” olarak adlandırıldı; gerçek lig tablosu kartının adı aynı kaldı.

## Dallar için sınır

Fenerbahçe'nin bağımsız kayıt yuvalarında `parent_branch` hâlâ boş. Aynı UID, yakın tarih veya
benzer oyuncu verisi bütün geçmişin ortak olduğunu kanıtlamaz. Bu teslim ebeveyn bağı tahmin etmez,
eski veriyi birleştirmez ve kaynak DB'ye onarım yazmaz. Ebeveyni olmayan Dal 2 için geçmişin yalnız
o dalın görüntülerinden oluştuğu backend testinde korunuyor. Dolayısıyla **dal seçimi ve açıklama
iyileştirmesi tamamlandı; eski dalların güvenilir ebeveyn araştırması açık.**

## Doğrulama

| Kontrol | Sonuç / kanıt |
|---|---|
| Kart kırpılmasını yeniden üretme | Yeni geometri kontrolü düzeltmeden önce KALDI; düzeltmeden sonra üç genişlikte GEÇTİ |
| Backend | `dotnet test backend/FcMarket.Tests`: **317 geçti**, 0 başarısız |
| Kayıt okuyucu | `python -m unittest discover -s tools/saveimport/tests`: **53 geçti** |
| Görseller | `python -m unittest discover -s tools/assets/tests`: **3 geçti** |
| Arayüz tam paket | `npm --prefix frontend run test:e2e -- --workers=2`: **94 geçti, 11 atlandı** |
| Son küçük gösterim değişiklikleri | Kupa/eksik rakip, boş Akış, kariyer-dal/export ayrımı: **5 ilgili test tekrar geçti** |
| Derleme | Frontend production, API Release ve Desktop Release geçti |
| Gerçek masaüstü | Windows WebView2'de normal Scout ve 2.266 kalecilik filtreli ızgara: yüzler/isimler/reytingler tam; kompakt kariyer seçimi açıldı |
| Gerçek kupa verisi | Fenerbahçe: 4 tamamlanmış sezon, 3 lig + 1 yerel kupa; lig kimliği 68, yarışma kimliği 1512. Lig kupa listesinden çıktı |
| Kariyer geçişi | Fenerbahçe → Gençlerbirliği → Fenerbahçe; Gençlerbirliği'nde 500/1.148 haber ve tamamlanmış sezon arşivi yok açıklaması, Fenerbahçe'ye dönüşte 4 kupa/5 sezon |

Test logları `scratch/ui-audit-2026-10-31/fixes-*.log` altında. Atlanan testler gerçek veri ortamı
değişkenleri isteyen testlerdir; bu turda otomatik olarak çalışmış sayılmadı. Gerçek veri kontrolü
ayrıca masaüstü gezintisi ve yerel API üzerinden yapıldı. Son Akış düğme yerleşimi/eksik rakip
metni tarayıcıdaki ilgili testlerle doğrulandı.

Mevcut uyarılar: frontend büyük paket uyarısı; `ClubTests.cs` içindeki önceden var olan nullable uyarısı.
Oyun açılmadı; otomasyon veya kurulu Lua dosyaları değiştirilmedi. İnceleme uygulaması kapatıldı.

`C:\FCExport\fc_career.db` önce/sonra SHA-256 aynı:
`127448939cbcf6629c83f6d6ffdff81f10ac451c4f0952206c683abad2372aab`.
Uygulama verileri ve kayıt içe aktarımları `scratch/ui-audit-2026-10-31` kopyasında çalıştı.

## Commit'ler ve sonraki adım

- `051aa61`: Scout kart yüksekliği ve regresyon kontrolü.
- `5285faf`: Yuva bilgileri ve ayrı geçmiş açıklaması.
- `2f1db44`: Sezon arşivi ve doğru lig yarışması kimliği.
- `fddbc80`: Kompakt kayıt seçimi ve eksik veri metni.

Push veya main birleştirmesi yapılmadı. Sıradaki grup: Transfer satırında görünür uyum puanı,
kısa oyuncu profili ve doğrudan kıyaslama; tahmini bütçe uyumu/bonservis belirsizliğini açıklaştırma.
Bu grup daha sonra tamamlandı: [Transfer satırları teslimi](transfer-row-clarity-2026-10-31.md).
Ortak bütçeli transfer paketleri (Faz D) bundan sonra. Ham finans/ceza kodlarının kullanıcı diline
çevrilmesi ve güvenilir dal ebeveyni araştırması ayrıca açık.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
