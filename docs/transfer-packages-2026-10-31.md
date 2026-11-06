# Ortak bütçeli transfer paketi — 31.10.2026

Faz D tamamlandı: **elle düzenlenen senaryo planlayıcısı**, **otomatik üç paket**, **olası maliyet aralığı** ve
**taslağın paketlerle yan yana kıyası**. Açık kalan: eşiklerin ve aralık üst ucunun kullanıcının ödediği gerçek bedellerle sınanması.
Manuel planlayıcı `fdbc510`, otomatik paketler `bbbe309`; push edilmedi.

## Kullanım

TRANSFER'de aday satırındaki **Pakete ekle** düğmesi oyuncuyu taslağa ekler. Üstteki **Transfer paketim**
bölümünü açıp dizilişi, bonservis/haftalık maaş/ek ücret senaryolarını düzenle. İstersen kadrodan koşullu
satış veya güncel akademiden terfi ekle. **Paketi hesapla** bütçe ve kadro etkisini çıkarır;
**Paketi kaydet** açıkça kaydeder. **Önerilere dön** bölümü kapatır ve odağı başlığına taşır.

Paket başlangıçta kapalıdır; öneri listesi öne çıkar. Hesap değişince önceki sonuç güncelmiş gibi sunulmaz.
Yeni kaynakla eski paket açıldığında kullanıcı yeniden hesaplar. Seçimlerin oyuna hiçbir etkisi yoktur.

## Hesap ve sınırlar

- Ayrılmış bonservis ve haftalık maaş bütçesine rezerv yüzdesi bir kez uygulanır. Tüm alışlar/terfiler aynı
  kalan bütçeyi paylaşır; her adaya baştan aynı para verilmez.
- Boş bonservis: varsa mevcut motorun gözlenen son transfer/değer modeli/serbest oyuncu referansı.
  Boş maaş: varsa mevcut motorun beklenen ücret tahmini. Bunlar fiyat veya sözleşme talebi değildir.
  Kullanıcı açık tutar girebilir; gerçek sıfır ile boş/bilinmeyen ayrıdır.
- Bilinen bonservis, haftalık maaş ve ek ücret alt toplamları ile bilinmeyen oyuncu sayıları ayrı gösterilir.
  Eksik bedel/maaş tam toplamı belirsiz bırakır. Bilinmeyen ek ücretler kalan para hesabına katılmaz ve
  ayrıca uyarılır; tam maliyet veya ilk yıl nakit akışı iddiası yoktur.
- Satışsız bütçe ile satış gerçekleşirse oluşacak bütçe ayrı gösterilir. Satış tutarının ve mevcut maaşın
  tamamının açılacağı yalnız bir senaryo varsayımıdır; oyun kesintileri bilinmiyor.
- Önce satış oyuncuları çıkarılır, sonra alış/terfi eklenir. Seçili dizilişte ilk 11 ve bağımsız rotasyon yeniden
  atanır; çok mevkili oyuncu iki yedek sayılamaz. Mevki etkileri ayrıntısı önce/sonra reytinglerini gösterir.
  Yeni oyuncu hiçbir bağımsız seçeneğe yerleşmezse veya ilk 11/rotasyon kapsamı azalırsa ayrıca uyarılır.
- Terfide bugünkü OVR kullanılır; POT hazır kalite veya gelişim garantisi değildir. Yeni sözleşmenin bitişi
  eski kulübün sözleşmesinden türetilmez. Tescil/yabancı kuralları, satış kabulü veya transfer erişilebilirliği
  için kesin uygunluk iddiası yoktur.
- Bütçe sonucu: `above`, `unknown`, `conditional`, `within`. Bilinen maliyet alt sınırı bile bütçeyi aşıyorsa
  `above`; gerekli bütçe/bedel/maaş bilinmiyorsa `unknown`; referans/tahmin/eksik ek ücret/satış varsa
  `conditional`. `within` yalnız eksiksiz girilmiş kullanıcı senaryosunun ayrılan bütçeye sığmasıdır.
