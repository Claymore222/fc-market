# Kadro analizi ve oyuncu önerileri — uygulama planı

Tarih: 30.10.2026; güncelleme: 31.10.2026. Durum: **Faz A–C tamamlandı; D kısmen uygulandı; E–F bekliyor.** Faz D'de ortak bütçeli elle düzenlenen alış/satış/terfi/diziliş planı, bağımsız derinlik ve sürümlü saklama hazır. Otomatik üç paket alternatifi ve maliyet aralıkları açık.
Teslim ve testler: [squad-analysis-phase-a-2026-10-30.md](squad-analysis-phase-a-2026-10-30.md).
Faz B teslimi: [squad-analysis-phase-b-2026-10-30.md](squad-analysis-phase-b-2026-10-30.md).
Faz C teslimi: [squad-analysis-phase-c-2026-10-30.md](squad-analysis-phase-c-2026-10-30.md).
30 Ekim ürün güncellemesi: doğrudan transfer merkezi, isteğe bağlı tercih kartları, lig referansı ve fiyat
uydurmayan ön eleme tamamlandı. Güncel maliyet politikası önceki Faz C çarpanlarının yerini alır:
[transfer merkezi ve tema teslimi](transfer-hub-and-theme-delivery-2026-10-30.md).
31 Ekim Faz D ilk teslimi: [ortak bütçeli manuel paket ve testler](transfer-packages-2026-10-31.md).
İhtiyaç ve öneri kurallarının güncel hâli: [recruitment-logic-fix-2026-10-30.md](recruitment-logic-fix-2026-10-30.md).
Ana yol haritası: [PRODUCT-ROADMAP.md](PRODUCT-ROADMAP.md). Bu belge alt sistemin ayrıntılı tasarımıdır.

## Amaç ve mimari kararı

Kullanıcı kendi futbol anlayışına, kadrosunun bugünkü/gelecek durumuna ve bütçesine göre şu yanıtları alır:

1. Hangi mevkiye, ne zaman, neden takviye gerekiyor?
2. İlk 11, rotasyon veya gelecek yatırımı için nasıl bir oyuncu profili aranmalı?
3. Kendi kariyerimdeki hangi oyuncular bu ihtiyacı karşılıyor; neden ve hangi bedel/belirsizlikle?
4. Birlikte hangi transferler yapılabilir; kadro ve bütçe nasıl değişir?
5. Transfer yerine kadro içi çözüm, gelişim, sözleşme yenileme veya bekleme uygun mu?

**Çekirdek yerel C# hesaplama motoru olacak. AI ilk sürüm için gerekli değil.** Girdi, kural ve puan
gerekçeleri kaydedilecek; aynı veri/ayar aynı sonucu verecek. Başlangıçta açıklamalar şablonlarla üretilecek.
İleride isteğe bağlı dil modeli sohbet ve rapor anlatımı ekleyebilir. Puanlar ve aday kimlikleri motorun işi
olarak kalır; dil modeli bütçe/oyuncu/özellik uydurarak karar vermez.

## Mevcut kodun desteklediği temel

| Kaynak | Kullanılabilecek bilgiler | Sınır |
|---|---|---|
| MarketPlayer / MarketLoader / field-map | OVR/POT, yaş/doğum, tüm kayıtlı mevkiler, ayak, özellikler, rol +/++, PlayStyle, maaş ve sözleşme | MarketPlayer bütün ham özellikleri taşımıyor; analiz için alan eşlemesinden toplu özellik okuyucusu gerekiyor. |
| ClubService / SquadMember | İlk 11 yerleri, yedek/rezerv, kiralık giriş/çıkış, form, dakika/puan, fitness/sakatlık | Veri kapsamı kaynağa göre değişiyor. Eksik bilgi sağlıklı/oynamamış sayılmayacak. |
| ClubInfo | Oyun kurma ve savunma derinliği alanları | Kullanıcının aktif taktiğini yansıttıkları doğrulanmadı. Otomatik stil teşhisi için yeterli kabul edilmez. |
| ClubFinance | Kalan transfer bütçesi ve haftalık maaş boşluğu | Sezonluk maaş bütçesi ile haftalık boşluk farklı birimlerdir. Kaynak günü ayrıca izlenir. |
| Mevcut mevki reytingi / lineupDepth | Mevki normalizasyonu ve alternatif seçimine başlangıç | Tahmini mevki puanı oyunun resmî puanı değil. Hover'daki aday sayımı kapsamlı derinlik analizi değildir. |
| OpportunityScorer / TransferPage | Genel gelişim/yaş/sözleşme fırsat puanı, temel bütçe listesi | Kulübün ihtiyacını veya futbol tarzını değerlendirmiyor. Yeni öneriler doğrudan bu listeyle eşitlenmez. |
| AppDb / shortlist / compare / PlayerDrawer | Kullanıcı planlarını tutma, oyuncu inceleme ve karşılaştırma | Kariyer DB'si salt-okunur; yeni kullanıcı profilleri/planları app.db'ye yazılır. |

