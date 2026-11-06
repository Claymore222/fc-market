# Senkron sınır durumları — 29.10.2026

**Bu ilk incelemenin ardından sağlamlaştırma uygulandı.** Güncel davranış ve test kanıtı:
[sync-hardening-2026-10-29.md](sync-hardening-2026-10-29.md). Aşağıdaki tablo düzeltme öncesini kaydeder.

Kullanıcının sorusu: uygulama kapalıyken oynama, sonradan manuel export, kaydetmeden çıkma ve eski kayda
dönüşte gösterilen veri. Üretim kodu değiştirilmedi. Oyun kayıtlarına/gerçek kariyer veritabanına yazılmadı.
Denemeler uydurma oyuncu verisiyle bellek SQLite ve geçici klasörlerde yapıldı.

## Normal kullanım

Uygulamanın oyun sırasında açık olması zorunlu değil. Oyunda kaydet, aynı oyun durumunda
`fc_export_manual.lua` çalıştırıp tamamlanmasını bekle, ardından oyunu kapat ve masaüstü FC Market'i aç.
Masaüstü açılışta kayıtları ve tamamlanmış export'ları içe aktarır; kariyer seçildikten sonra gösterir.
`fc_assets.lua` görsel ihtiyacı için isteğe bağlıdır; her oyun oturumunda çalıştırmak gerekmez. Görseller,
uygulama açıldıktan sonra dönüştürülür. Tarayıcıdaki Yenile yalnız API verisini yeniden ister; importer başlatmaz.

Export oyun belleğinin o anını, CmMgrC kaydı diske kaydedilmiş durumu temsil eder. İkisi aynı şey değildir.
Arada uygulama/export kapalıysa her günlük değişimin zamanını sonradan eksiksiz çıkarmak mümkün değildir.

## Doğrulanan davranış ve açıklar

| Senaryo | Sonuç |
|---|---|
| Kayıt 17 Temmuz; kaydetmeden ilerleyip 20 Temmuz tam export; çıkış | **OTOMATİK GERİ DÖNÜŞ YOK.** 20'sindeki veri durur. Kaydetmeden çıkıldığına dair bir bildirim alınmıyor. |
| Aynı eski kayıt yeniden taranır | İçerik/yuva anahtarı zaten işlendiği için atlanır; görünüm 20'sinde kalır. |
| 17'sine dönüp eski kayıtla aynı veriyi yeniden export etmek | **AÇIK:** eski snapshot'a birleşir; yeni gözlemin zamanı aktif dal/tarih seçimine taşınmaz. Görünüm yine 20'sinde kalabilir. |
| 18'ini farklı oyuncu verisiyle yeniden oynayıp export etmek | Yeni dal açılır; varsayılan seçim son gözlemlenen dalın 18'indeki ucunu gösterir. 20'sindeki eski dal arşivde kalır. Kullanıcı belli bir dala sabitlemişse seçim korunur. |
| Farklı UID / farklı başlıklı kayıt yuvası | Mevcut testlerde ayrı tutulur. Aynı UID ve aynı kayıt başlıklı ayrı dosyaların kimliği kesin ayrılamaz. |
| Aynı snapshot tekrar aktarılır | Kaynak anahtarıyla tekrar aktarılmaz. |
| Bozuk kariyer dosyası | Okuma hatası raporlanır, diğer kayıtlar işlenebilir; oyun dosyasına yazılmaz. |
| Kopyalanırken değişen kayıt | Boyut/zaman kontrolüyle reddedilir ve izleyicide sonraki taramada tekrar denenir. |
| Manifest'te tamamlandı görünen export'un CSV'si eksik | **AÇIK:** tüm aktarım işlemi geri alınır. DB integrity_check=ok; fakat aynı hatalı kayıt sonraki aktarımı da engeller. Başlangıç import'u hata verdiğinden masaüstü hata ekranında kalabilir. |
| Aynı snapshot'ın revision'ı değişir | **KOD İNCELEMESİ:** frontend otomatik yenileme bildirimi yalnız snapshotId karşılaştırıyor. Aynı gün aynı ID'ye birleşen güncelleme otomatik yenilenmeyebilir; Yenile yeniden sorgular. Bu senaryo bu incelemede tarayıcıda ayrıca denenmedi. |

Tam export dosyaları `C:\FCExport` altında ve içe aktarılmış snapshot'lar DB'de kalır; kaydetmeden çıkış bunları
otomatik silmez. Kayan günlük partial snapshot ayrı davranır: önceki günlük kopya değiştirilir, player_daily
geçmişi korunur. Ham kayıt kopyalarının saklanması ayrı: runner varsayılan en yeni 10 yedeği tutar.

## Kanıt

- `scratch/sync-scenarios-2026-10-29.py`: 17 → kaydedilmemiş 20 → değişmemiş 17, aynı eski veriyi yeniden
  export ve farklı verili 18'e dönüş; aktif seçim CareerDb.LatestSnapshot SQL sırasıyla taklit edildi.
- Aynı araçta geçici manifest: geçerli export + eksik CSV'li export. Hata sonrası snapshot sayısı **0**,
  `PRAGMA integrity_check = ok`. Hatalı satır çıkarılınca geçerli export sayısı **1**.
- `python -m unittest discover -s tools/saveimport/tests`: **34 başarılı**.
- `dotnet test backend/FcMarket.Tests --no-restore --filter FullyQualifiedName~BranchTests`: **11 başarılı**.
- Kaynaklar: `tools/saveimport/runner.py run_once`, `store.py import_data/save_branch/import_save/import_exports`,
  `reader.py backup_save`, `backend/FcMarket.Api/Data/CareerDb.cs LatestSnapshot`, `frontend/src/App.tsx Banners`,
  `desktop/FcMarket.Desktop/Program.cs StartAsync`.

Bu sonuçlar temel korumaların çalıştığını, kaydedilmemiş ilerleme yönetiminin ise tamamlanmadığını gösterir.
Sonraki iş: kaydedilmiş kayıt ile yalnız export'tan gözlemlenen durumu açık ayırmak, eski snapshot'la eşleşen
yeni gözlemi aktif seçimde izlemek, hatalı export'u diğerlerini durdurmadan ayırmak ve revision değişiminde
arayüzü yenilemek. Bu dosya bunların uygulanmış olduğunu iddia etmez.
