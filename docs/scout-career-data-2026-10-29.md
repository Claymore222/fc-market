# Scout filtreleri ve kariyer verileri — 29.10.2026

## Sonuç

2. madde tamamlandı: maaş aralığı, serbest/kulüplü, kalan sözleşme yılı, zayıf ayak ve beceri yıldızı,
rol +/++, oyun stili/+ ve ek mevkiler. URL, yenileme ve filtre temizleme desteklenir. Aynı listede OR,
farklı alanlarda AND uygulanır; eksik veri eşleşmez. Bekleyen sayı girişinin sonraki seçimleri silmesi de düzeltildi.

3. maddede kayıt formatından yeni alanlar çözüldü: geçmiş sezonlar, toplam menajer karnesi, iş güvencesi,
lig hedefi/durumu, sezonun 23 gelir-gider kategorisi. Son hareketler kategori toplamlarından ayrı, ortalanan
bir pencerede tür/yön/ay filtresiyle gösterilir. Kupa hedefleri/asgari başarı koşulları, menajer ücreti/kazançları
ve kariyerin en farklı galibiyeti henüz çözülmedi. Yeni alanlar data-dictionary'de **DOĞRULANACAK**.

## Kaynak ve kanıt

[CMTracker Fenerbahçe](https://cmtracker.net/alima19?ci=6ae1b64113da0aec07ed6e23), 17.07.2030 kaydı,
Home ekranı bilgisayar kontrolüyle okundu. Kayıt kopyası `scratch/saveimport/CmMgrC20261024175128313`:

| Sezon | O | G | B | M | Gol | Puan | Yönetim güveni |
|---|---:|---:|---:|---:|---|---:|---:|
| 2026/27 | 53 | 42 | 7 | 4 | 150:46 | 133 | 84 |
| 2027/28 | 54 | 29 | 13 | 12 | 92:52 | 100 | 47 |
| 2028/29 | 56 | 44 | 7 | 5 | 133:39 | 136 | 75 |
| 2029/30 | 52 | 33 | 12 | 7 | 94:50 | 111 | 74 |
| 2030/31, 17 Temmuz | 0 | 0 | 0 | 0 | 0:0 | 0 | 74 |

Toplam **215/148/39/28, 469:187** referansla aynı. 2028/29 puanı oyunda/CMT'de 136; 3G+B=139 diye
değiştirilmedi. 24 Temmuz güncel sezon 2/2/0/0 (4:0), toplam **217/150/39/28, 473:187**.
Lig hedefi 7=Ligi kazan, durumlar 0/1/2 güncel ve bitmiş sezonlarla karşılaştırıldı; kupa koşullarına genellenmedi.
Başlıktaki +10 kodu final lig sırası olarak kullanılmaz: 2028/29 kayıtta 2, referansta final sıra 1.
Bu nedenle arşivde lig sırası boş bırakıldı; maç/gol toplamları bundan bağımsızdır.

Finans 17 Temmuz: **43.432.480 € gelir / 48.687.237 € gider**; ×1,14 dönüşümle CMT'nin **49,5 M$ / 55,5 M$**
değerlerine uyuyor. Örneğin forma satışı 8.344.500 €, oyuncu maaşı 2.129.000 €, personel maaşı 105.738 €.
24 Temmuz: **47.661.655 € / 49.806.356 €**. Tür 0 ve 3'ün anlamı henüz adlandırılmadı; kod gösterilir.
Kaydın sınırlı son hareketlerinin toplamı sezon toplamı diye sunulmaz.

10 kopyada sezon yapısı ve 23 kategori tek aday olarak okundu. Gençlerbirliği 15/16/24 Ağustos güven değerleri
80/90/91; maç sayıları 3/4/5. Bozuk, kesik, aşırı metin uzunluğu, bilinmeyen takım, aritmetik tutarsızlık veya
birden çok aday olduğunda sezon okuyucu boş döner. Ayrıntılar `scratch/career-research/report.json`.

Önce incelenen [eafc-db-kit kariyer belgesi](https://github.com/ViniMacacari/eafc-db-kit/blob/main/docs/career-data.md)
yarışma/fikstür/istatistik yapısını açıklıyor; yeni sezon/finans düzeni yerel FC 27 kopyalarından bağımsız çözüldü.

## Salt-okunur doğrulama ve önizleme

Oyunun kayıtlarına ve `C:\FCExport\fc_career.db`'ye yazılmadı. Önizleme için SQLite `mode=ro` bağlantısının
backup API'siyle `scratch/career-research/preview.db` üretildi; yeni importer yalnız bu kopyada çalıştırıldı.
19 snapshot'ın kimliği, dalı, oyun/gözlem tarihleri ve 63 kaynak gözlemi aynen korundu. Kaynak DB'de yeni arşiv
tablosu hâlâ yok. Importer'ın sürüm yükseltmesi aynı kaydı tekrar eklemez; yalnız türetilmiş bloklar/revision yenilenir.
Uygulamanın kalıcı masaüstü çalıştırıcısı yeniden açıldığında mevcut kayıtları önce kopyalayıp yeni blok sürümünü işler.

Çalışan tarayıcı önizlemesi bu geçici DB kopyasına bağlıdır; oyun ilerlemesi otomatik izlenmez.
Normal kullanım komutu: `powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1`.

## Kontroller

- Backend: **158 geçti**. Yeni filtreler, bit 31/32/63, aynı rol üzerinde ++, eksik veri, ters aralık/400,
  sezon başına tek gözlem, başka dal ve gelecekteki maçın dışlanması, arşiv/toplam/güven/etiketler test edildi.
- Python saveimport: **29 geçti**; assets: **2 geçti**. Sürüm yükseltmesinde kimlik/tarih korunması,
  idempotans ve eski aynı-gün kaynağın yeni kaynağı ezmemesi dahil.
- Playwright: **25 geçti, 1 opt-in atlandı**; ayrıca gerçek veri testi **1 geçti**. Masaüstü/390 px,
  filtre birleşimi/yenileme, finans penceresi, kariyer/dal geçişi ve yeniden açılış kontrol edildi.
- 20.407 gerçek oyuncuda 11 filtre birleşimi bağımsız SQLite okumasıyla karşılaştırıldı: **0 fark**.
  Örnekler: 1.000–5.000 € maaş 9.699 oyuncu; birleşik serbest/yıldız/maaş 119; rol 33++ 5;
  Plase şut 487, yalnız Plase şut+ 7; ek mevkilerle RB 2.730.
- TypeScript/üretim derlemesi geçti; mevcut >500 kB paket uyarısı sürüyor.

Görseller ve veri raporları: `scratch/visual-parity/career-history.png`, `finance-history.png`,
`finance-history-mobile.png`, `advanced-scout-filters.png`, `scout-filter-check.json`.
