# Kayıt/export ayrımı ve aktarım dayanıklılığı — 29.10.2026

Önceki inceleme: [sync-edge-cases-2026-10-29.md](sync-edge-cases-2026-10-29.md).
Bu teslim oradaki geri dönüş, bozuk export ve aynı-ID yenileme açıklarını giderir.

## Kullanıcı davranışı

- Kariyerin normal görünümü **son başarıyla okunmuş oyun kaydını** gösterir. Aynı kariyerde birden fazla yuva
  varsa dosyanın yazılma zamanı en yeni olan kayıt kullanılır. Oyunun otomatik kayıtları da gerçek kayıttır.
- Kayıtla eşleşmeyen yeni export ana görünümü ileri taşımaz. Tarihiyle birlikte **Export’u incele** seçeneği
  sunulur. Önizlemede kayıtla doğrulanmadığı belirtilir; **Kaydedilmiş kayda dön** ana görünüme döndürür.
- Önizleme düğmesiyle açılan dal yeniden açılış için varsayılan olarak saklanmaz. Kariyer seçicisindeki açık
  dal seçimi arşiv görünümüdür; ileri tarihli eski oturumlar silinmez ve kaydedilmiş gibi sunulmaz.
- Kayıt hiç okunmadıysa export tek kaynak olarak kullanılabilir; arayüz bunun kayıtla doğrulanmadığını belirtir.
- Kayıt 17'sinde, kaydedilmemiş export 20'sindeyse ana görünüm 17'sinde kalır. Eski dosyanın aynı baytları tekrar
  okunduğunda da kayıt işaretçisi yenilenir. Tarihte aynı veriyle geriye dönen yeni export ayrı dalda tutulur.
- Aynı gün farklı kaydedilmiş baytlar ayrı snapshot olarak korunur. Aynı gün farklı export, kaydın üzerine
  yazılmaz. Eski sürümde birden fazla save hash'i aynı snapshot'ı paylaşmışsa mevcut dosyanın kopyasından yeniden
  oluşturulur; eski hash'e işaret edip daha sonra üzerine yazılmış veriyi göstermekten kaçınılır.
- Grafik, haber ve sezon geçmişi seçili snapshot'ta kesilir; kaydedilmemiş gelecekteki tam/günlük snapshot'lar
  normal görünümün geçmişine sızmaz. Dal kimliği olmayan eski event'ler çok dallı kariyere tahminen atanmaz.
  Fikstür bloğu başka bir daldan ödünç alınmaz.

Uygulama oyun kapanışını/belleğini izleyerek “kaydetmeden çıktı” kararı vermez. Kaydedilmiş durum ile export'u
ayırarak bu belirsizliği yönetir. Aynı UID ve aynı kayıt başlıklı ayrı yuvaları ayırt etme sınırı sürüyor.

## Aktarım hataları

- Her export ve kayıt için ayrı SQLite savepoint vardır. Bozuk kaynak geri alınır; sağlam kaynaklar aktarılır.
- Eksik CSV/meta, yarım veya bozuk JSON, hatalı başlık/satır, metadata kimlik çelişkisi ve sayısal taşma ayrılır.
- Hata `import_issues` içinde kalır, arayüzde açılabilir ayrıntılarla gösterilir. Kaynak dosyası taşınmaz/silinmez;
  sonraki taramada yeniden denenir. Düzeltildiğinde veya manifest'ten kaldırıldığında hata temizlenir.
- Başlangıç aktarımında hata olsa da masaüstü mevcut verilerle açılır ve izleyici yeniden dener.
- “Kayıt dosyası ekle” yalnız seçilen kaydı aktarır; başka bir bozuk export geçerli dosyaya yanlış hata verdirmez.
- Hiç kayıt yokken de aynı birleşik importer kullanılır. Sonradan oluşturulan kayıt klasörü ve geçici olarak
  bulunamayan eklenmiş dosyalar izleme kapsamından çıkmaz.
