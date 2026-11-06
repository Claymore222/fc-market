# Maç analizi: oyun açılmadan tamamlananlar ve sonraki test

30.10.2026. Bugün oyun ve Live Editor açılmadı. Oyun kaydı veya orijinal `C:\FCExport\fc_career.db`
değiştirilmedi. Exporter dosyaları ve otomasyon ayarı değişmedi; commit atılmadı.

## Bugün tamamlananlar

**İki eski export'un aktarımı düzeltildi.** `84af764b_20300725_215422` ve `84af764b_20300729_223438` için
48 kaynak dosya önce `scratch/match-prep-20261030/exports` altına kopyalandı. Her ikisinde de yalnız
`player_names.csv` dosyasının 15071. satırında, 254289 kimlikli oyuncunun adı sonundaki UTF-8 karakteri
yarım: bayt `C4`. Bozuk bayt ofsetleri 421391 ve 421372. Bütün dosyaya başka kodlama uygulamak geçerli
Türkçe/Romence adları bozardı; yapılmadı.

Okuyucu yalnız ad sonundaki bu tür yarım karakteri `�` ile görünür işaretler. Doğru harfi uydurmaz.
Sayı alanı, başlık veya isim ortası bozulduğunda kaynak hatası korunur. Aktarım atomiktir; yarım tablo yazılmaz.
Dosya/satır/alan/oyuncu/bayt uyarısı `import_warnings` içinde ve saveimport logunda saklanır. UI başarılı
ama işaretli aktarımı, başarısız kaynaktan ayrı gösterir. Eski UI/backend/watcher süreçlerinin düzeltmeyi
alması için uygulama yeniden açılmalı; orijinal DB üzerinde bu turda elle importer çalıştırılmadı.

Gerçek kopyalarla sonuç: **2 export, 0 hata, 2 metin uyarısı**. Kaynak kopyalarının 48/48 SHA-256'sı aynı.
`scratch/match-prep-20261030/export-recovery.json` kanıtında iki işaretli ad ve sıfır hata bulunur.

**İlk maç analizi ekranı eklendi:** Home → **Maç analizi** (`/matches`). Son 5/10/20 maç, yarışma filtresi,
form (G/B/M), atılan/yenilen gol, gol yemeden biten maçlar ve maç başına gol. Sonuçlar en yeni maçtan başlar;
skor daima kullanıcı takımının açısından gösterilir. Penaltı galibi çıkarılmaz. Hazırlık turnuvası dahil olduğu
açıkça yazılıdır; yarışma seçimiyle ayrılır. Veri yokken sıfır istatistik üretilmez.

API aynı kariyer/dalın seçili günden ileri olmayan gerçek oyun kaydı bloklarını okur. Günlük export'un devraldığı
blokları yeni gözlem diye göstermeyip son gerçek kayıt gününü verir. Eski kaynak kullanılıyorsa UI iki tarihi
açıklar. Gelecek fikstür, oynanmamış skor, başka takım ve tekrar satırları özet dışında kalır.

**İlk veri araştırması yapıldı.** Kayıt kopyasında fikstür ve sezon oyuncu toplamları zaten var. Kopyalanan
25 Temmuz export'unda 23 Temmuz'a ait 12; 29 Temmuz export'unda 23 ve 27 Temmuz'a ait toplam 24
`career_playermatchratinghistory` satırı var. Alanlar tarih, dakika, oyuncu, yer ve puan. Bunlar puan ölçeği/kapsamı
oyun ekranıyla doğrulanmadan yeni bir maç değerlendirme modeli olarak sunulmadı.

Topla oynama, pas yüzdesi, şutlar, xG ve golcü/asist listesi için doğrulanmış maç bazlı kaynak henüz yok.
Sezon toplamından belli maça golcü atanmıyor. Eski maçın ayrıntısı kayıtta tutulmuyorsa geriye dönük yeniden
üretilemez. İleride tek maçla sınırlandığı kanıtlanmış iki gözlem arasında sezon toplamı farkları değerlendirilebilir;
birden fazla maç, sezon değişimi, transfer veya tutarsızlık varsa o maça atama yapılmaz.

## Test kanıtları

