# FC Market — durum ve yol haritası

Son güncelleme: 31 Ekim 2026. Tek plan belgesi budur; ayrıntılar: [data-dictionary.md](data-dictionary.md) (alanlar,
doğrulamalar), [save-import.md](save-import.md) (kayıt formatı, senkron), [career-mods.md](career-mods.md) (oyuna yazma).

## Ürün hedefi

CMTracker'ı görsel başlangıç alan, Windows'ta çalışan, kariyer verisini doğru gösteren yerel bir futbol yönetim
yardımcısı: **kariyerimi seç → kadromu incele → oyuncu bul → karşılaştır → izle → oyunda ilerledikçe değişimi gör.**

Sıra: (1) salt-okunur uygulama, (2) güncel senkron, (3) en son kontrollü oyun yazımları. Salt-okunur = oyuna yazmamak;
uygulamanın kendi shortlist/not/ayarları serbest.

## Şu an ne var

| Alan | Durum |
|---|---|
| Arayüz | Tek üst bar, bugünün özeti ve tek tek açılan bölümlerle Home (9 bölüm), Squad, Youth, Trophies, Scout (oyuncu/takım), İzleme, Akış, oyuncu detayı |
| Temalar | Ayarlar → Görünüm: Mavi Cam (varsayılan), Gece Tribünü, Mor Gece, Buz Camı, Krem Defter, Beyaz Stüdyo. Tüm uygulamaya uygulanır, seçim `app.db`'ye yazılır (`/api/settings/theme`), ilk kare için tarayıcıda önbelleklenir. Renkler `frontend/src/palette.css`, liste `frontend/src/lib/theme.ts`; veri anlamı taşıyan renkler sabit. Yeni tema: palette.css'e blok + theme.ts'e satır |
| Görseller | Oyunun kendi yüz/arma/bayrakları (`fc_assets.lua` + `tools/assets`); 36 oyun stilinin EA kaynaklı normal/+ rozetleri yerel pakette |
| Veri kaynakları | Live Editor export'u (`fc_export.lua` 0.5.0) + kariyer kaydı okuyucusu (`tools/saveimport`), tek veritabanında birleşik; her kayıt yuvası ayrı kariyer/dal |
| Kayıttan gelen | Fikstür ve skorlar, canlı lig tablosu, oyuncu sezon istatistikleri, menajer ödülleri, akademi, gözlemciler, **dünya ve kullanıcı kulübü transfer geçmişi (bonservis, haftalık maaş, serbest kalma bedeli) + sezon bazlı kalıcı transfer arşivi (`career_transfer_archive`)** |
| Senkron | Masaüstü kayıtları 10 sn'de bir izler; ana görünüm son okunmuş oyun kaydıdır. Doğrulanmamış export ayrı önizlemedir; bozuk kaynaklar diğer aktarımları engellemez. LE otomasyonu mevcut kurulumda kapalı, `fc_export_manual.lua` elle çalışır |
| Otomasyon ayarları | Üst çubuk ve kariyer seçicisinden LE klasörü seçimi, günlük autorun aç/kapat, manuel export ve görsel script kur/kaldır; özel dosyalar korunur. Bellekteki eski otomasyon için oyun yeniden açılır veya manuel script çalıştırılır |
| Loglar | Her FC Market Lua script'i için logs/lua altında ayrı tarihli dosya; uygulama/API/saveimport/assets logs/app altında ayrı. Başlangıç-bitiş, UTF-8 çıktı ve hata stack'i; 34 kurulu Lua kopyası loglu, otomasyon kapalı |
| Oyuncu detayı | 3.894 gerçek transferle kalibre değer modeli, son transfer şeridi (tarih, önceki kulüp, gerçek bonservis), roller (+/++), oyun stilleri, hızlanma tipi, vücut tipi, duygu durumu, sezon istatistikleri, günlük gelişim geçmişi |
| Ek oyuncu bilgileri | Serbest oyuncunun kayıttaki maaşı (aktif maaştan ayrı), 7 alandan tüm mevkiler, krampon/tasarım/renk ve eldiven kodları; ekipman ürün adları DOĞRULANACAK |
| Kadro analizi — Faz A/B/C | Transfer → Takım planı: profil ve bütçe, bağımsız derinlik/ihtiyaç sahası. TRANSFER doğrudan önerilerle açılır: takım/lig/bütçe bağlamı, 12 mevki, ilk 11/yedek/genç, varsayılan 5 aday, puan ve kısa profil notları, karşılaştırma/izleme. İsteğe bağlı sıralı tercih kartları. İstenen fiyat bilinmiyorsa üretilmez; gözlenen son transfer veya etiketli değer modeli yalnız ön eleme referansıdır |
| Transfer paketi — Faz D | Adaydan Pakete ekle → Transfer paketim: ortak bonservis/haftalık maaş, koşullu satış, akademi terfisi, diziliş ve bağımsız önce/sonra derinlik. Hesapla/kaydet ayrıdır; kariyer/dal/mod ve sürüm korumalı. Bilinmeyen maliyetler sıfır olmaz. Paket öner düğmesi Düşük harcama / Dengeli / Yüksek katkı seçenekleri hazırlar, hesaplanmış taslakla yan yana gösterir; taslağa almak kullanıcının seçimidir. Olası maliyet aralığı varsayımdır, kalibrasyon bekliyor |
| Kulüp incelemesi | Scout → Takımlar → İncele: herhangi bir takımın kayıtlı dizilişi ve oyun tarzı, lige göre kadro derinliği ve "gidersen ilk işin" ihtiyaçları, kulüp değerinden tahmini sezon başı bütçe (5 gerçek bütçeye kalibre), kendi kulübünle kıyas. Ayrıntı: data-dictionary *Kulüp incelemesi*. |
| Transfer ekranı | TRANSFER sade tek akış: bir cümlelik öncelik, bütçe satırı, kadro içi ve sözleşme satırları, lig kıyası ve sözleşme riskiyle sıralı mevkiler, oyuncu satır listesi. Veri yetersizse koşullu, takviye gerekmiyorsa açık ifade |
| Öneri mantığı | Mevki reytingi, beklenen maaş (tahmin), erişilebilirlik elemesi, yaş sınırlı gelişim puanı; bütçe üstü oyuncular ayrı bölümde. [Kurallar ve kanıt](recruitment-logic-fix-2026-10-30.md) |
| Maç analizi — ilk sürüm | Home → Maç analizi: son 5/10/20 maç, yarışma filtresi, G/B/M, gol dengesi, gol yemeden biten maçlar ve gol ortalaması. Gerçek kayıt kaynağı/tarihi görünür; pas/topla oynama ve maç golcüleri henüz doğrulanmadı |
| Scout filtreleri | Maaş aralığı, serbest/kulüplü, kalan sözleşme yılı, zayıf ayak/beceri, rol +/++, oyun stili/+ ve isteğe bağlı ek mevkiler; URL'de kalıcı |
| Oyuncu kartları | Kadro ve Scout ızgarası CMTracker kart ölçülerinde: bayrak zemini, arma, forma no, tüm mevkiler; renkler temadan |
| Scout görünümü | Pozisyon filtresi grup düğmeleri ve sahaya göre dizili ızgara. Masaüstünde mevcut pencere genişliğini kullanır; yuvarlak tablo/filtre köşeleri ve scroll çerçevesi düzeltildi. Yalnız GK filtresinde beş kayıtlı kaleci özelliği otomatik öne gelir, sütun tercihleri değişmez. Kaleci detayında üst özet; Trophies sayfasında kulüp toplamları sürekli açık |
| Kariyer arşivi | Kayıttan geçmiş sezonlar, toplam menajer karnesi, iş güvencesi, lig hedefi/durumu ve 23 finans kategorisinin sezon toplamları; DOĞRULANACAK, kanıt: [scout-career-data-2026-10-29.md](scout-career-data-2026-10-29.md) |
| Doğrulama | Kayıt okuyucu export'la %100 aynı; lig fikstürü = puan tablosu (3 kayıt); 17.07.2030 fikstür ve sezon liderleri CMTracker'la aynı |