- Aynı anda bir kariyer/dal + kayıt/önizleme bağlamında tek paket saklanır. Hesaplanmış taslak, Paket öner
  sonrası **Mevcut taslağın** kartıyla önerilerin yanında kıyaslanır.
- Olası aralık yalnız etiketli tahminleri yayar: referans bedel ×0,5-1,75, tahmini maaş ×0,9-1,5
  (`config/transfer-plans.json`). Kullanıcı tutarı ve serbest oyuncu bonservisi yayılmaz; maliyeti bilinmeyen pakette
  aralık üretilmez. Üst uç bütçeyi aşarsa kart uyarır, durum sınıfı değişmez. Alt uç, Chesterfield kaydındaki 331 yapay
  zekâ transferinden gelir: bedel/model değeri ortanca 0,54, p10 0,33, p90 1,01; eski ×0,9-1,75 aralığı bunların %12'sini
  kapsıyordu. Üst uç güvenlik payıdır; kullanıcının ödediği bedel ve maaş çarpanı henüz ölçülmedi (DOĞRULANACAK).

## Otomatik paketler

**Transfer paketim → Paket öner** seçili diziliş için üç seçenek hazırlar: Düşük harcama, Dengeli, Yüksek katkı.
İstek açıkça gönderilir ve hiçbir şey kaydetmez. **Bu paketi taslağa al** oyuncuları taslağa koyar; taslak doluysa
önce sorar. Sonuç manuel önizlemeyle aynı hesaptan geçer, bu yüzden yeniden hesaplamadan **Paketi kaydet** açıktır.
Kaynak veya diziliş değişince eski öneriler gizlenir.

- API: `POST /api/recruitment/plan/suggestions`, `{ source, formation }`. Motor `TransferPlanSuggester`,
  kurallar `config/transfer-suggestions.json`. Kurallar paket sürümüne girmez; ayar değişince kayıtlı paket bayatlamaz.
- Adaylar seçili dizilişte ihtiyacı olan mevkilerin öneri listeleridir. Bonservis referansı veya maaş tahmini
  olmayan aday elenir, sayısı gösterilir; bilinmeyen maliyet ucuz sayılmaz. Kendi oyuncun ve akademin aday olmaz.
- Arama sıralıdır: her adımda ihtiyaç endeksiyle ağırlıklı mevki kazancı, maliyet ağırlığına bölünür. Maliyet
  bonservis ve haftalık maaşın bütçe payının ortalamasıdır. Her alımdan sonra ihtiyaçlar tam derinlik hesabıyla yenilenir.
- Düşük harcama yalnız bu dönemin ihtiyaçlarına bakar ve açık ihtiyaç sayısını gerçekten azaltan oyuncuyu ister.
- Taban reytingi geçmek ek puan verir. Rotasyonda tabanın 6 puan üstünü aşan kalite puan getirmez. Başka yeri
  zayıflatan kaydırma ceza alır. Son kadroda katkısı kalmayan oyuncu paketten düşer ve yeri yeniden aranır.
- Toplam bonservis ve maaş, rezerv düşülmüş bütçeyi aşamaz. Üst sınır takım planındaki hedef transfer sayısıdır.
- Satış ve akademi terfisi önerilmez. Katkı bugünkü mevki reytingine dayanır; potansiyel, rol uyumu ve maç başarısı
  sıralamaya girmez. Hedefler aynı oyunculara çıkarsa kart bunu söyler; yapay fark üretilmez.
- Bu kural tabanlı bir aramadır, matematiksel en iyi çözüm değildir. `0,5` rotasyon ağırlığı gibi değerler gerçek
  kariyerlerde bakılarak seçildi, kalibre edilmedi (DOĞRULANACAK).