- Kopyadan sonra oyun ikinci kez kaydederse izleyici yeni yazımı görülmüş saymaz; sonraki tarama onu işler.
- Seçili kariyerin snapshot ID'si **ve revision'ı** izlenir. Aynı güne birleşen veri değişikliği açık ekranın
  sorgularını yeniler; başka kariyerin güncellemesi seçili kariyerin verisi yerine kullanılmaz.

## Veri sözleşmesi ve geçiş

`tools/saveimport` açılışta eski DB'ye `save_heads` ve `import_issues` tablolarını ekler. Mevcut oyun kayıtları
ilk taramada kopyalanıp okununca `save_heads` doldurulur; bilinen hash'ler yeniden ham tablo aktarımı gerektirmez.
API DB'yi salt-okunur açar. `GET /api/sync?saveUid=...` seçili görünüm, son kayıt, doğrulanmamış export ve hataları
döndürür. Eski, henüz geçirilmemiş DB'ler mevcut dal davranışıyla okunmaya devam eder.

`exporter/` değiştirilmedi. Oyun kayıtlarına ve `C:\FCExport\fc_career.db` dosyasına bu çalışma sırasında
yazılmadı. Gerçek veri denemesi salt-okunur DB bağlantısından alınmış kopyada, kayıt okuyucu ise önce aldığı
dosya kopyasında çalıştı. Normal kullanımda kariyer DB'sine yazma yalnız importer'ın işidir.

## Doğrulama

| Kontrol | Sonuç |
|---|---|
| `dotnet test backend/FcMarket.Tests --no-restore` | GEÇTİ — 175 test; mevcut ClubTests.cs:567 nullable uyarısı. |
| `python -m unittest discover -s tools/saveimport/tests` | GEÇTİ — 46 test; geri dönüş, aynı gün farklı baytlar, bilinen hash, eski DB onarımı, hata yalıtımı/iyileşmesi ve export-only CLI dahil. |
| `python -m unittest discover -s tools/assets/tests` | GEÇTİ — 3 test. |
| `npm --prefix frontend run test:e2e` | GEÇTİ — 42 test, 5 yerel veri isteyen test varsayılan çalıştırmada atlandı. |
| İzole gerçek veri Playwright | GEÇTİ — `tests/sync-real.spec.ts`, 1 test; önizleme/geri dönüş/reload, gerçek kadro, 390 px, JS hata listesi boş. |
| TypeScript / frontend üretim build | GEÇTİ — üretim build 0; mevcut büyük chunk uyarısı. İlk build'de Node Windows kapanış assertion'ı oldu; çıktı dosyasına yönlendirilmiş tekrar build'ler 0 ile tamamlandı. |
| API / masaüstü Release build | GEÇTİ — 0 hata, 0 uyarı. Masaüstü başlangıç hata akışı kod/build düzeyinde kontrol edildi; bu teslimde native pencereyle oyun testi yapılmadı. |

Gerçek veri kopyası: `scratch/sync-resilience-20261029-204430/report.json` ve `fc_career.db`.
Kaynak kayıt: `CmMgrC20261029220804222`, UID `84af764ba0d247f880ccc658a7e0c7a`, **28.07.2030**.
Kopyaya eklenen **TEST_UNSAVED_FUTURE / 31.07.2030** ve hata kaydı sentetik test verisidir; gerçek kariyer ilerletilmedi.
DB `integrity_check=ok`, normal görünüm 28'inde, açık önizleme 31'inde kaldı. API 5189'da yalnız test için açıldı.

Görsel kanıt:

- `scratch/sync-resilience-ui/saved-checkpoint-desktop.png`
- `scratch/sync-resilience-ui/export-preview-mobile.png`

## Günlük kullanım

Uygulama kapalıyken oynayabilirsin. Oturum sonunda kariyerde `fc_export_manual.lua`yı çalıştır, bitmesini bekle,
aynı durumda **kaydet ve çık**; FC Market'i açıp kariyerini seç. Görseller gerekiyorsa `fc_assets.lua` isteğe bağlıdır.
Sadece kaydettiysen kayıt verisi yine gelir; export ek etiket/veri sağlar. Her gün script çalıştırmak gerekmez.

Yeni sürümü açmak: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