CMTracker eşdeğerliği kabaca %85–90; eksiklerin çoğu kayıtta çözülmemiş bloklar.

29 Ekim görsel güncellemesi: kariyer başlığı/sekmeler, Home kartları ve takvim, kadro/saha hover, sayfa içinde oyuncu
detayı, altyapı, kupalar ve Scout yerleşimi uyarlandı. Gerçek veri, kariyer geçişi ve test kanıtları:
[ui-reference-review-2026-10-29.md](ui-reference-review-2026-10-29.md). Sayısal veri eşdeğerliği ile piksel eşitliği ayrı değerlendirilir.

29 Ekim ek güncelleme: otomasyon paneli, 72 orijinal PlayStyle rozeti ve eski CF mevkiinin kaldırılması.
Kullanım, dosya davranışı, kaynak ve test kanıtı: [automation-playstyles-2026-10-29.md](automation-playstyles-2026-10-29.md).

29 Ekim manuel kullanım: oyun içi autorun iki kurulumda kapatıldı, otomasyonsuz manuel export kuruldu; kayıt
izleme devam ediyor. Başlangıç mod’larının envanteri ve eski yıldız adayı kayıtlarının değerlendirmesi:
[manual-export-and-starter-scripts-2026-10-29.md](manual-export-and-starter-scripts-2026-10-29.md).