İnceleme özellikle ClubService.cs, MarketLoader.cs, Metrics.cs, PositionRatings.cs, TransferPage.tsx,
lineupDepth.ts ve field-map.json üzerinden yapıldı. Bugünkü ilk 11 yerleştirmesi açgözlü seçim + ikili takas
kullanıyor; çok mevkili oyuncuların bağımsız yedek sayımı için ayrı atama hesabı gerekli.

## 1. Teknik direktör profili

Tek seferlik kısa bir kurulum; daha sonra düzenlenebilir ve kariyer/dal bazında saklanır:

- Ana ve isteğe bağlı ikinci diziliş; kayıtlı ilk 11'den önerilir, kullanıcı değiştirir.
- Hücum: kanat/orta, içe kat eden kanatlar, merkezden pas, direkt/hızlı geçiş veya dengeli.
- Savunma: önde baskı, orta blok, derinde karşılama; çizgi yüksekliği ve tempo tercihleri.
- Yer bazında istenen rol: örneğin hücumcu bek, geriden pasla çıkan stoper, kesici ön libero, bağlantı forveti.
- Hedef: hemen sonuç, dengeli gelişim, genç proje. Pozisyona ve ihtiyaca göre karıştırılabilir.
- Maç biçimi: kendim oynuyorum / simülasyon / karışık. Etki katsayıları açık tercih/model varsayımıdır;
  oyunun gizli simülasyon formülü biliniyormuş gibi sunulmaz.
- Transfer ve haftalık maaş için ayrılan tutar, güvenlik payı ve kaç transfer istendiği.
- İsteğe bağlı gerçekçilik/yaş/lig tercihleri; dokunulmazlar, gönderilmesi düşünülenler ve kendi hedef oyuncuları.

Bir takım hem kanat oyunu hem önde baskı oynayabilir; stiller tek bir zorunlu etikete indirgenmez.
Kaydın bildirdiği değer, kullanıcının seçtiği hedef ve sistemin hesapladığı yorum ekranda ayırt edilir.
Rol yatkınlığı, oyuncuya o rolün taktik ekranında atanmış olduğunun kanıtı değildir.

## 2. Kadro derinliği ve ihtiyaç motoru

Her diziliş yeri için hazır ilk seçenek, bağımsız yedek, gelişim seçeneği ve boşluk çıkarılır.

- Oyuncu aynı 11'de iki yerde; aynı anda iki boşluğun bağımsız yedeği olarak da iki kez sayılamaz.
- Kayıtlı bütün mevkiler dikkate alınır. Mevkiye uygunluk, özellik uyumu ve rol yatkınlığı ayrı kavramlardır.
- Örnek stres testi: bir stoper ve bir ön libero aynı anda yokken iki mevkiyi de oynayan tek oyuncu yeterli mi?
- Kiralık verilenler bugünkü hazır havuza girmez; kiralık gelenlerin bitişleri gelecekteki kadrodan düşülür.
- Kısa süreli sakatlık/ceza ile sezonluk yapısal eksik ayrılır; her sakatlık kalıcı transfer gereksinimi oluşturmaz.
- Kalite açığı takım/lig bağlamıyla ölçülür; her kulübe aynı OVR sınırı uygulanmaz.
- Yaş dağılımı mevki ve hedefe göre değerlendirilir. Yaş tek başına tecrübe, liderlik, düşüş veya emeklilik kanıtı değildir.
- Sözleşmesi bitecek oyuncu ve kiralık dönüşleri için gelecek sezon görünümü bulunur.
- Akademi alternatifi ancak bilinen kadro kapsamıyla değerlendirilir; ana takıma alınmamış genç bugünkü hazır
  derinliğe eklenmez. Terfi ayrı bir senaryodur; POT gelişim garantisi değildir.