Gerçek kopyada; Fenerbahçe test planındaki 10 M€ ve 50 B€/hafta, Gençlerbirliği kayıttaki 5,5 M€ ve 4.451 €/hafta bütçeyle:

| Kariyer | Düşük harcama | Yüksek katkı | Süre |
|---|---|---|---|
| Fenerbahçe | Yedek stoper + yedek kaleci 76; 8,1 M€, 24 B€/hafta; açık ihtiyaç 2 → 0 | Aynı stoper + yedek kaleci 83; 6,7 M€, 38 B€/hafta | ~0,9 sn |
| Gençlerbirliği | Tek yedek stoper; 700 B€, 3 B€/hafta; 7 → 5 | Aynı oyuncu; maaş alanı ikinci alıma yetmiyor | ~0,6-1 sn |

Boş kart nedenini söyler: açık ihtiyaç yok veya bütçeye sığan yok. Dengeli, iki kariyerde de Düşük harcama ile aynı oyuncuları buldu. İlk 11 ortalaması bu örneklerde değişmedi; hedef
sayısı 2 olduğu için alımlar önce açık yedek yerlerine gidiyor. Kanıt: `scratch/transfer-packages/suggestions-evidence.json`.

## Live Editor'süz yeni kariyer

Chesterfield (22.07.2026, League Two, `slot-15226f…`) yalnız kayıttan geldi; üç içe aktarma hatası bulundu:

- Bütçe bloğu `kalan maaş ≤ sezonluk maaş × 2` kontrolüne takılıyordu (2,05 kat). Sınır 4 kata çıktı; sıfır sezon başı
  bütçe de geçerli, maaş bütçesi sıfır olamaz. Sonuç: 249.500 € kalan, 1.650 €/hafta maaş alanı.
- Menajer bloğu, hiç galibiyet yokken boş takım alanı (`FFFFFFFF`) yüzünden atlanıyordu; yer tutucu tarih artık yazılmıyor.
- Kayıttan gelen anlık görüntüde başlık bütçesi boştu. Artık bloktan dolduruluyor; export değeri ezilmiyor.

`BLOCK_VERSION` 8 oldu, diskte duran kayıtlar yeniden çözülür. Finans türü 19 (1 Temmuz, 8 satır, 1.259.700 €)
sezon başı ile kalan bütçe farkını birebir açıklıyor; anlamı henüz bilinmiyor (DOĞRULANACAK).

## Saklama ve sürüm güvenliği

`app.db/transfer_plans`: `(career_key, view_mode)` anahtarı, taslak/sonuç JSON'u, artan sürüm ve UTC zaman.
GET okumadır; POST preview hesaplar; PUT sonucu sunucuda yeniden hesaplayarak kaydeder:
`/api/recruitment/plan`, `/api/recruitment/plan/preview`. Hepsi seçili `saveUid` bağlamındadır.

Kanonik kariyer/dal, saved/preview, snapshot, aynı gün revision, analiz config'i, öneri config'i,
paket/reyting config'i ve profil sürümü saklanır. Değişim eski sonucu bayat işaretler; eski kaynakla yazım 409'dur.
Eşzamanlı paket kaydı `expectedVersion` ile korunur. Başka pencerede değişen paket yerel taslağı sessizce
ezmez; kullanıcı kaydedilmiş paketi ayrıca yükleyebilir. Yanlış oyuncu, yinelenen işlem, geçersiz tutar/diziliş,
kendi oyuncusunu dışarıdan alış, güncel olmayan terfi ve dokunulmaz oyuncu satışı reddedilir.

Kaydedilmiş planın asıl kaynağı `app.db`'dir. Kaydedilmemiş form ayrıca tarayıcıda kariyer/dal/moda göre
önbelleklenir; bu, gezinme/reload sırasında taslağı koruyan **en iyi çaba** desteğidir. Tarayıcı temizliği/kota
durumunda garanti değildir; kalıcı kayıt için **Paketi kaydet** gerekir. İlk okuma hatası boş paket diye
sunulmaz; tekrar deneme vardır. Geç gelen hesap başka kariyere taşınmaz.