## Yol haritası

Arayüz incelemesi ve sıradaki tasarım planı: [ui-review-plan-2026-10-31.md](ui-review-plan-2026-10-31.md).

31 Ekim gerçek masaüstü incelemesi ve ilk düzeltmeler: [bulgular](ui-audit-2026-10-31.md),
[teslim ve testler](ui-audit-fixes-2026-10-31.md). Scout kart kırpılması, kupa sezon geçmişi,
lig/kupa kimlik ayrımı ve Home başlığı düzeltildi; kayıt yuvaları anlaşılır hale getirildi.
Eski dalların ebeveyn bağı araştırması açık. Transfer'de görünür uyum/profil/kıyaslama ve maliyet
belirsizliğinin açık gösterimi de tamamlandı: [teslim ve testler](transfer-row-clarity-2026-10-31.md).
Faz D'nin elle düzenlenen ortak bütçeli planı da tamamlandı: [teslim ve testler](transfer-packages-2026-10-31.md).
Sıradaki parça düşük harcama/dengeli/yüksek fayda alternatiflerini otomatik üretme ve maliyet aralıkları.

30 Ekim log düzeni ve doğrulama: [script-logging-2026-10-30.md](script-logging-2026-10-30.md).

30 Ekim genel renk güncellemesi: kullanıcının seçtiği Mavi Cam'ın gece tonları tüm gerçek sayfalara uygulandı.
Kapsam, merkezi palet ve testler: [moonblue-app-palette-2026-10-30.md](moonblue-app-palette-2026-10-30.md).
Scout genişliği/GK önceliği ve sürekli açık kupa toplamları:
[scout-width-and-trophy-fixes-2026-10-30.md](scout-width-and-trophy-fixes-2026-10-30.md).

★ = oyunda kullanıcının yapması gereken bir adım var.

### Öncelikli çalışma: Home ayrıntı tamamlama (29 Ekim isteği)

İnceleme kanıtı: [home-detail-audit-2026-10-29.md](home-detail-audit-2026-10-29.md).
Bu bölüm uygulama planıdır. Rol ve ilk 11 hover teslimi tamamlandı:
[uygulama ve test kanıtı](hover-details-2026-10-29.md). Diğer kartların araştırması aşağıdaki sırada bekliyor.

1. **Referansı sabitle:** Fenerbahçe 17.07.2030 export'u, aynı gün kayıt kopyası ve CMTracker karşılaştırılır.
   Güncel 24 Temmuz verisiyle tarihten kaynaklanan değişimler hata sayılmaz. Kontrol aracı yeniden kullanılabilir
   olduğunda rol hover'ı, ilk 11 yedek önizlemesi, Trophies ve “Show all” pencereleri ekran görüntüleriyle ölçülür.
   Hover alternatiflerinin hangi oyuncuları ve hangi sırayla gösterdiği varsayılmaz.
2. **Roller ve ilk 11 hover — TAMAMLANDI:** Rol adı/açıklama/mevki/+ ve ++ bilgisini ortak balonda göster; fare, odak,
   dokunma ve Escape destekle. Saha önizlemesine kadrodan uygun yedek/rezerv havuzunu geçir; referansın
   uygunluk/sıralama kuralını doğrulayarak uygula. İlk 11 oyuncusunu yedek diye listeleme, aynı oyuncuyu tekrarlama.
   Pozisyon puanı tahminse etiketle; oyuncuya tıklama ve geri dönüş konumu korunsun.
3. **Kupalar ve sağlık verisinin doğruluğu — TAMAMLANDI (29.10, ceza/kart açık):** Sabit kulüp sayaç farkından “henüz kupa yok” sonucu çıkarma.
   Kariyer kazanımları, güncel yarışmalar ve kulübün tarihi toplamlarını ayrı modelle. Önce kayıtta açık sezon/kupa
   alanlarını doğrula. Sakatlık/fitness/tedavi/dönüş ve ceza/kart sayılarını güncel kariyer kaynağından araştır;
   mevcut LE işareti ve boş ceza tablosu yeterli değil. Kaynak yok ile gerçekten sıfır ayrı gösterilsin.
