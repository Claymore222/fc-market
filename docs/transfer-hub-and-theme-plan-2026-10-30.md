# Transfer önerileri ve beş tema denemesi — uygulama planı

30.10.2026. Kullanıcı uzakta; açıklama/onay sorulmadan önce bu plan yazıldı, ardından uygulamaya geçilecek.
Ana durum belgesi PRODUCT-ROADMAP.md; bu belge kullanıcının yeni ürün yönünün teslim planıdır.

Durum: **Altı adım tamamlandı.** Uygulama, testler ve kapsam sınırları:
[teslim belgesi](transfer-hub-and-theme-delivery-2026-10-30.md). Tema adındaki Orman, arayüzde Gece Tribünü olarak kullanıldı.

## Hedef

Transfer döneminde uygulamayı aç → kendi takım/lig/bütçe/eksiklerine göre oyuncuları hemen gör → karşılaştır/izle.
Uzun teknik direktör formu veya soru dizisi ilk önerinin ön koşulu olmayacak. Mevcut A–C motoru kullanılacak.
Görünüm sakin ve ferah; teknik kapsam/eleme açıklamaları ayrıntılara taşınacak.

## Teslim sırası

1. **Veri ve fiyat doğruluğu:** Mevcut kayıtlarda oyuncuya doğrudan bağlı transfer bedelinin kapsamını araştır.
   Doğrulanabilir son bedeli sezon/tarih, kulüp ve kaynakla göster; geçmiş bedel yeni bonservis talebi değildir.
   Kimliksiz finans hareketini oyuncuya atama. Kanıt yoksa bilinmiyor; mevcut değer modelinin keyfî katlarıyla
   bonservis aralığı üretme. Mevcut maaş ile yeni talep ayrımı da korunacak.
2. **Lig/takım bağlamı ve kısa notlar:** Kendi takımının kalitesi yanında aynı snapshot'taki lig seviyesini
   ölç. Eksik lig bilgisine seviye uydurma. Uyum puanı bir model endeksi; özellik, kalite ve gelişim gerekçeleri
   açık kalacak. “Hızlı bek”, “teknik 10 numara”, “4-3-3 kanadı” gibi notlar özellik/tercihten türetilecek.
3. **Doğrudan transfer merkezi:** `/transfer` önerilerle açılır. Var olan profil tercihleri kullanılır; boş bütçe
   için kayıttaki tutar yalnız bu analizde, açık kaynak etiketiyle kullanılabilir. Varsayılan diziliş gerekirse
   açıkça model varsayımıdır; oyun taktiği diye sunulmaz. Profil sessizce kaydedilmez. Mevki ve amaç seçimi,
   varsayılan beş aday (sayısı değişebilir), mevcutla kıyas/izleme/detay. Tüm mevkilere erişim; seçili diziliş
   dışındakiler alternatif senaryo olarak etiketlenecek. Eski piyasa listeleri erişilebilir kalacak.
4. **İsteğe bağlı tercih kartları:** Düğmeyle açılan kısa sıralı kartlar: bek hızlı/teknik/dengeli, kanat hızlı/
   teknik/içe kat eden, santrfor pivot/hareketli/bitirici, 10 numara yaratıcı/golcü. Geri/atla/kapat desteği;
   yalnız açık kaydetmede uygulama profiline yazılır. Kariyer/dal/önizleme ve eski revision koruması korunur.
5. **Tema laboratuvarı:** Galeri + beş ayrı adres, her biri aynı verilerle ana sayfanın üst bölümünü gösterir:
   Buz Camı (mavi/beyaz/saydam), Orman (koyu/yeşil), Krem Defter, Beyaz Stüdyo, Mor Gece. Kulüp başlığı,
   özet metrikler ve birkaç karttan oluşan yarım ana sayfa; tema yalnız önizleme içinde geçerli, global tema
   değiştirilmez. Etkileşim/hover, mobil, klavye ve reduced-motion desteği.
6. **Test ve kayıt:** Backend, Python, Playwright, üretim derlemesi; iki gerçek kariyer kopyası, fiyat kanıtı/yokluk,
   filtre/karşılaştırma/tercih saklama/yeniden açılış, değişen kaynak ve beş tema görsel kontrolü.
   Kaynak DB hash'i değişmeyecek. Test kanıtları ve kapsam sınırları teslim belgesine yazılacak.

## Sınırlar

Oyun açılmaz; exporter ve orijinal oyun kayıtları değişmez. Kariyer DB salt-okunur, kullanıcı tercihleri/raporlar
app.db'de. Script otomasyonu tekrar açılmaz. Kulübün kabulü, yeni maaş/bonservis talebi ve tescil kuralı bilinmiyorsa
kesin uygunluk söylenmez. Ortak bütçeli çoklu transfer paketi Faz D olarak ayrıca kalır; bu teslim tek aday
seçimini kolaylaştırır. Commit atılmayacak.