Yeni ham oyun alanı yoktur. `config/transfer-plans.json` paket sürümünü, işlem/tutar sınırlarını taşır.
Model anlamları ve DOĞRULANACAK notları `data-dictionary.md` içindedir. API `TransferPlanService`
kategorisinde kaynak/revision, işlem sayısı, sonuç, süre ve kaydedilen sürümü mevcut loglara yazar.

## Doğrulama

| Kontrol | Sonuç / kanıt |
|---|---|
| Backend | 329 geçti, 0 hata; `scratch/ui-audit-2026-10-31/package-backend.log` |
| Paket motoru/servisi | 12 hedef test: ortak bütçe, ayrı maaş, tek rezerv, bilinmeyen/sıfır, satış sonrası derinlik, çok mevkili tek kapasite, genç POT ayrımı, gereksiz ikinci GK, kapsam/sürüm/oyuncu doğrulaması |
| Saveimport / assets | 53 / 3 geçti; `package-saveimport.log`, `package-assets.log` |
| Paket ve Transfer arayüzü | 28 geçti; `package-hub-tests.log`; ilk okuma hatası, preview hatası, kaydetme çakışması, reload, kaynak değişimi ve geç yanıt dahil |
| Son tam Playwright | 101 geçti / 12 ortam koşullu atlandı; `package-frontend-final.log` |
| Gerçek kariyer kopyaları | `package-real.spec.ts`: 1 test geçti, iki kariyer; `package-real.log` |
| Derleme | API/masaüstü Release ve son frontend production build geçti; Vite büyük paket uyarısı sürüyor |

Yeni testler 390 px, azaltılmış hareket, klavyeyle geri dönüş
odağı, satış/terfi/diziliş, taslak koruma ve açık kaydetmeyi kapsar. Gerçek test yalnız sağlık ucunda `scratch`
veritabanı yolu gördükten sonra paket kaydeder; menajer profilini değiştirmediğini de doğrular.

İki kariyerde 2 alış + 1 satış + 1 akademi terfisi, kayıt/reopen, 1440/390 px ve JS hatasız görünüm test edildi.
Kanıt: `scratch/transfer-packages/evidence.json`, aynı klasörde UID ile biten desktop/mobile ekranları.

- Fenerbahçe, 28.07.2030 @5: bonservis referansı 40.950.000 €, kullanılabilir bütçe 34.778.641,65 €.
  Satışsız kalan −6.171.358,35 €, 1 M€ satışla −5.171.358,35 €. Bağımsız rotasyon 10 → 9;
  aynı yere iki kaleci alımı iki ayrı ihtiyaç giderimi sayılmadı.
- Gençlerbirliği, 24.08.2026 @1: 5 M€ alış referansı, 4.709.451,35 € bütçe. 1 M€ satışla
  bonservis kalanı +709.451,35 € olsa da maaş kalanı −20.716,65 €/hafta; paket bütçeye uygun gösterilmedi.
- İki pakette de 3 kişinin ek ücreti bilinmiyor; toplam kesin maliyet olarak sunulmadı.

Windows masaüstü kopyası açıldı; son yeniden kontrol fiziksel Esc ile kullanıcı tarafından durduruldu.
Bu son kontrol tamamlandı diye raporlanmıyor; yukarıdaki son ekran kanıtı gerçek API'yi kullanan Playwright'tır.
Test için açık kalan masaüstü süreç scratch DB'lerini kullanır. Kaynak oyun, otomasyon ve kurulu script'ler değişmedi.
`C:\FCExport\fc_career.db` SHA-256 önce/sonra aynı:
`127448939cbcf6629c83f6d6ffdff81f10ac451c4f0952206c683abad2372aab`.

Çalıştırma: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.