4. **Kulüp ve finans — TAMAMLANDI (29.10; tür 3/22 adları açık):** Hazır 23 kategori verisini Home özetine getir; bütçe ve haftalık maaş grafikleri,
   kategori listesi ve ortalanmış ayrıntı penceresi. Son hareketler sezon toplamı yerine kullanılmaz.
   Kulüp değeri/para birimi ve sezonluk/haftalık maaş birimleri kontrol edilir. Mevcut kulüp alanları korunur.
5. **Menajer ve yönetim — KISMEN (29.10; kupa/Avrupa hedefi, menajer maaşı, final sıra açık):** İş güvencesine durum ve doğrulanmış başlangıca göre değişim ekle. Lig/kupa/Avrupa
   için asgari ve istenen hedefler, durum ve basamak gösterimini çöz. Karnede hazır büyük alış/satış alanlarını
   kullan; maaş/kazanç/zorluk/devre süresi ve kariyer rekoru için kaynak araştır. Sezon tablosuna lig, doğrulanmış
   final sıra ve sezon kupalarını ekle; tamamlanan sezonları güncel sezondan ayır. Hedef başarısından kupa uydurma.
6. **Altyapı ve gözlem — KISMEN (29.10; 10. genç ve GTN gözlemcileri kayıtta yok):** 9/10 genç farkının kayıt kapsamını araştır. Mevcut tier/belirsizlik/akademide ay
   alanlarını değerlendir. Akademi ve ana takım/GTN gözlemcilerini ayır; işe alınmış/alınabilir, görev ülkesi,
   görev/dönüş/yenilenme tarihlerini kaynak varsa göster. Ödül yarışındaki kulüp adayları ile oyuncu ödülleri
   ayrı kavramlar olarak ele alınsın; mevcut geçen sezon liderleri yeniden kullanılabilir.
7. **Her aşama için bitiş:** Alanı config + data-dictionary'ye kaynak/birim/DOĞRULANACAK notuyla yaz;
   uygun backend/Python testlerini ve Playwright kontrollerini çalıştır. Aynı tarih referansı, Gençlerbirliği,
   kariyer/dal geçişi, reload, 390 px, hover/focus/Escape ve azaltılmış hareket doğrulansın.
   Araştırma alanı çözülemezse kesin olmayan değer eklemek yerine kaynağı eksik alan açıkça raporlansın.

İlk teslim hover'lar ve yanlış boş/sıfır ifadelerinin ayrıştırılması; ardından hazır verilerin ayrıntılı gösterimi.
Tersine mühendislik ayrı, en fazla bir iş günü süren araştırma dilimleriyle yürütülür; her dilim sonunda aday
alanlar, karşılaştırma sonucu ve çözülemeyenler yazılır. `exporter/` değişikliği gerekirse mevcut kurala göre
ayrıca ele alınır; bu plan oyun kayıtlarına veya oyuna yazım içermez.

### 1. Sağlamlaştırma (kısa)
- **TAMAMLANDI (30.10) — masaüstü siyah ekran:** İki gerçek WebView2 dump'ında `RTSSHooks64.dll` access violation
  bulundu. RTSS açıkken yalnız FC Market'te uyumlu yazılımsal görüntüleme; WebView süreç hatası logları,
  sınırlı otomatik toparlanma ve kullanıcı tekrar denemesi eklendi. React hataları da görünür kurtarma ekranına düşer.
  [Neden ve test kanıtları](black-screen-fix-2026-10-30.md).
- **TAMAMLANDI (30.10) — iki eski export'un kesik UTF-8 isim karakteri:** Yalnız oyuncu adı sonundaki yarım karakter
  görünür `�` ile işaretlenerek okunur; diğer bozulmalar hata kalır. Başarılı aktarım uyarıları başarısız kaynaklardan ayrı.
  Kaynaklar değişmez. Kanıt ve yarının oyun testi: [match-analysis-and-next-game-test-2026-10-30.md](match-analysis-and-next-game-test-2026-10-30.md).
- **TAMAMLANDI — kaydetmeden çıkış ve geri dönüş:** Kayıt işaretçisi, ayrı export önizlemesi, aynı gün farklı
  baytları koruma ve eski DB onarımı, kaynak başına hata yalıtımı/yeniden deneme, revision ile UI yenileme.
  175 backend / 46 okuyucu / 3 görsel / 42 Playwright ve gerçek veri kopyası kontrolü:
  [sync-hardening-2026-10-29.md](sync-hardening-2026-10-29.md). Aynı UID + aynı başlıklı yuva belirsizliği sürer.