| Kontrol | Sonuç |
|---|---|
| Backend | **GEÇTİ** — 214/214. Yeni 9 test: skor yönü/0–0, filtre/aralık, tekrar/gelecek/eksik/başka takım, kaynak günü ve dal yalıtımı, günlük devralma, uyarı/hatayı ayırma. |
| Saveimport | **GEÇTİ** — 53/53. Yeni 4 regresyon: yarım UTF-8 ad + geçerli aksanlı adın korunması, sayı bozulması, isim ortası bozulması, başlık bozulması. |
| Assets | **GEÇTİ** — 3/3. |
| Playwright bütünü | **GEÇTİ** — 54 geçti, 7 ortama bağlı test atlandı. Yeni 4 test: filtre/sıfır sonuç, eski kaynak/kariyer geçişi, hata/boş durum, 390 px/klavye/reduced motion ve metin uyarısı. |
| Gerçek kariyer UI | **GEÇTİ** — ayrı koşuda `matches-real.spec.ts` 1/1; bu test standart koşuda atlanan opsiyonel testlerden biridir. Sayfa yenileme ve 390 px kontrol edildi. |
| Üretim build | **GEÇTİ** — TypeScript/Vite. Mevcut büyük paket uyarısı ve eski ClubTests nullable uyarısı sürüyor. |
| Kaynak koruma | **GEÇTİ** — 48 export kopyası değişmedi. Oyun kayıtlarına/orijinal DB'ye yazılmadı; test API'si scratch app.db/watchlist kullanır. |

Gerçek UI kontrolü önceki testten kalan ayrı DB kopyasında yapıldı:
`scratch/sync-resilience-20261029-204430/fc_career.db`, Fenerbahçe, dal 3, 28.07.2030, revision 1.
Sonuç: Wolves 4–2 (27.07), Hoffenheim deplasmanı 1–0 (23.07), Bournemouth 3–0 (19.07).
Özet **3G/0B/0M, 8:2 gol, 2 maç gol yemeden, maç başına 2,67 gol**.
Test kopyasındaki eski sentetik `TEST_UNSAVED_FUTURE` önizlemesi ve bozuk kaynak uyarısı bu testin maçı değildir.

Kanıtlar `scratch/match-prep-20261030/`: `encoding-audit.json`, `export-recovery.json`, `real-import.log`,
`match-data-audit.json`, `backend-full.log`, `python-tests-final.log`, `assets-tests.log`, `ui-full.log`,
`real-ui.log`, `build.log`, `real-matches.json`, `matches-desktop.png`, `matches-mobile.png`.
Kariyer kopyasının test sonrası SHA-256'sı öncekiyle aynı: `DFB098CCFA5EAD692E136E4E6A50E03FB258D32FE4AE02C214ED46BA103C0CB1`;
kanıt `career-hash-after.json`. Test API'si kapatıldı.

## Yarın oyunda yapılacaklar

Planlanan oyun kontrolü: **31 Ekim 2026**, kullanıcı oyunu açabildiğinde.

Yalnız **Gençlerbirliği test kariyeri**, çevrimdışı. Otomasyonu açmak gerekmez. Diğer kariyerlerin üzerine kayıt yok;
transfer/sözleşme/oyuncu düzenlemesi yok. Aşağıdaki işlemler bugün yapılmadı.

1. **Maç öncesi:** Gençlerbirliği'ni yükle, oyun tarihini ve sıradaki rakibi not et. Ayrı bir test yuvasına
   `FCMarket_Mac_Oncesi` adıyla kaydet. F8 → Features → Lua Engine üzerinden `fc_export_manual.lua` çalıştır.
   Kariyer tarihi, kadro ve maç öncesi istatistik ekranı görüntülerini al.
2. **Tek bir maçı normal oyna.** İlk kontrol simülasyonla yapılmasın. Son düdükte istatistik ekranından
   ayrılmadan takım istatistikleri, oyuncu performansı ve olay/gol listelerini görüntüle. Topla oynama,
   başarılı/toplam pas veya pas yüzdesi, şut/isabetli şut, varsa xG, golcü/asist ve dakika/puan görünür olsun.
   Birden fazla sekme gerekiyorsa her sekmenin görüntüsünü al.
3. **Maç sonunda, kariyere devam etmeden:** Ekran izin veriyorsa aynı manuel export'u bir kez daha çalıştır.
   Böylece maç ekranındaki geçici veriler ile kariyer hub'ına dönüş sonrası veri ayrılabilir. LE'de veri düzenleme yok.
4. **Kariyere dön:** Başka maç/gün ilerletmeden ayrı `FCMarket_Mac_Sonrasi` yuvasına kaydet ve manuel export'u
   tekrar çalıştır. FC Market'teki tarih/sonuç ile oyun ekranını karşılaştır. Sonra yalnız test kariyerini
   yeniden yükleyerek skor ve oyuncu istatistiklerinin kalıcılığını kontrol et.

Bu üç export ve iki kayıt **önce kopyalanarak** karşılaştırılacak. Amaç maç bazlı gol/asist/dakika/puan ile
topla oynama/pas/şut/xG'nin dosyada mı, yalnız maç ekranında mı bulunduğunu ayırmak. İsim/meta benzerliği,
alanın gerçekten güncel maça ait olduğunun kanıtı sayılmayacak. İleride maç sonu ekranından aktarım gerekirse
ayrı kapsam olarak hazırlanacak; otomatik günlük export zorunluluğu getirilmeyecek.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