Çıktı öncelikleri: **acil / bu transfer dönemi / gelecek sezon / yeterli**. Her birinde nedenler, kullanılan
oyuncular, alternatifler ve verisi eksik kısımlar gösterilir. İhtiyaç skoru ve oyuncu öneri skoru ayrıdır.
İhtiyaç yoksa sistem “transfer gerekmiyor” diyebilir.

## 3. Aranacak oyuncu profilleri

Mevki başına tek genel profil yerine hedefe göre özellik/rol profilleri bulunur. Başlangıç örnekleri:

| İhtiyaç | Örnek hedef profil | Değerlendirme başlıkları |
|---|---|---|
| Önde baskı için orta saha rotasyonu | Hareketli, dayanıklı ve yeterli top kullanımı olan oyuncu | Dayanıklılık, hareketlilik, savunma ve pas özellikleri; uygun rol/PlayStyle varsa destekleyici katkı. |
| Genişlik ve orta üreten kanat | Çizgi oyuncusu | Hızlanma, top sürme, orta ve pas; ayak/kanat ilişkisi seçilen görevle birlikte. |
| İçe kat eden gol tehdidi | İçe kat eden kanat | Bitiricilik, pozisyon, top sürme ve uygun ayak tercihi; mevcut forvetle görev paylaşımı. |
| Yüksek çizgide savunma | Hareketli savunmacı | Hız, reaksiyon ve savunma özellikleri birlikte; yalnız hızlı olduğu için kötü savunmacı üst sıraya çıkmaz. |
| Pasla çıkış | Top kullanabilen stoper/ön libero | Pas, top kontrolü ve baskı altında oyun için seçilen özellikler; savunma tabanı korunur. |
| Hemen katkı veren yedek | Hazır rotasyon | Mevcut seviyeye yakın kalite, maliyet ve rol ihtiyacı; yüksek POT zorunlu değildir. |

Bunlar **önerilen başlangıç kurallarıdır**, ölçülmüş FC 27 maç sonucu modeli değildir. Katsayılar config'te,
sürümlü ve ayarlanabilir olacak. Özellik listeleri tek başına mutlak futbol tanımı sayılmayacak; ayak, fizik,
rol ve PlayStyle etkileri kontrollü katkı verecek. Role++ her profilde otomatik üstünlük sağlamayacak.