- ★ CMTracker'la iki oyun günü daha karşılaştırma (fikstür/istatistik).
- Kayıt yedeklerine saklama ayarı (her kayıt 16 MB kopya bırakıyor).
- Günlük export'u hızlandırma (tam tablo okumalarını azaltma).
- DOĞRULANACAK etiketler: lig dışı kupa adları, sarı/kırmızı kart alanları, hızlanma tipi, bazı vücut tipi ve büyüme profili kodları.
- Export'u olmayan kariyerlerde oyuncu adları.

### 2. Kayıttan kalan veriler (araştırma, zaman sınırlı)
- ★ Maç öncesi/sonrası doğrulaması: gol/asist, dakika/puan ve maç sonu topla oynama/pas/şut/xG kaynağı. Bugün
  oyun açılmadı; mevcut kopyalarla skor analizi tamamlandı. [Test adımları](match-analysis-and-next-game-test-2026-10-30.md#yarın-oyunda-yapılacaklar).
- ★ Kupa hedefleri ve asgari başarı koşulları. Moral/bütçe önceden; sezon arşivi, yönetim güveni, lig hedefi ve gelir-gider kategorileri 29 Ekim'de çözüldü (10 kayıt kopyası, CMTracker referansı); yeni alanlar DOĞRULANACAK.
- Oyuncunun son 5 maçı, maçın adamı, kurtarış; sezon ödülleri ve haftanın takımı dolu olduğunda doğrulama.
- İş teklifleri (menajerlik teklifi gelen kulüpler): tablolarda ve çözülen bloklarda yok. Teklif öncesi/sonrası iki kayıt kopyası karşılaştırılarak aranacak; bulunursa kulüp incelemesine bağlanır.

### 3. Farklılaştıran özellikler
- **FAZ A/B/C TAMAMLANDI — kapsamlı kadro analizi ve oyuncu önerileri (30.10):** Yerel hesaplama motoru, teknik direktör
  profili, bağımsız kadro derinliği ve ihtiyaç öncelikleri, oyuncu tarzına göre kariyer içinden adaylar ve bireysel
  bütçe ön elemesi. **Faz D kısmen:** ortak bonservis/maaş bütçeli manuel senaryolar da hazır. AI ilk sürümde gerekli değil;
  ileride isteğe bağlı anlatım katmanı.
  Profil, kaynak/kapsam, ihtiyaç analizi ve gerekçeli oyuncu önerileri tamamlandı. Ortak alış/satış/terfi/diziliş
  senaryoları ve sürümlü kayıt: [Faz D ilk teslimi](transfer-packages-2026-10-31.md). Otomatik paket seçenekleri açık.
  Aşamalar: [squad-analysis-plan-2026-10-30.md](squad-analysis-plan-2026-10-30.md), teslim ve testler:
  [squad-analysis-phase-a-2026-10-30.md](squad-analysis-phase-a-2026-10-30.md).
  İhtiyaç motoru ve gerçek iki kariyer doğrulaması: [squad-analysis-phase-b-2026-10-30.md](squad-analysis-phase-b-2026-10-30.md).
  Öneri motoru, bireysel maliyet ve 20 bin oyunculuk doğrulama: [squad-analysis-phase-c-2026-10-30.md](squad-analysis-phase-c-2026-10-30.md).
  **Yeni transfer merkezi ve beş tema tamamlandı:** soru sormadan ilk öneriler, lig bağlamı, isteğe bağlı tercih
  kartları ve uydurma bonservis aralıklarının kaldırılması. Güncel maliyet davranışı ve 285 backend / 72 UI /
  iki gerçek kariyer kontrolü: [teslim](transfer-hub-and-theme-delivery-2026-10-30.md).
  Ek teslim: [takım özeti ve tasarım bileşeni örnekleri](transfer-priority-and-design-elements-2026-10-30.md).
- Scout karar araçları: fırsat skoru, 2–4 oyuncu karşılaştırma, bütçe senaryosu (gerçek bonservisle karıştırmadan).
- Gelişim tahmini: günlük verilerle OVR/değer trendi (açık varsayımlı).
- Akıllı haber akışı: izlenen oyuncuda gelişim, sözleşme bitişi, transfer; gözlem aralığıyla.
- Kadro planlama: gelecek sezon, yaş dengesi, maaş bütçesi.
- Yüzü olmayan oyunculara (çoğu regen) AI ile fotoğraf üretimi (harici görsel API; yalnız uygulamada gösterilir, oyuna
  yazılmaz). Liste `fc_minifaces.lua` raporundan (Fenerbahçe kariyeri: kadroda 4, ligde 122). LE 27.1.4'ün kendi
  üretimi (`PlayerCapture*`) 29.10.2026'da denendi ve reddedildi: oyun içi 3D çizim, gerçek fotoğraflardan çok kötü;
  üretilenler `C:\FCExport\minifaces_generated_backup`'a taşındı.
  29.10.2026 elle deneme (Gemini uygulaması, Nano Banana): LE'nin oyun içi çizimi kimlik referansı olarak verilince
  sonuç çizime sadık ve fotoğraf gerçekliğinde. Plan: kullanıcının kendi Gemini API anahtarı (yalnız yerelde), LE ile
  yüzsüz oyuncuların çizimi (PlayerCapture, mods klasörü dışına), şablon prompt; varsayılan kapalı, maliyet önceden
  gösterilir (Nano Banana 2 Lite ~0,034 $/resim, API'de ücretsiz katman yok). Doğrulanan prompt:
  ```
  Use the attached video-game render as the identity reference. Create a realistic official club headshot photo of the SAME person.
  Identity (do not change): exact face shape, jawline, nose, eyes, eyebrows, lips, ears, skin tone, hairstyle and hair colour from the render. Age [yaş] years old. Do not beautify, slim or age the face.
  Kit: wearing a [kulüp renkleri, ör. navy blue and yellow vertical striped] football shirt with a white V-neck collar, exactly like the shirt in the render. No crest, no badges, no logos, no text anywhere on the shirt.
  Framing: official squad photo style, head and upper chest, face centred and looking straight at the camera, neutral expression, plain light-grey studio background, soft even studio lighting, sharp focus, square 1:1 image.
  ```

### 4. Günlük kullanıma hazır Windows uygulaması
- Derlenmiş paket, tek tıkla kurulum (Python/.NET/WebView2 kontrolü, Live Editor script'lerinin kopyalanması).
- Ayarlar (klasörler, günlük export kapsamı, yedek sayısı), senkron durum ekranı, hata bildirimi.
- Kullanıcı verisinin (app.db) kurulum klasöründen ayrı ve güncellemede korunması.

### 5. En son: oyuna yazma
- Yalnız `CLAUDE.md` kurallarıyla ve [career-mods.md](career-mods.md) planına göre; okuma ve senkron oturmadan başlanmaz.
- Önce tek oyunculuk, önizlemeli, sonucu yeniden okunan işlem; sonra tek takım → lig. Kaydet/yükle sonrası davranış test edilir.

## İlkeler

- **Veri dürüstlüğü:** Kaynağı olmayan kart doldurulmaz; boş/eksik açıkça gösterilir. Tahmin (değer, gelişim,
  hızlanma tipi) tahmin olarak etiketlenir. Kulüp farkı transfer, kaybolan oyuncu emeklilik diye kesin sunulmaz.
- **Tasarım:** CMTracker kalite ölçütüdür, piksel kopyası şart değil. Koyu, veri yoğun, okunur; kısa tutarlı geçişler,
  azaltılmış hareket desteği, yerleşimi koruyan yükleme/boş/hata hâlleri.
- **Oyun verisi:** Bazı oyun tabloları kariyerde güncellenmiyor (fikstür, lig sırası, `prevcompetitionstats`):
  doğrulanmadan kullanılmaz. Her yeni alan `config/field-map.json`'a ve data-dictionary'ye DOĞRULANACAK notuyla girer.
- **Kapsam dışı:** Anında transfer düğmesi, gelir verisi olmadan FFP uygunluğu, ham bellek/sözleşme yazımları,
  bulut/hesap/sosyal özellikler, kesin gelecek tahmini.

## Her iş için bitiş ölçütü

- Gerçek veriyle (ya da açık etiketli örnekle) çalışıyor; eksik veri davranışı belli.
- İlgili testler (backend xUnit, `tools/*` unittest, Playwright) ve bir gerçek veri kontrolü geçti.
- Kariyer/dal geçişi ve yeniden açılış kontrol edildi.
- Kaynak, varsayım ve sınırlar data-dictionary'ye ya da bu belgeye yazıldı.