EA'nın [FC 26 Gameplay notları](https://www.ea.com/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-gameplay-deep-dive)
rol esnekliği ve oynanış türü farklarını açıklıyor. Bunlar kavramsal referanstır; FC 27 için aynı sayısal etki
varsayılmayacak. [FC 26 Career notlarındaki](https://www.ea.com/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-career-mode-deep-dive)
lig simülasyonu/veri kapsamı ayrımı nedeniyle rakip oyuncularda eksik maç istatistiği sıfır performans sayılmayacak.

## 4. Kariyer içinden aday önerme

Önce rolüne uygun kadro içi çözüm değerlendirilir. Dış adaylar kullanıcının **seçili kariyer snapshot'ındaki**
oyunculardan gelir; gerçek dünya listesi veya internet veri tabanı yerine bu kariyerin regen ve değişmiş oyuncuları
kullanılır. Kendi oyuncusu ve kiralık verdiği oyuncu dış transfer adayı olarak önerilmez.

Önce sert koşullar: kayıtlı mevki, korunacak kalite tabanı, kullanıcı yaş tercihi ve açıkça belirlenmiş kısıtlar.
Ardından şu bileşenlerle aday sıralanır:

1. Aranan özellik profili ve görev uyumu.
2. Kendi kadrosuna katacağı marjinal fayda: ilk 11/rotasyon açığında neyi iyileştiriyor?
3. Yaş, potansiyel ve sözleşme ufkunun kullanıcının hedefine uyumu.
4. Bonservis/maaş yükü ve belirsizlik.
5. Birden fazla ihtiyacı kapsama; diğer gerekli yerleri zayıflatmama.

İlk 11 / rotasyon / gelişim adayları ayrı görülür; yüksek potansiyelli genç her zaman kazanmaz.
Her kart: neden önerildi, güçlü yönleri, eksikleri, yerine/yanına düşündüğü oyuncu, kalite farkı, rol/PlayStyle,
maliyet durumu ve veri kapsamı taşır. “Uyum endeksi 82/100” bir model puanıdır; başarı olasılığı veya oyunun
resmî reytingi değildir. Bilgi kapsamı ayrı verilir; uydurma güven yüzdesi gösterilmez.

Eksik alanlar sıfır sayılmaz. Kritik veri eksikse puan üretilmez veya koşullu sonuç verilir. Az veri bilen
oyuncu, birkaç yüksek alan yüzünden tam verili adaydan daha güvenilir görünmez. Aynı özellik OVR, profil ve
taktik puanında üç kez kontrolsüz ödüllendirilmez; bileşen ağırlıkları ve katkı tavanları incelenir.

## 5. Bütçe ve birlikte transfer planı

- Transfer bütçesi ve haftalık maaş boşluğu ayrı kısıttır; sezonluk maaş bütçesi haftalık gibi kullanılmaz.
- Mevcut değer modeli **tahmini değerdir**; istenen bonservis veya kabul edilen teklif değildir.
- Adayın mevcut maaşı yeni sözleşmede isteyeceği maaş değildir. Serbest oyuncunun kayıttaki maaşı da yeni talep değildir.
- Teklif/maaş senaryosu için kullanıcı aralık girebilir; ilk yıl yükü tahmin aralıklarıyla gösterilir.
  İmza/temsilci ücretleri bilinmiyorsa belirtilir; bedelsiz transfer sıfır toplam maliyet sayılmaz.
- Uygunluk sonucu: **ayrılan bütçeye sığıyor / koşullu / bütçe dışında / veri yetersiz**. Bilinmeyen maaş ucuz sayılmaz.
- İki transfer ayrı ayrı uygun olsa bile toplam bedel/haftalık maaş bütçeyi aşıyorsa birlikte önerilmez.
- Bir oyuncuyu almak alternatif mevki ihtiyacını zaten gideriyorsa ikinci transferin faydası yeniden hesaplanır.
- Satış geliri ancak kullanıcı satış senaryosu kurarsa koşullu hesaba eklenir; gerçekleşmiş bütçe gibi sunulmaz.
  Satılacak oyuncu önce kadrodan çıkarılır, oluşan ihtiyaç yeniden hesaplanır.
- Plan seçenekleri: düşük harcama / dengeli / ayrılan bütçeyle en yüksek kadro faydası. Yaklaşık arama
  kullanılıyorsa “matematiksel olarak en iyi paket” iddiası olmaz.

Oyuncunun transfer listesinde olması, kulübünün kabulü, kiralanabilirliği veya gelmek istemesi veride yoksa
kesin söylenmez. Yabancı/tescil kuralları doğrulanmış oyun kuralı verisi olmadan otomatik yasal uygunluk filtresi
yapılmaz; ilk sürümde açık kullanıcı kısıtı olarak tanımlanabilir.

## 6. Ekran akışı

SQUAD içinde **Kadro analizi** düğmesi; ana menüye kalabalık yeni sekmeler eklenmeden `/squad/analysis` alt ekranı.

1. Üstte kaynak oyun tarihi, kayıt/önizleme, seçili diziliş, futbol profili ve ayrılan bütçe.
2. Sahada mevki ihtiyacı; yanında önem sırasına göre gerekçeli ihtiyaç kartları.
3. İhtiyaç seçilince hedef profil ve o profilin üç aday grubu.
4. Adayda mevcut oyuncuyla karşılaştırma, PlayerDrawer, karşılaştırma listesi ve shortlist bağlantıları.
5. **Planıma ekle**: kadro derinliği ve kalan bütçe birlikte güncellenir. Bu bir senaryodur, oyunda transfer yapmaz.
6. “Bu oyuncu giderse / bütçe şu olursa / diğer dizilişe geçersem” karşılaştırması.

İlk sürümde tek sayfada onlarca grafik yerine üç eylem öne çıkarılır. Örnek çıktı (temsili):
“Öncelik: sol bek rotasyonu. İlk seçenek dışında bağımsız hazır alternatif yok. Gelecek yatırımından önce
bugün kullanılabilecek bir oyuncu ara.” Gerçek oyuncu adları ve sonuçlar motor uygulanınca veriden üretilecek.

390 px, klavye/odak/Escape, hover bilgisinin dokunmayla açılması ve azaltılmış hareket desteği mevcut UI ile uyumlu
olacak. Hafif giriş animasyonu kullanılabilir; sonuç değişince kartlar kontrolsüz yeniden sıralanmayacak.

## 7. Teknik teslimler ve performans

Önerilen bileşenler:

- `SquadAnalysisContext`: tek snapshot ve alan bazında kaynak/kapsam.
- `SquadAnalysisService`: bağımsız derinlik ataması ve ihtiyaçlar.
- `RecruitmentService`: profil uyumu, aday havuzu ve gerekçeler.
- `TransferPlanService`: birden çok transfer/satış/terfi senaryosu.
- `config/squad-analysis.json`, `config/recruitment-profiles.json`: sürümlü eşikler, ağırlıklar ve profiller.
  Yeni ham oyun alanı adları koda gömülmez; field-map üzerinden çözülür.
- app.db: `manager_profiles`, `analysis_runs`, `transfer_plans` ve plan maddeleri. Kariyer/dal kimliğiyle ayrılır.
- Önerilen API: `GET/PUT /api/analysis/profile`, `POST /api/analysis/run`, `GET /api/analysis/{id}/candidates`,
  `POST /api/analysis/plan`. Yazımlar yalnız kullanıcı ayarı/planı olarak app.db'dedir.
- Cache/rapor kimliği: save UID + branch + snapshot ID + revision + profil hash'i + kural sürümü.
  Yeni kayıt gelince eski rapor eski tarih etiketiyle kalır; güncel verilerle sessizce karıştırılmaz.
- Özellikler toplu okunur; her oyuncu için ayrı Detail/HTTP çağrısı yapılmaz. Ön eleme sonrasında aday havuzu daralır.
- Performans hedefi: 20–30 bin oyuncuda ilk analiz birkaç saniye, önbellekten etkileşim bir saniyenin altında.
  Hedef gerçek makinede ölçülerek doğrulanır; önceden garanti değildir.
- `logs/app/squad-analysis`: girdi kimliği, kurallar, veri eksikleri, aday sayısı, elenme nedenleri, süre ve hata.
  Her rapor tekrar üretilebilir; loga bütün oyuncu tablosunu basmak gerekmez.

## 8. Aşamalar ve bitiş ölçütleri

| Faz | Teslim | Bitiş ölçütü |
|---|---|---|
| A — veri ve tercihler — TAMAMLANDI | Kapsam denetimi, teknik direktör profili, saklama ve veri adapter'i | Eksik/veri yok/gerçek sıfır ayrımı; profil kariyer/dal geçişi ve yeniden açılışta doğru. |
| B — ihtiyaç analizi — TAMAMLANDI | Diziliş, bağımsız rotasyon, kalite/yaş/sözleşme/erişilebilirlik | Ortak kapasite kısıtlı atama, bugünkü/gelecek senaryosu, gerekçeli saha ve veri eksikleri hazır; kaynakta doğrulanmamış kiralıklar koşullu. |
| C — ilk çalışan öneri sistemi — TAMAMLANDI | Rol/stil profilleri, aynı snapshot'tan üç amaçta adaylar, bireysel maliyet, karşılaştırma/izleme | Aynı OVR için stil değişiminde sıralama tersine dönüyor; genç/bugün katkı ayrımı ve kaynak/profil/revision koruması testli. Ortak bütçe Faz D'de. |
| D — kapsamlı transfer planı — KISMEN | Elle düzenlenen ortak bütçe, maaş, satış/alış/terfi ve diziliş senaryoları hazır | Açık Hesapla eylemiyle derinlik/bütçe yenilenir, sürümlü kayıt ve bayat kaynak koruması testli. Otomatik düşük harcama/dengeli/yüksek fayda paketleri, maliyet aralıkları ve paket fayda optimizasyonu açık. |
| E — kalibrasyon ve sağlamlaştırma | Gerçek kariyer kontrolleri, kapsam/performans/erişilebilirlik | Aşağıdaki kabul senaryoları ve tüm ilgili testler geçiyor; katsayılar sürümlü. |
| F — isteğe bağlı AI | Doğal dille tercih girme ve gerekçeli rapor anlatımı | İlk beş fazdan sonra ayrı kapsam. Onaylı veri paylaşımı, maliyet, API anahtarının yerelde saklanması; offline açıklamalar çalışmaya devam eder. |

AI fazında yapılandırılmış sonuç ve az sayıda aday özetini anlatan dil modeli düşünülebilir. Tam kariyer dosyası
ve tüm oyuncu verisi otomatik dışarı gönderilmez. Aday kimlikleri/sayılar doğrulanır; model motor puanını değiştiremez.
Kullanıcı cümlesinden çıkarılan profil uygulanmadan önce gösterilir. Bir AI sağlayıcısı veya ücretli servis şu anda seçilmiyor.

## Kabul senaryoları

- Önde baskı ve derinde karşılama profilleri aynı kadroya farklı, açıklanabilir aday sıralaması üretir.
- Tek çok mevkili oyuncu iki eşzamanlı yedek gibi sayılamaz; eksik kaleci ve çift stoper ayrı sınanır.
- 18 yaş yüksek POT ile hazır tecrübeli alternatifin sırası “hemen sonuç/genç proje” tercihine göre değişir.
- Yaşlı iyi oyuncu yalnız yaş yüzünden satış listesine atılmaz; tecrübe/kişilik uydurulmaz.
- Kaynakta maç/fitness/rol/maaş yoksa sıfır veya olumsuz veri sayılmaz; maliyetin bilinmediği görünür.
- Bir hafta sakatlık, uzun sakatlık, kiralık dönüş ve sezon sonu ayrılış farklı ihtiyaç ufukları üretir.
- Akademi terfisi ve kendi oyuncusunu başka yere kaydırma, transfer kadar ciddi alternatif olarak karşılaştırılır.
- İki ayrı uygun transferin toplamı bütçeyi aşıyorsa paket reddedilir; maaş ve bonservis ayrı kontrol edilir.
- Satış gerçekleşmediyse gelir koşullu kalır; satışla açılan yer yeniden hesaplanır.
- Fenerbahçe/Gençlerbirliği, ayrı dal ve export önizlemesi birbirine veri veya profil taşımaz.
- Aynı gün revision değişimi eski analizi yanlış biçimde güncel göstermiyor; silinmiş aday/boş sonuç düzgün karşılanıyor.
- 390 px, klavye/odak, hata/boş/yükleme hâli ve reduced-motion kontrolleri geçer.

Her uygulama fazında backend testleri, ilgili Python testleri ve Playwright çalışır; gerçek veri kontrolleri kayıt/DB
kopyalarında yapılır. Oyun kayıtlarına veya exporter'a bu özellik için yazılmaz. İlk plan tesliminde çalışma kodu değiştirilmedi;
sonraki Faz A uygulaması yukarıdaki teslim belgesinde kaydedildi.
